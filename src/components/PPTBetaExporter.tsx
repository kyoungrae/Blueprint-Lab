import React from 'react';
import pptxgen from "pptxgenjs";
import type { Screen, ScreenSection } from '../types/screenDesign';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useAuthStore } from '../store/authStore';
import { fetchWithAuth } from '../utils/fetchWithAuth';
import { getImageDisplayUrl } from '../utils/imageUrl';
import { mnDict as staticMnDict } from '../utils/translation';

const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api/projects').replace(/\/projects\/?$/, '');

function normalizeTranslationKey(text: string): string {
    return String(text ?? '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function buildNormalizedDictionary(dict: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(dict)) {
        const nk = normalizeTranslationKey(key);
        if (!nk || !value || normalized[nk]) continue;
        normalized[nk] = value;
    }
    return normalized;
}

/** OS/브라우저 다운로드에 안전한 파일명 조각 */
function sanitizePptxFileNameSegment(raw: string): string {
    const s = String(raw ?? '')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return s.slice(0, 120) || 'untitled';
}

/**
 * 선택된 화면이 속한 최상위 섹션 이름(여러 루트면 정렬 후 `_` 연결) + 다운로드 사용자 표시명
 */
function buildPptBetaDownloadFileName(
    selectedScreens: Screen[],
    sections: ScreenSection[],
    downloaderDisplayName: string
): string {
    const sectionById = new Map(sections.map((sec) => [sec.id, sec]));
    const sectionIdSet = new Set(sections.map((s) => s.id));

    const getRootSection = (startId: string | null | undefined): ScreenSection | null => {
        let sid: string | null | undefined = startId;
        const visited = new Set<string>();
        while (sid && sectionById.has(sid) && !visited.has(sid)) {
            visited.add(sid);
            const sec = sectionById.get(sid)!;
            const pid = sec.parentId;
            if (!pid || !sectionIdSet.has(pid)) return sec;
            sid = pid;
        }
        return null;
    };

    const rootLabels = new Set<string>();
    for (const screen of selectedScreens) {
        const root = getRootSection(screen.sectionId ?? undefined);
        if (root) {
            const label = (root.name ?? '').trim() || '섹션';
            rootLabels.add(label);
        }
    }

    const topPart =
        rootLabels.size === 0
            ? '화면설계'
            : rootLabels.size === 1
              ? [...rootLabels][0]
              : Array.from(rootLabels).sort().join('_');

    const userPart = sanitizePptxFileNameSegment(downloaderDisplayName || 'User');
    return `${sanitizePptxFileNameSegment(topPart)}_${userPart}.pptx`;
}

/** img 로드로 크기 추정 (실패 시 기본값) */
function measureImageUrl(url: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 100, h: img.naturalHeight || 100 });
        img.onerror = () => resolve({ w: 100, h: 100 });
        img.src = url;
    });
}

function svgStringFromDataUrl(dataUrl: string): string | null {
    try {
        const lower = dataUrl.toLowerCase();
        if (lower.startsWith('data:image/svg+xml;base64,')) {
            const b64 = dataUrl.slice('data:image/svg+xml;base64,'.length);
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        }
        const comma = dataUrl.indexOf(',');
        if (comma === -1) return null;
        const head = dataUrl.slice(0, comma).toLowerCase();
        if (!head.includes('image/svg+xml')) return null;
        const body = dataUrl.slice(comma + 1);
        return decodeURIComponent(body.replace(/\+/g, ' '));
    } catch {
        return null;
    }
}

async function rasterizeSvgToPngDataUrl(svgMarkup: string): Promise<{ data: string; w: number; h: number } | null> {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objUrl = URL.createObjectURL(blob);
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('svg'));
            i.src = objUrl;
        });
        let nw = img.naturalWidth;
        let nh = img.naturalHeight;
        if (!nw || !nh) {
            nw = 800;
            nh = 600;
        }
        const maxSide = 4096;
        const scale = nw > maxSide || nh > maxSide ? maxSide / Math.max(nw, nh) : 1;
        const cw = Math.max(1, Math.round(nw * scale));
        const ch = Math.max(1, Math.round(nh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, cw, ch);
        return { data: canvas.toDataURL('image/png'), w: nw, h: nh };
    } catch {
        return null;
    } finally {
        URL.revokeObjectURL(objUrl);
    }
}

/**
 * pptxgenjs는 SVG path를 Image로 읽을 때 자주 실패하므로 PNG data로 바꿉니다.
 * 그 외 URL은 화면과 동일하게 표시 URL로 정규화합니다.
 */
async function resolveImageForPpt(
    rawUrl: string,
    fetchAuth: typeof fetchWithAuth
): Promise<{ data?: string; path?: string; w: number; h: number } | null> {
    if (!rawUrl || rawUrl.length < 10) return null;

    if (rawUrl.startsWith('data:')) {
        const svgInline = svgStringFromDataUrl(rawUrl);
        if (svgInline) {
            const r = await rasterizeSvgToPngDataUrl(svgInline);
            return r ? { data: r.data, w: r.w, h: r.h } : null;
        }
        const dim = await measureImageUrl(rawUrl);
        return { data: rawUrl, w: dim.w, h: dim.h };
    }

    const resolved = getImageDisplayUrl(rawUrl);
    if (!resolved) return null;

    const noQuery = resolved.split('?')[0].toLowerCase();
    const rawNoQuery = rawUrl.split('?')[0].toLowerCase();
    const isSvg = noQuery.endsWith('.svg') || rawNoQuery.endsWith('.svg');

    if (isSvg) {
        try {
            const res = await fetchAuth(resolved);
            if (!res.ok) return null;
            const svgText = await res.text();
            const r = await rasterizeSvgToPngDataUrl(svgText);
            return r ? { data: r.data, w: r.w, h: r.h } : null;
        } catch {
            return null;
        }
    }

    const dim = await measureImageUrl(resolved);
    return { path: resolved, w: dim.w, h: dim.h };
}

interface PPTBetaExporterProps {
    screenIds: string[];
    projectId?: string;
    translateToMN?: boolean;
    /** 몽골어 보내기 시 좌측 캔버스(엔티티) 텍스트에만 적용. 100 = 기본, 50~200 권장 */
    mnPptFontScalePercent?: number;
    onComplete?: () => void;
    onError?: (error: string) => void;
}

const PPTBetaExporter: React.FC<PPTBetaExporterProps> = ({
    screenIds,
    projectId,
    translateToMN = false,
    mnPptFontScalePercent = 100,
    onComplete,
    onError
}) => {
    const screenIdsKey = React.useMemo(() => [...screenIds].sort().join(','), [screenIds]);
    const exportCallbacksRef = React.useRef({ onComplete, onError });
    exportCallbacksRef.current = { onComplete, onError };

    const downloaderDisplayName = useAuthStore(
        (s) => s.user?.name?.trim() || s.user?.email?.split('@')[0]?.trim() || ''
    );

    React.useEffect(() => {
        const staticNormalizedDict = buildNormalizedDictionary(staticMnDict as Record<string, string>);

        const logPptExport = async () => {
            if (!projectId || projectId.startsWith('local_')) return;
            try {
                await fetchWithAuth(`${API_ROOT}/projects/${projectId}/access-log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind: 'EXPORT_PPT' }),
                });
            } catch {
                // 내보내기 완료 흐름은 유지
            }
        };

        let tr = (text: string, isMn: boolean): string => {
            if (!isMn || !text) return text;
            return staticMnDict[text] ?? text;
        };

        const exportLayoutToPPT = async (
            selectedScreens: Screen[],
            externalPptx?: pptxgen,
            sectionTitle?: string,
            downloadFileName?: string
        ) => {
            const pptx = externalPptx || new pptxgen();
            
            // PPT 텍스트 크기 비율 전역 상수 - 모든 요소에 동일하게 적용
            // 캔버스 내 도형·표 텍스트 일괄 스케일 (헤더는 baseFs 고정 pt로 별도 조정)
            const PPT_FONT_SCALE_RATIO = 60;
            const PPT_FONT_MIN_SIZE = 4;
            const baseFs = (pt: number, floor: number = PPT_FONT_MIN_SIZE) => Math.max(floor, pt);
            const mnCanvasMul = translateToMN
                ? Math.max(0.5, Math.min(3, (mnPptFontScalePercent ?? 100) / 100))
                : 1;
            const canvasFs = (pt: number, floor: number = PPT_FONT_MIN_SIZE) => Math.max(floor, pt * mnCanvasMul);

            for (const screen of selectedScreens) {
                const canvasW = screen.imageWidth || 800;
                const canvasH = 770;
                const ADJUSTED_HEADER_H = 130; 
                
                const totalEntityW = Math.ceil(canvasW / 0.7); 
                const totalEntityH = canvasH + ADJUSTED_HEADER_H;

                const slideWidth = 10; 
                const scale = slideWidth / totalEntityW; 
                const slideHeight = totalEntityH * scale;

                const layoutName = `LAYOUT_${screen.id}`;
                pptx.defineLayout({ name: layoutName, width: slideWidth, height: slideHeight });

                // @ts-ignore - pptxgenjs typing may not expose masterName, but runtime supports it
                const slide = pptx.addSlide({ masterName: layoutName, sectionTitle: sectionTitle });

                const hH = ADJUSTED_HEADER_H * scale;
                const rH = hH / 3;
                const leftW = slideWidth * 0.7;
                const rightW = slideWidth * 0.3;
                const cW = leftW / 6;

                // pptxgenjs는 6자리 대문자 헥스(FFFFFF)만 색상으로 인식한다.
                // 'white'/'#fff'/'rgba(...)' 등 어떤 표기든 6자리 헥스로 정규화하고,
                // 끝까지 유효하지 않으면 undefined를 돌려서 호출부의 fallback 체인이 자연스럽게 동작하게 한다.
                // ('000000' 강제 반환을 하면 fallback이 끊겨 의도치 않은 검정/회색이 박힌다.)
                const NAMED_COLOR_HEX: Record<string, string> = {
                    white: 'FFFFFF', black: '000000',
                    red: 'FF0000', green: '008000', blue: '0000FF',
                    yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF',
                    gray: '808080', grey: '808080', silver: 'C0C0C0',
                    orange: 'FFA500', pink: 'FFC0CB', purple: '800080',
                    brown: 'A52A2A', navy: '000080', teal: '008080',
                };
                const rgbToHex = (rgb?: string): string | undefined => {
                    if (!rgb) return undefined;
                    const trimmed = String(rgb).trim();
                    if (!trimmed) return undefined;
                    const named = NAMED_COLOR_HEX[trimmed.toLowerCase()];
                    if (named) return named;
                    const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
                    if (match) {
                        return [match[1], match[2], match[3]]
                            .map((x) => parseInt(x, 10).toString(16).padStart(2, '0'))
                            .join('')
                            .toUpperCase();
                    }
                    let hex = trimmed.replace(/#/g, '');
                    if (hex.length === 3) {
                        hex = hex.split('').map((c) => c + c).join('');
                    } else if (hex.length === 4) {
                        hex = hex.substring(0, 3).split('').map((c) => c + c).join('');
                    } else if (hex.length === 8) {
                        hex = hex.substring(0, 6);
                    }
                    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
                    return hex.toUpperCase();
                };

                // 🚀 스타일 추출, 태그 제거 및 줄바꿈(\n) 처리를 위한 확장된 헬퍼 함수
                const parseStyles = (
                    html: string
                ): {
                    text: string;
                    options: {
                        bold?: boolean;
                        italic?: boolean;
                        underline?: boolean;
                        fontFace?: string;
                        color?: string;
                        fontSizePx?: number;
                        align?: 'left' | 'center' | 'right' | 'justify';
                        valign?: 'top' | 'middle' | 'bottom';
                    };
                } => {
                    if (!html) return { text: "", options: {} };
                    

                    // 1. 색상 추출
                    // - 텍스트 색만 뽑아야 하므로 background-color / border-color 같은 `-color`로 끝나는
                    //   속성은 첫 lookbehind(`(?:^|[^a-zA-Z-])`)로 배제한다.
                    // - <font color="…">는 `<font` 안의 속성만 잡아 다른 태그의 동명 속성과 충돌하지 않게 한다.
                    // - 3자리 축약(#fff)·8자리(#RRGGBBAA)·rgba 등은 rgbToHex로 6자리 헥스로 정규화한다.
                    const colorMatch =
                        html.match(/(?:^|[^a-zA-Z-])color:\s*([^;"]+)/i) ||
                        html.match(/<font[^>]+color="([^"]+)"/i);
                    let color: string | undefined;
                    if (colorMatch) {
                        const rawColor = colorMatch[1].trim();
                        color = rgbToHex(rawColor);
                    }

                    // 2. 폰트 크기 추출 (font-size: 16px)
                    const sizeMatch = html.match(/font-size:\s*(\d+)px/i);
                    const fontSizePx = sizeMatch ? parseInt(sizeMatch[1], 10) : 16;

                    // 3. 기본 스타일 속성 감지 (+ inline style)
                    const isBold = /<b[^>]*>|<strong>|font-weight:\s*bold/i.test(html);
                    const isItalic = /<i[^>]*>|<em>|font-style:\s*italic/i.test(html);
                    const isUnderline = /<u[^>]*>|text-decoration:\s*underline/i.test(html);

                    const fontFaceMatch = html.match(/face="([^"]+)"/i) || html.match(/font-family:\s*([^;,]+)/i);
                    const fontFace = fontFaceMatch ? fontFaceMatch[1].trim() : "맑은 고딕";

                    // 정렬 속성: WYSIWYG 에디터마다 표기가 다르다.
                    // ① inline style: text-align / vertical-align
                    // ② class: ql-align-left, align-center 등 (Quill·기타 에디터)
                    // ③ HTML 속성: <p align="right">, <td valign="top">
                    const alignMatch =
                        html.match(/text-align:\s*(left|center|right|justify)/i) ||
                        html.match(/class="[^"]*align-(left|center|right|justify)[^"]*"/i) ||
                        html.match(/\salign="(left|center|right|justify)"/i);
                    const align = alignMatch
                        ? (alignMatch[1].toLowerCase() as 'left' | 'center' | 'right' | 'justify')
                        : undefined;
                    const valignMatch =
                        html.match(/vertical-align:\s*(top|middle|bottom)/i) ||
                        html.match(/\svalign="(top|middle|bottom)"/i);
                    const valign = valignMatch
                        ? (valignMatch[1].toLowerCase() as 'top' | 'middle' | 'bottom')
                        : undefined;

                    // 2. 🚀 줄바꿈 태그를 PPT용 개행 문자(\n)로 변환
                    let processedText = html.replace(/<br\s*\/?>/gi, "\n");
                    processedText = processedText.replace(/<\/p>|<\/div>/gi, "\n");

                    // 3. 나머지 모든 HTML 태그 제거
                    let cleanText = processedText.replace(/<\/?[^>]+(>|$)/g, "");

                    // 4. 🚀 HTML 특수 문자 디코딩
                    cleanText = cleanText
                        .replace(/&nbsp;/g, " ")
                        .replace(/&amp;/g, "&")
                        .replace(/&lt;/g, "<")
                        .replace(/&gt;/g, ">")
                        .replace(/&quot;/g, "\"")
                        .replace(/&#39;/g, "'");

                    // 5. 끝에 불필요하게 남은 빈 줄바꿈 제거
                    cleanText = cleanText.replace(/\n+$/, "");

                    const options: {
                        bold: boolean;
                        italic: boolean;
                        underline: boolean;
                        fontFace: string;
                        color?: string;
                        fontSizePx: number;
                        align?: 'left' | 'center' | 'right' | 'justify';
                        valign?: 'top' | 'middle' | 'bottom';
                    } = {
                        bold: isBold,
                        italic: isItalic,
                        underline: isUnderline,
                        fontFace,
                        fontSizePx,
                    };
                    if (color !== undefined) options.color = color;
                    if (align !== undefined) options.align = align;
                    if (valign !== undefined) options.valign = valign;

                    return { text: cleanText, options };
                };

                // --- 데이터 매핑용 맵 생성 ---
                const textMap: Record<string, string> = {
                    "0,0": tr('시스템명', translateToMN),
                    "0,1": screen.systemName || '',
                    "0,2": tr('작성자', translateToMN),
                    "0,3": screen.author || '',
                    "0,4": tr('작성일자', translateToMN),
                    "0,5": screen.createdDate || '',
                    "1,0": tr('화면ID', translateToMN),
                    "1,1": screen.screenId || '',
                    "1,2": tr('화면유형', translateToMN),
                    "1,3": screen.screenType || '',
                    "1,4": tr('페이지', translateToMN),
                    "1,5": screen.page || '',
                    "2,0": tr('화면설명', translateToMN),
                    "2,1": screen.screenDescription || tr('화면에 대한 구체적인 설명을 입력하세요', translateToMN)
                };

                // ─── 상단 헤더 영역 (좌측 캔버스 너비만; 우측은 Right Pane이 위로 이어짐) ───
                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: 0, w: leftW, h: hH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 1 }
                });

                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 6; c++) {
                        const isLabel = (r === 0 && (c === 0 || c === 2 || c === 4)) ||
                                        (r === 1 && (c === 0 || c === 2 || c === 4)) ||
                                        (r === 2 && c === 0);

                        const textKey = `${r},${c}`;
                        const content = textMap[textKey] || '';

                        // 🚀 '화면설명' 데이터 칸 (Row 2, Col 1~5) 병합
                        if (r === 2 && c >= 1) {
                            if (c === 1) {
                                slide.addShape(pptx.ShapeType.rect, {
                                    x: c * cW, y: r * rH, w: cW * 5, h: rH,
                                    fill: { color: "FFFFFF" },
                                    line: { color: "E2E8F0", width: 1 }
                                });
                                // 화면설명 내용 추가 (왼쪽 정렬)
                                const { text, options: styleOpts } = parseStyles(textMap["2,1"]);
                                slide.addText(tr(text, translateToMN), {
                                    x: c * cW, y: r * rH, w: cW * 5, h: rH,
                                    align: 'left', valign: 'middle',
                                    fontSize: baseFs(6.5), color: '94A3B8',
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    breakLine: true,
                                });
                            }
                            continue;
                        }

                        // 일반 칸(도형) 생성
                        slide.addShape(pptx.ShapeType.rect, {
                            x: c * cW, y: r * rH, w: cW, h: rH,
                            fill: { color: isLabel ? "2C3E7C" : "FFFFFF" },
                            line: { color: "E2E8F0", width: 1 }
                        });

                        // 텍스트 추가
                        if (content) {
                            const { text, options: styleOpts } = parseStyles(content);
                            slide.addText(tr(text, translateToMN), {
                                x: c * cW, y: r * rH, w: cW, h: rH,
                                align: 'center', valign: 'middle',
                                fontSize: baseFs(isLabel ? 6 : 6.5),
                                color: isLabel ? 'FFFFFF' : '1E293B',
                                bold: styleOpts?.bold,
                                italic: styleOpts?.italic,
                                underline: styleOpts?.underline as any,
                                fontFace: styleOpts?.fontFace,
                                breakLine: true,
                            });
                        }
                    }
                }

                // ─── 하단 본문 영역 ───
                const bodyY = hH;
                const bodyH = slideHeight - hH;

                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: bodyY, w: leftW, h: bodyH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                // 우측 패널: 슬라이드 상단(y:0)부터 전체 높이까지 (헤더 위 우측 공간 포함)
                slide.addShape(pptx.ShapeType.rect, {
                    x: leftW, y: 0, w: rightW, h: slideHeight,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                const ratios = screen.rightPaneRatios || [40, 35, 25];
                const titleH = 26 * scale; 
                const titles = [
                    tr('초기화면설정', translateToMN),
                    tr('기능상세', translateToMN),
                    tr('관련테이블', translateToMN),
                ];
                
                // 🚀 섹션별 실제 데이터 매핑 수정
                const funcNoDetails = (screen.drawElements || [])
                    .filter(el => el.type === 'func-no')
                    .sort((a, b) => {
                        const aNum = parseFloat((a.text || '0').replace('-', '.'));
                        const bNum = parseFloat((b.text || '0').replace('-', '.'));
                        return aNum - bNum;
                    })
                    .map(el => {
                        // 🚀 기능 설명에 포함된 HTML 태그를 제거하고 텍스트만 추출
                        const { text: cleanDesc } = parseStyles(el.description || (el as any).desc || '');
                        return `[${tr(String(el.text || '').trim(), translateToMN)}] ${tr(cleanDesc, translateToMN)}`;
                    })
                    .join('\n');

                const combinedFunctionDetails = [funcNoDetails, screen.functionDetails]
                    .filter(Boolean)
                    .join('\n\n');

                const sectionContents = [
                    screen.initialSettings || '',
                    combinedFunctionDetails || '',
                    screen.relatedTables || ''
                ];
                
                let currentY = 0;
                ratios.forEach((ratioVal, idx) => {
                    const sectionH = (slideHeight * ratioVal) / 100;
                    const sectionColor = idx === 2 ? "5E6B7C" : "5C6B9E";
                    
                    // 1. 섹션 타이틀 바 배경
                    slide.addShape(pptx.ShapeType.rect, {
                        x: leftW, y: currentY, w: rightW, h: titleH,
                        fill: { color: sectionColor }
                    });

                    // 2. 섹션 제목 텍스트 (흰색 Bold)
                    slide.addText(titles[idx], {
                        x: leftW, y: currentY, w: rightW, h: titleH,
                        align: 'left', valign: 'middle',
                        fontSize: baseFs(8.5), color: 'FFFFFF', bold: true,
                        inset: 0.15,
                    });

                    // 3. 🚀 섹션 본문 렌더링 (기능상세는 아이콘으로 그림)
                    if (idx === 1) { // 기능상세 영역
                        const funcNoElements = (screen.drawElements || [])
                            .filter(el => el.type === 'func-no')
                            .sort((a, b) => {
                                const aNum = parseFloat((a.text || '0').replace('-', '.'));
                                const bNum = parseFloat((b.text || '0').replace('-', '.'));
                                return aNum - bNum;
                            });

                        let itemOffset = 0.1; // 첫 항목 여백
                        funcNoElements.forEach(el => {
                            const itemY = currentY + titleH + itemOffset;
                            const { text: cleanDesc } = parseStyles(el.description || (el as any).desc || '');
                            
                            // 🔴 기능 번호 빨간 원 그리기
                            slide.addShape(pptx.ShapeType.ellipse, {
                                x: leftW + 0.1, y: itemY, w: 0.16, h: 0.16,
                                fill: { color: 'EF4444' }
                            });
                            // ⚪ 원 안의 숫자 텍스트
                            slide.addText(tr(String(el.text || '').trim(), translateToMN), {
                                x: leftW + 0.1, y: itemY, w: 0.16, h: 0.16,
                                align: 'center', valign: 'middle',
                                fontSize: baseFs(6), color: 'FFFFFF', bold: true
                            });
                            // 📝 상세 설명 텍스트 (아이콘 옆 배치)
                            slide.addText(tr(cleanDesc, translateToMN), {
                                x: leftW + 0.32, y: itemY, w: rightW - 0.45, h: 0.16,
                                align: 'left', valign: 'middle',
                                fontSize: baseFs(5), color: '334155'
                            });

                            itemOffset += 0.22; // 다음 줄 간격
                        });

                        // 원본 기능상세(functionDetails) 텍스트가 있으면 추가 렌더링
                        if (screen.functionDetails) {
                            const { text: cleanFuncText } = parseStyles(screen.functionDetails);
                            slide.addText(tr(cleanFuncText, translateToMN), {
                                x: leftW + 0.1, y: currentY + titleH + itemOffset, 
                                w: rightW - 0.2, h: 0.2,
                                align: 'left', valign: 'top',
                                fontSize: baseFs(7.5), color: '334155'
                            });
                        }
                    } else {
                        // 초기화면설정(0), 관련테이블(2) 영역은 기존 텍스트 방식 유지
                        const content = sectionContents[idx];
                        if (content) {
                            const { text: cleanText } = parseStyles(content);
                            slide.addText(tr(cleanText, translateToMN), {
                                x: leftW + 0.1, 
                                y: currentY + titleH + 0.05, 
                                w: rightW - 0.2, 
                                h: sectionH - titleH - 0.1,
                                align: 'left', valign: 'top', 
                                fontSize: baseFs(5.5), color: '334155', 
                                breakLine: true, inset: 0.05
                            });
                        }
                    }

                    currentY += sectionH;
                });

                // 🚀 색상 정제 함수 보완 (투명도 체크 강화)
                const cleanColor = (c?: string) => {
                    if (!c || c === 'transparent' || c === 'rgba(0,0,0,0)' || c === '#00000000') return undefined;
                    return rgbToHex(c);
                };

                // ─── 좌측 캔버스 UI 요소 매핑 ───
                const sortedElements = [...(screen.drawElements || [])].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

                for (const el of sortedElements) {
                    const elX = el.x * scale;
                    const elY = bodyY + (el.y * scale);
                    const elW = (el.width || 10) * scale;
                    const elH = (el.height || 10) * scale;

                    // 🚀 2. fillOptions 생성 로직 수정
                    const cleanedFill = cleanColor(el.fill);
                    const fillOptions = cleanedFill ? { 
                        color: cleanedFill, 
                        transparency: el.fillOpacity !== undefined ? (1 - el.fillOpacity) * 100 : 0 
                    } : { color: 'FFFFFF', transparency: 100 }; // 🚀 투명 컨테이너 검은색 박스 방지

                    const cleanedStroke = cleanColor(el.stroke);
                    const lineOptions = cleanedStroke ? { 
                        color: cleanedStroke, 
                        width: (el.strokeWidth || 1) * scale * 72,
                        dashType: (el.strokeStyle === 'dashed' ? 'dash' : el.strokeStyle === 'dotted' ? 'sysDot' : 'solid') as any
                    } : undefined;

                    switch (el.type) {
                        case 'rect': {
                            const r0 = el.borderRadius ?? 0;
                            const rMax = Math.max(
                                r0,
                                el.borderRadiusTopLeft ?? 0,
                                el.borderRadiusTopRight ?? 0,
                                el.borderRadiusBottomRight ?? 0,
                                el.borderRadiusBottomLeft ?? 0
                            );
                            const shapeType = rMax > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
                            const rectRadius = rMax > 0 ? (rMax * scale * 1) : undefined;
                            slide.addShape(shapeType, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rectRadius: rectRadius,
                                rotate: el.rotation || 0,
                            });
                            if (el.text) {
                                const { text: cleanText, options: styleOpts } = parseStyles(el.text);
                                slide.addText(tr(cleanText, translateToMN), {
                                    x: elX, y: elY, w: elW, h: elH,
                                    // 웹 캔버스의 rect 텍스트 기본 정렬은 좌측이므로 PPT도 동일하게 맞춘다.
                                    align: (styleOpts?.align || el.textAlign || 'left') as any,
                                    valign: (styleOpts?.valign || el.verticalAlign || 'middle') as any,
                                    fontSize: canvasFs((el.fontSize ?? styleOpts?.fontSizePx ?? 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor((el as any).textColor) || cleanColor((el as any).fontColor) || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                    inset: 0,
                                    wrap: false,
                                    shrinkText: true,
                                });
                            }
                            break;
                        }
                        case 'circle':
                            slide.addShape(pptx.ShapeType.ellipse, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rotate: el.rotation || 0,
                            });
                            if (el.text) {
                                const { text: cleanText, options: styleOpts } = parseStyles(el.text);
                                slide.addText(tr(cleanText, translateToMN), {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (styleOpts?.align || el.textAlign || 'center') as any,
                                    valign: (styleOpts?.valign || el.verticalAlign || 'middle') as any,
                                    fontSize: canvasFs((el.fontSize ?? styleOpts?.fontSizePx ?? 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor((el as any).textColor) || cleanColor((el as any).fontColor) || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                    inset: 0,
                                    wrap: false,
                                    shrinkText: true,
                                });
                            }
                            break;
                        case 'text':
                            if (el.text) {
                                const { text, options: styleOpts } = parseStyles(el.text);
                                slide.addText(tr(text, translateToMN), {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (styleOpts?.align || el.textAlign || 'left') as 'left' | 'center' | 'right',
                                    valign: (styleOpts?.valign || el.verticalAlign || 'middle') as 'top' | 'middle' | 'bottom',
                                    fontSize: canvasFs((el.fontSize ?? styleOpts?.fontSizePx ?? 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor((el as any).textColor) || cleanColor((el as any).fontColor) || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: (styleOpts?.underline ?? false) as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                    inset: 0,
                                    wrap: false,
                                    shrinkText: true,
                                });
                            }
                            break;
                        case 'func-no':
                            slide.addShape(pptx.ShapeType.ellipse, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: { color: cleanColor(el.fill || 'EF4444') },
                            });
                            slide.addText(tr(String(el.text || '').trim(), translateToMN), {
                                x: elX, y: elY, w: elW, h: elH,
                                align: 'center', valign: 'middle',
                                fontSize: canvasFs((el.fontSize || 10) * scale * PPT_FONT_SCALE_RATIO),
                                color: 'FFFFFF',
                                bold: true,
                                inset: 0,
                                wrap: false,
                                shrinkText: true,
                            });
                            break;
                        case 'table': {
                            const tRows = el.tableRows || 1;
                            const tCols = el.tableCols || 1;
                            const cellDataV2 = (el.tableCellDataV2 || []) as any;
                            const cellStyles = ((el as any).tableCellStyles || []) as any;
                            const fallbackData = ((el as any).tableCellData || []) as any;
                            const cellSpans = ((el as any).tableCellSpans || []) as any;
                            const cellColors = ((el as any).tableCellColors || []) as any;

                            const TABLE_CELL_INSET = 0.02;

                            /** pptxgenjs 셀/표 border: [상, 우, 하, 좌] 각각 pt/color/type */
                            const resolveBorder = (
                                specificColor: any,
                                specificWidth: any,
                                specificStyle: any,
                                generalColor: any,
                                generalWidth: any,
                                generalStyle: any,
                                fallbackColor: string
                            ): { pt: number; color?: string; type?: 'solid' | 'dash' | 'sysDot' } => {
                                const style = specificStyle || generalStyle || 'solid';
                                if (style === 'none' || style === 'hidden') return { pt: 0 };

                                let widthRaw = specificWidth ?? generalWidth;
                                let width = typeof widthRaw === 'number' ? widthRaw : parseFloat(String(widthRaw));
                                if (Number.isNaN(width)) width = 0;

                                if (width <= 0) return { pt: 0 };

                                const color =
                                    cleanColor(specificColor || generalColor) || cleanColor(fallbackColor);
                                if (!color) return { pt: 0 };

                                let borderType: 'solid' | 'dash' | 'sysDot' = 'solid';
                                if (style === 'dashed') borderType = 'dash';
                                else if (style === 'dotted') borderType = 'sysDot';

                                return {
                                    pt: Math.max(0.25, width * 0.5),
                                    color,
                                    type: borderType,
                                };
                            };

                            let finalColWidths: number[] = [];
                            const rawColWidths = Array.isArray((el as any).tableColWidths)
                                ? ((el as any).tableColWidths as number[])
                                : [];
                            if (rawColWidths.length === tCols) {
                                const sumRawW = rawColWidths.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
                                finalColWidths = rawColWidths.map((w) =>
                                    ((Number.isFinite(w) ? w : 0) / (sumRawW || 1)) * elW
                                );
                            } else {
                                finalColWidths = Array.from({ length: tCols }, () => elW / tCols);
                            }

                            // 빈 셀만 있는 레이아웃 표가 pptxgen에서 높이 0으로 수축되는 것 방지: elH에 비율 맞춰 행 높이 분배
                            let finalRowHeights: number[] = [];
                            const rawRowHeights = Array.isArray((el as any).tableRowHeights)
                                ? ((el as any).tableRowHeights as number[])
                                : [];
                            if (rawRowHeights.length === tRows) {
                                const sumRawH = rawRowHeights.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
                                finalRowHeights = rawRowHeights.map((h) =>
                                    ((Number.isFinite(h) ? h : 0) / (sumRawH || 1)) * elH
                                );
                            } else {
                                finalRowHeights = Array.from({ length: tRows }, () => elH / tRows);
                            }

                            const genHColor =
                                el.tableBorderInsideH || el.stroke || '#cbd5e1';
                            const genHWidth = el.tableBorderInsideHWidth ?? el.strokeWidth ?? 1;
                            const genHStyle = el.tableBorderInsideHStyle || el.strokeStyle || 'solid';
                            const genVColor =
                                el.tableBorderInsideV || el.stroke || '#cbd5e1';
                            const genVWidth = el.tableBorderInsideVWidth ?? el.strokeWidth ?? 1;
                            const genVStyle = el.tableBorderInsideVStyle || el.strokeStyle || 'solid';

                            const tableRows: any[][] = [];
                            for (let r = 0; r < tRows; r++) {
                                const row: any[] = [];
                                let c = 0;
                                while (c < tCols) {
                                    const index = r * tCols + c;

                                    const cellV2 = Array.isArray(cellDataV2) ? cellDataV2[index] : undefined;
                                    const cellStyle = Array.isArray(cellStyles) ? cellStyles[index] : undefined;
                                    const fallback = Array.isArray(fallbackData) ? fallbackData[index] : undefined;
                                    const cellSpan = Array.isArray(cellSpans) ? cellSpans[index] : undefined;
                                    const cellColor = Array.isArray(cellColors) ? cellColors[index] : undefined;

                                    const rawContent =
                                        (cellV2 as any)?.content ?? (cellV2 as any)?.text ?? fallback ?? '';
                                    const { text, options: s } = parseStyles(String(rawContent));
                                    const cellInlineStyle = (cellV2 as any)?.style || {};
                                    const cStyle = (cellStyle as any) || {};

                                    const isHeaderRow = r === 0;
                                    const finalColor =
                                        cleanColor(
                                            cStyle.color ||
                                                cellInlineStyle.color ||
                                                s.color ||
                                                el.color ||
                                                (isHeaderRow ? '#2c3e7c' : '#333333')
                                        ) || (isHeaderRow ? '2C3E7C' : '333333');
                                    const finalFontSizePx =
                                        cStyle.fontSize ??
                                        el.fontSize ??
                                        cellInlineStyle.fontSize ??
                                        s.fontSizePx ??
                                        12;
                                    const finalFontFace =
                                        cellInlineStyle.fontFamily ||
                                        cStyle.fontFamily ||
                                        el.fontFamily ||
                                        s.fontFace ||
                                        'Pretendard';

                                    const isBold =
                                        cStyle.fontWeight === 'bold' ||
                                        s.bold ||
                                        (isHeaderRow && !cellColor);
                                    const isItalic = cStyle.fontStyle === 'italic' || s.italic;
                                    const isUnderline =
                                        cStyle.textDecoration === 'underline' || s.underline;

                                    const colspan = (cellSpan as any)?.colSpan || (cellV2 as any)?.colSpan || 1;
                                    const rowspan = (cellSpan as any)?.rowSpan || (cellV2 as any)?.rowSpan || 1;

                                    const isMerged = (cellV2 as any)?.isMerged;
                                    if (!isMerged) {
                                        const rawBgColor =
                                            cellColor ||
                                            cStyle.backgroundColor ||
                                            cellInlineStyle.backgroundColor ||
                                            (cellV2 as any)?.style?.backgroundColor ||
                                            el.fill ||
                                            (isHeaderRow ? '#f1f5f9' : 'transparent');
                                        const cleanedBgColor = cleanColor(rawBgColor);
                                        const cellFill = cleanedBgColor
                                            ? { color: cleanedBgColor }
                                            : { color: 'FFFFFF', transparency: 100 };

                                        // 셀 4면: borderTop 등은 앱에서 색(hex)으로 저장되는 경우가 많음 → *Color / * 키 모두 시도
                                        const bTop = resolveBorder(
                                            cStyle.borderTopColor ||
                                                cellInlineStyle.borderTopColor ||
                                                cStyle.borderTop ||
                                                cellInlineStyle.borderTop,
                                            cStyle.borderTopWidth ?? cellInlineStyle.borderTopWidth,
                                            cStyle.borderTopStyle || cellInlineStyle.borderTopStyle,
                                            r === 0 ? el.tableBorderTop || genHColor : genHColor,
                                            r === 0 ? el.tableBorderTopWidth ?? genHWidth : genHWidth,
                                            r === 0 ? el.tableBorderTopStyle ?? genHStyle : genHStyle,
                                            '#CBD5E1'
                                        );
                                        const bRight = resolveBorder(
                                            cStyle.borderRightColor ||
                                                cellInlineStyle.borderRightColor ||
                                                cStyle.borderRight ||
                                                cellInlineStyle.borderRight,
                                            cStyle.borderRightWidth ?? cellInlineStyle.borderRightWidth,
                                            cStyle.borderRightStyle || cellInlineStyle.borderRightStyle,
                                            c + colspan >= tCols ? el.tableBorderRight || genVColor : genVColor,
                                            c + colspan >= tCols
                                                ? el.tableBorderRightWidth ?? genVWidth
                                                : genVWidth,
                                            c + colspan >= tCols
                                                ? el.tableBorderRightStyle ?? genVStyle
                                                : genVStyle,
                                            '#CBD5E1'
                                        );
                                        const bBottom = resolveBorder(
                                            cStyle.borderBottomColor ||
                                                cellInlineStyle.borderBottomColor ||
                                                cStyle.borderBottom ||
                                                cellInlineStyle.borderBottom,
                                            cStyle.borderBottomWidth ?? cellInlineStyle.borderBottomWidth,
                                            cStyle.borderBottomStyle || cellInlineStyle.borderBottomStyle,
                                            r + rowspan >= tRows ? el.tableBorderBottom || genHColor : genHColor,
                                            r + rowspan >= tRows
                                                ? el.tableBorderBottomWidth ?? genHWidth
                                                : genHWidth,
                                            r + rowspan >= tRows
                                                ? el.tableBorderBottomStyle ?? genHStyle
                                                : genHStyle,
                                            '#CBD5E1'
                                        );
                                        const bLeft = resolveBorder(
                                            cStyle.borderLeftColor ||
                                                cellInlineStyle.borderLeftColor ||
                                                cStyle.borderLeft ||
                                                cellInlineStyle.borderLeft,
                                            cStyle.borderLeftWidth ?? cellInlineStyle.borderLeftWidth,
                                            cStyle.borderLeftStyle || cellInlineStyle.borderLeftStyle,
                                            c === 0 ? el.tableBorderLeft || genVColor : genVColor,
                                            c === 0 ? el.tableBorderLeftWidth ?? genVWidth : genVWidth,
                                            c === 0 ? el.tableBorderLeftStyle ?? genVStyle : genVStyle,
                                            '#CBD5E1'
                                        );

                                        const cellAlign =
                                            cellInlineStyle.textAlign ||
                                            cStyle.textAlign ||
                                            s.align ||
                                            'center';
                                        const cellValign =
                                            cellInlineStyle.verticalAlign ||
                                            cStyle.verticalAlign ||
                                            s.valign ||
                                            'middle';

                                        row.push({
                                            text: tr(text || '', translateToMN),
                                            options: {
                                                fill: cellFill,
                                                color: finalColor,
                                                align: cellAlign as any,
                                                valign: cellValign as any,
                                                fontSize: canvasFs(
                                                    finalFontSizePx * scale * PPT_FONT_SCALE_RATIO
                                                ),
                                                inset: TABLE_CELL_INSET,
                                                breakLine: false,
                                                wrap: true,
                                                shrinkText: true,
                                                autoFit: true,
                                                border: [bTop, bRight, bBottom, bLeft],
                                                bold: isBold,
                                                italic: isItalic,
                                                underline: (isUnderline ?? false) as any,
                                                fontFace: finalFontFace,
                                                rowspan: rowspan > 1 ? rowspan : undefined,
                                                colspan: colspan > 1 ? colspan : undefined,
                                            },
                                        });
                                    }
                                    c += colspan;
                                }
                                if (row.length > 0) tableRows.push(row);
                            }

                            const tGenColor = el.stroke;
                            const tGenWidth = el.strokeWidth ?? 1;
                            const tGenStyle = el.strokeStyle || 'solid';

                            const getOuter = (side: 'Top' | 'Right' | 'Bottom' | 'Left') => {
                                const e = el as any;
                                return resolveBorder(
                                    e[`tableBorder${side}`],
                                    e[`tableBorder${side}Width`],
                                    e[`tableBorder${side}Style`],
                                    tGenColor,
                                    tGenWidth,
                                    tGenStyle,
                                    '#CBD5E1'
                                );
                            };

                            const tableBorderOption = [
                                getOuter('Top'),
                                getOuter('Right'),
                                getOuter('Bottom'),
                                getOuter('Left'),
                            ] as [any, any, any, any];

                            const tableProps: any = {
                                x: elX,
                                y: elY,
                                w: elW,
                                h: elH,
                                colW: finalColWidths,
                                rowH: finalRowHeights,
                                border: tableBorderOption,
                                autoPage: false,
                                margin: 0,
                            };

                            // @ts-ignore pptxgenjs table typing
                            slide.addTable(tableRows, tableProps);
                            break;
                        }
                        case 'line': {
                            // 색·두께가 명확할 때만 그린다. (투명/0이면 화면에도 없으므로 PPT에도 생략)
                            const rawLineColor = cleanColor(el.stroke);
                            if (!rawLineColor) break;
                            const lineStrokeWidth = el.strokeWidth ?? 1;
                            if (lineStrokeWidth <= 0) break;

                            const arrowProps: any = {
                                color: rawLineColor,
                                width: lineStrokeWidth * scale * 72,
                                dashType: (el.strokeStyle === 'dashed'
                                    ? 'dash'
                                    : el.strokeStyle === 'dotted'
                                      ? 'sysDot'
                                      : 'solid') as any,
                            };
                            if (el.lineEnd === 'start' || el.lineEnd === 'both') arrowProps.beginArrowType = 'arrow';
                            if (el.lineEnd === 'end' || el.lineEnd === 'both') arrowProps.endArrowType = 'arrow';

                            // pptxgenjs는 너비/높이가 정확히 0인 수직·수평선을 렌더링하지 않는 버그가 있어
                            // 시각적으로 차이가 나지 않는 최소값(0.01)을 채워 강제로 그려준다.
                            const safeW = elW === 0 ? 0.01 : elW;
                            const safeH = elH === 0 ? 0.01 : elH;

                            slide.addShape(pptx.ShapeType.line, {
                                x: elX, y: elY, w: safeW, h: safeH,
                                line: arrowProps,
                                rotate: el.rotation || 0,
                            });
                            break;
                        }
                        case 'arrow':
                            slide.addShape(pptx.ShapeType.rightArrow, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions || { color: '3B82F6' },
                                line: lineOptions,
                                rotate: el.rotation || 0,
                            });
                            if (el.text) {
                                const { text: cleanText, options: styleOpts } = parseStyles(el.text);
                                slide.addText(tr(cleanText, translateToMN), {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (styleOpts?.align || el.textAlign || 'center') as any,
                                    valign: (styleOpts?.valign || el.verticalAlign || 'middle') as any,
                                    fontSize: canvasFs((el.fontSize ?? styleOpts?.fontSizePx ?? 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor((el as any).textColor) || cleanColor((el as any).fontColor) || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                    inset: 0,
                                    wrap: false,
                                    shrinkText: true,
                                });
                            }
                            break;
                        case 'polygon': {
                            let shapeType = pptx.ShapeType.rect;
                            if (el.polygonPreset === 'triangle') shapeType = pptx.ShapeType.triangle;
                            else if (el.polygonPreset === 'diamond') shapeType = pptx.ShapeType.diamond;
                            else if (el.polygonPreset === 'pentagon') shapeType = pptx.ShapeType.pentagon;
                            else if (el.polygonPreset === 'hexagon') shapeType = pptx.ShapeType.hexagon;

                            slide.addShape(shapeType, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rotate: el.rotation || 0,
                            });
                            if (el.text) {
                                const { text: cleanText, options: styleOpts } = parseStyles(el.text);
                                slide.addText(tr(cleanText, translateToMN), {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (styleOpts?.align || el.textAlign || 'center') as any,
                                    valign: (styleOpts?.valign || el.verticalAlign || 'middle') as any,
                                    fontSize: canvasFs((el.fontSize ?? styleOpts?.fontSizePx ?? 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor((el as any).textColor) || cleanColor((el as any).fontColor) || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                    inset: 0,
                                    wrap: false,
                                    shrinkText: true,
                                });
                            }
                            break;
                        }
                        case 'image':
                            if (el.imageUrl && el.imageUrl.length > 10) {
                                const prepared = await resolveImageForPpt(el.imageUrl, fetchWithAuth);
                                if (!prepared) break;
                                const imgRatio = prepared.w / prepared.h;

                                let finalW = elW;
                                let finalH = elW / imgRatio;

                                if (finalH > elH) {
                                    finalH = elH;
                                    finalW = elH * imgRatio;
                                }

                                const offsetX = (elW - finalW) / 2;
                                const offsetY = (elH - finalH) / 2;

                                const imgOptions: any = {
                                    x: elX + offsetX,
                                    y: elY + offsetY,
                                    w: finalW,
                                    h: finalH,
                                    rotate: el.imageRotation || 0,
                                };
                                if (prepared.data) imgOptions.data = prepared.data;
                                else if (prepared.path) imgOptions.path = prepared.path;

                                try {
                                    slide.addImage(imgOptions);
                                } catch {
                                    /* 래스터/경로 실패 시 해당 이미지만 생략 */
                                }
                            }
                            break;
                    }
                }
            }

            // 외부에서 pptx 객체를 전달받은 경우 writeFile 호출하지 않음
            if (!externalPptx) {
                const fileName =
                    downloadFileName ?? `Blueprint_BETA_FullData_${Date.now()}.pptx`;
                await pptx.writeFile({ fileName });
            }
        };

        const exportSpecLayoutToPPT = async (
            selectedScreens: Screen[],
            externalPptx?: pptxgen,
            sectionTitle?: string,
            downloadFileName?: string
        ) => {
            const pptx = externalPptx || new pptxgen();
            
            // PPT 텍스트 크기 비율 전역 상수 - 명세서용
            const PPT_FONT_SCALE_RATIO = 1.0;
            const PPT_FONT_MIN_SIZE = 4;
            const baseFs = (pt: number, floor: number = PPT_FONT_MIN_SIZE) => Math.max(floor, pt);

            for (const screen of selectedScreens) {
                const canvasW = screen.imageWidth || 800;
                const canvasH = 770;
                const ADJUSTED_HEADER_H = 130; 
                
                const totalEntityW = Math.ceil(canvasW / 0.7); 
                const totalEntityH = canvasH + ADJUSTED_HEADER_H;

                const slideWidth = 10; 
                const scale = slideWidth / totalEntityW; 
                const slideHeight = totalEntityH * scale;

                const layoutName = `LAYOUT_${screen.id}`;
                pptx.defineLayout({ name: layoutName, width: slideWidth, height: slideHeight });

                const slide = pptx.addSlide({ masterName: layoutName, sectionTitle: sectionTitle });

                const hH = ADJUSTED_HEADER_H * scale;
                const rH = hH / 3;
                const leftW = slideWidth * 0.7;
                const rightW = slideWidth * 0.3;
                const cW = leftW / 6;

                // pptxgenjs는 6자리 대문자 헥스(FFFFFF)만 색상으로 인식한다.
                // 'white'/'#fff'/'rgba(...)' 등 어떤 표기든 6자리 헥스로 정규화하고,
                // 끝까지 유효하지 않으면 undefined를 돌려서 호출부의 fallback 체인이 자연스럽게 동작하게 한다.
                // ('000000' 강제 반환을 하면 fallback이 끊겨 의도치 않은 검정/회색이 박힌다.)
                const NAMED_COLOR_HEX: Record<string, string> = {
                    white: 'FFFFFF', black: '000000',
                    red: 'FF0000', green: '008000', blue: '0000FF',
                    yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF',
                    gray: '808080', grey: '808080', silver: 'C0C0C0',
                    orange: 'FFA500', pink: 'FFC0CB', purple: '800080',
                    brown: 'A52A2A', navy: '000080', teal: '008080',
                };
                const rgbToHex = (rgb?: string): string | undefined => {
                    if (!rgb) return undefined;
                    const trimmed = String(rgb).trim();
                    if (!trimmed) return undefined;
                    const named = NAMED_COLOR_HEX[trimmed.toLowerCase()];
                    if (named) return named;
                    const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
                    if (match) {
                        return [match[1], match[2], match[3]]
                            .map((x) => parseInt(x, 10).toString(16).padStart(2, '0'))
                            .join('')
                            .toUpperCase();
                    }
                    let hex = trimmed.replace(/#/g, '');
                    if (hex.length === 3) {
                        hex = hex.split('').map((c) => c + c).join('');
                    } else if (hex.length === 4) {
                        hex = hex.substring(0, 3).split('').map((c) => c + c).join('');
                    } else if (hex.length === 8) {
                        hex = hex.substring(0, 6);
                    }
                    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
                    return hex.toUpperCase();
                };

                const parseStyles = (
                    html: string
                ): {
                    text: string;
                    options: {
                        bold?: boolean;
                        italic?: boolean;
                        underline?: boolean;
                        fontFace?: string;
                        color?: string;
                        fontSizePx?: number;
                    };
                } => {
                    let text = html.replace(/<[^>]*>/g, '');
                    text = text.replace(/&nbsp;/g, ' ');
                    text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    text = text.replace(/&amp;/g, '&');
                    
                    const bold = /<b>|<strong>/i.test(html);
                    const italic = /<i>|<em>/i.test(html);
                    const underline = /<u>/i.test(html);
                    
                    let fontFace = '맑은 고딕';
                    const faceMatch = html.match(/face=["']([^"']+)["']/i);
                    if (faceMatch) fontFace = faceMatch[1];
                    const familyMatch = html.match(/font-family:\s*([^;]+)/i);
                    if (familyMatch) fontFace = familyMatch[1].trim();
                    
                    // 모든 색 표기(#fff, rgba, white 등)는 rgbToHex로 6자리 헥스 정규화.
                    let color: string | undefined;
                    const colorMatch = html.match(/color=["']?([^"'\s>]+)/i);
                    if (colorMatch) {
                        color = rgbToHex(colorMatch[1].trim());
                    }
                    
                    let fontSizePx: number | undefined;
                    const sizeMatch = html.match(/font-size:\s*(\d+(?:\.\d+)?)px/i);
                    if (sizeMatch) fontSizePx = parseFloat(sizeMatch[1]);
                    
                    return { text, options: { bold, italic, underline, fontFace, color, fontSizePx } };
                };

                // 데이터 매핑용 맵 생성
                const textMap: Record<string, string> = {
                    "0,0": tr('시스템명', translateToMN),
                    "0,1": screen.systemName || '',
                    "0,2": tr('작성자', translateToMN),
                    "0,3": screen.author || '',
                    "0,4": tr('작성일자', translateToMN),
                    "0,5": screen.createdDate || '',
                    "1,0": tr('화면ID', translateToMN),
                    "1,1": screen.screenId || '',
                    "1,2": tr('화면유형', translateToMN),
                    "1,3": screen.screenType || '',
                    "1,4": tr('페이지', translateToMN),
                    "1,5": screen.page || '',
                    "2,0": tr('화면설명', translateToMN),
                    "2,1": screen.screenDescription || tr('화면에 대한 구체적인 설명을 입력하세요', translateToMN)
                };

                // ─── 상단 헤더 영역 (좌측만 표; 우측 상단은 빈 영역) ───
                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: 0, w: leftW, h: hH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 1 }
                });

                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 6; c++) {
                        const isLabel = (r === 0 && (c === 0 || c === 2 || c === 4)) ||
                                        (r === 1 && (c === 0 || c === 2 || c === 4)) ||
                                        (r === 2 && c === 0);

                        const textKey = `${r},${c}`;
                        const content = textMap[textKey] || '';

                        // '화면설명' 데이터 칸 (Row 2, Col 1~5) 병합
                        if (r === 2 && c >= 1) {
                            if (c === 1) {
                                slide.addShape(pptx.ShapeType.rect, {
                                    x: c * cW, y: r * rH, w: cW * 5, h: rH,
                                    fill: { color: "FFFFFF" },
                                    line: { color: "E2E8F0", width: 1 }
                                });
                                // 화면설명 내용 추가 (왼쪽 정렬)
                                const { text, options: styleOpts } = parseStyles(textMap["2,1"]);
                                slide.addText(tr(text, translateToMN), {
                                    x: c * cW, y: r * rH, w: cW * 5, h: rH,
                                    align: 'left', valign: 'middle',
                                    fontSize: baseFs(6.5), color: '94A3B8',
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    breakLine: true,
                                });
                            }
                            continue;
                        }

                        // 일반 칸(도형) 생성
                        slide.addShape(pptx.ShapeType.rect, {
                            x: c * cW, y: r * rH, w: cW, h: rH,
                            fill: { color: isLabel ? "2C3E7C" : "FFFFFF" },
                            line: { color: "E2E8F0", width: 1 }
                        });

                        // 텍스트 추가
                        if (content) {
                            const { text, options: styleOpts } = parseStyles(content);
                            slide.addText(tr(text, translateToMN), {
                                x: c * cW, y: r * rH, w: cW, h: rH,
                                align: 'center', valign: 'middle',
                                fontSize: baseFs(isLabel ? 6 : 6.5),
                                color: isLabel ? 'FFFFFF' : '1E293B',
                                bold: styleOpts?.bold,
                                italic: styleOpts?.italic,
                                underline: styleOpts?.underline as any,
                                fontFace: styleOpts?.fontFace,
                                breakLine: true,
                            });
                        }
                    }
                }

                // 헤더 우측(표 밖) 상단 빈 공간 — 레이아웃보내기와 동일한 7:3 비율
                slide.addShape(pptx.ShapeType.rect, {
                    x: leftW, y: 0, w: rightW, h: hH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                // ─── 하단 본문 영역 ───
                const bodyY = hH;
                const bodyH = slideHeight - hH;

                // 하단 본문 영역 배경 (흰색)
                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: bodyY, w: slideWidth, h: bodyH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                // 명세서 항목 테이블
                const specs = screen.specs || [];
                const specColumnWidths = screen.specColumnWidths || [120, 120, 100, 120, 80, 80, 60, 80, 80, 100];
                const specTableData = [
                    // Header Row 1
                    [
                        { text: tr('테이블명(한글)', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, rowspan: 2, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('테이블명(영문)', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, rowspan: 2, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('항목명(한글)', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, rowspan: 2, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('필드명(영문)', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, rowspan: 2, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('항목타입', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, rowspan: 2, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('항목정의', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'DBEAFE' }, colspan: 4, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('비고', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, rowspan: 2, align: 'center' as any, valign: 'middle' as any } },
                    ],
                    // Header Row 2
                    [
                        { text: 'Format', options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('자릿수', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, align: 'center' as any, valign: 'middle' as any } },
                        { text: tr('초기값', translateToMN), options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, align: 'center' as any, valign: 'middle' as any } },
                        { text: 'Validation', options: { bold: true, fontSize: baseFs(9 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', fill: { color: 'EFF6FF' }, align: 'center' as any, valign: 'middle' as any } },
                    ],
                    // Data Rows
                    ...specs.map(spec => [
                        { text: tr(spec.tableNameKr || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.tableNameEn || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.fieldName || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.controlName || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.dataType || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.format || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.length || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.defaultValue || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.validation || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                        { text: tr(spec.memo || '', translateToMN), options: { fontSize: baseFs(8 * scale * PPT_FONT_SCALE_RATIO, PPT_FONT_MIN_SIZE + 3.5), color: '334155', align: 'center' as any, valign: 'middle' as any } },
                    ]),
                ];

                // 셀 너비 계산
                const totalWidth = specColumnWidths.reduce((sum, w) => sum + w, 0);
                const colWidths = specColumnWidths.map(w => (w / totalWidth) * (slideWidth - 0.6 * scale));

                slide.addTable(specTableData, {
                    x: 0.3 * scale,
                    y: bodyY + 0.3 * scale,
                    w: slideWidth - 0.6 * scale,
                    colW: colWidths,
                    border: { pt: 0.5, color: 'D1D5DB' },
                });
            }

            // 외부에서 pptx 객체를 전달받은 경우 writeFile 호출하지 않음
            if (!externalPptx) {
                const fileName = downloadFileName ?? `Blueprint_Spec_${Date.now()}.pptx`;
                await pptx.writeFile({ fileName });
            }
        };

        let cancelled = false;
        const runExport = async () => {
            try {
                const { screens, sections } = useScreenDesignStore.getState();
                const selectedScreens = screens.filter(screen => screenIds.includes(screen.id));
                if (selectedScreens.length === 0) throw new Error('선택된 화면을 찾을 수 없습니다.');

                const pptFileName = buildPptBetaDownloadFileName(
                    selectedScreens,
                    sections,
                    downloaderDisplayName
                );

                let dynamicDict: Record<string, string> = {};
                let dynamicNormalizedDict: Record<string, string> = {};
                if (translateToMN) {
                    try {
                        const dictRes = await fetchWithAuth(`${API_ROOT}/translations/dictionary`);
                        if (dictRes.ok) {
                            dynamicDict = await dictRes.json();
                            dynamicNormalizedDict = buildNormalizedDictionary(dynamicDict);
                        }
                    } catch {
                        /* 서버 사전 없으면 정적 mnDict만 사용 */
                    }
                }
                tr = (text: string, isMn: boolean): string => {
                    if (!isMn || !text) return text;
                    const normalizedKey = normalizeTranslationKey(text);
                    return (
                        dynamicDict[text] ??
                        dynamicNormalizedDict[normalizedKey] ??
                        staticMnDict[text] ??
                        staticNormalizedDict[normalizedKey] ??
                        text
                    );
                };

                // 하나의 pptx 객체 생성
                const pptx = new pptxgen();

                // 섹션 ID 기준으로 그룹핑
                const sectionIds = [...new Set(selectedScreens.filter(s => s.sectionId).map(s => s.sectionId))];
                const hasSections = sectionIds.length > 0;

                if (hasSections) {
                    // 섹션이 있는 경우 섹션별로 슬라이드 생성
                    for (const sectionId of sectionIds) {
                        const sectionScreens = selectedScreens.filter(screen => screen.sectionId === sectionId);
                        const section = sections.find((s: any) => s.id === sectionId);
                        if (sectionScreens.length > 0) {
                            const uiScreens = sectionScreens.filter(screen => screen.variant !== 'SPEC');
                            const specScreens = sectionScreens.filter(screen => screen.variant === 'SPEC');

                            // 섹션 생성 (pptxgenjs 섹션 기능)
                            const sectionTitle = section?.name || `섹션 ${sectionId}`;
                            pptx.addSection({ title: sectionTitle });

                            // 화면 설계 슬라이드 추가
                            if (uiScreens.length > 0) {
                                await exportLayoutToPPT(uiScreens, pptx, sectionTitle, pptFileName);
                            }

                            // 명세서 슬라이드 추가
                            if (specScreens.length > 0) {
                                await exportSpecLayoutToPPT(specScreens, pptx, sectionTitle, pptFileName);
                            }
                        }
                    }

                    // 섹션에 속하지 않은 화면 처리
                    const unsectionedScreens = selectedScreens.filter(screen => !screen.sectionId);
                    if (unsectionedScreens.length > 0) {
                        const uiScreens = unsectionedScreens.filter(screen => screen.variant !== 'SPEC');
                        const specScreens = unsectionedScreens.filter(screen => screen.variant === 'SPEC');

                        if (uiScreens.length > 0) {
                            await exportLayoutToPPT(uiScreens, pptx, undefined, pptFileName);
                        }

                        if (specScreens.length > 0) {
                            await exportSpecLayoutToPPT(specScreens, pptx, undefined, pptFileName);
                        }
                    }
                } else {
                    // 섹션이 없는 경우 기존 로직 사용
                    const uiScreens = selectedScreens.filter(screen => screen.variant !== 'SPEC');
                    const specScreens = selectedScreens.filter(screen => screen.variant === 'SPEC');

                    if (uiScreens.length > 0) {
                        await exportLayoutToPPT(uiScreens, pptx, undefined, pptFileName);
                    }

                    if (specScreens.length > 0) {
                        await exportSpecLayoutToPPT(specScreens, pptx, undefined, pptFileName);
                    }
                }

                // PPT 파일 저장
                if (cancelled) return;
                await pptx.writeFile({ fileName: pptFileName });
                if (cancelled) return;
                await logPptExport();
                if (cancelled) return;
                exportCallbacksRef.current.onComplete?.();
            } catch (error) {
                if (!cancelled) {
                    exportCallbacksRef.current.onError?.(
                        `PPT_BETA 내보내기 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
                    );
                }
            }
        };

        void runExport();
        return () => {
            cancelled = true;
        };
    }, [screenIdsKey, projectId, translateToMN, mnPptFontScalePercent, downloaderDisplayName]);

    return (
        <div className="p-4">
            <h3 className="text-lg font-bold mb-2 text-purple-700">
                PPT_BETA 데이터 매핑 중
                {translateToMN ? ` (몽골어 · 캔버스 ${mnPptFontScalePercent}%)` : ''}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
                레이아웃 위에 실시간 데이터를 입히고 있습니다.
            </p>
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-medium">UI 요소(도형, 텍스트) 변환 중...</span>
                </div>
                <div className="text-xs text-gray-400 pl-6">
                    <div>• 버튼, 입력창 등 UI 컴포넌트 매핑</div>
                    <div>• 기능 번호 및 상세 설명 연결</div>
                    <div>• 테이블 및 이미지 개체 최적화</div>
                </div>
            </div>
        </div>
    );
};

export default PPTBetaExporter;
