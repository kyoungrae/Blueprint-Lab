import React from 'react';
import pptxgen from "pptxgenjs";
import type { Screen } from '../types/screenDesign';
import { useScreenDesignStore } from '../store/screenDesignStore';

interface PPTBetaExporterProps {
    screenIds: string[];
    onComplete?: () => void;
    onError?: (error: string) => void;
}

const PPTBetaExporter: React.FC<PPTBetaExporterProps> = ({
    screenIds,
    onComplete,
    onError
}) => {
    const { screens } = useScreenDesignStore();

    // 🚀 이미지 실제 크기를 가져오는 헬퍼 함수
    const getImageSize = (url: string): Promise<{ w: number; h: number }> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve({ w: 100, h: 100 }); // 실패 시 기본값
            img.src = url;
        });
    };
    
    React.useEffect(() => {
        const exportLayoutToPPT = async (selectedScreens: Screen[]) => {
            const pptx = new pptxgen();
            
            // PPT 텍스트 크기 비율 전역 상수 - 모든 요소에 동일하게 적용
            const PPT_FONT_SCALE_RATIO = (1.0)+53;
            const PPT_FONT_MIN_SIZE = 4; 

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
                const slide = pptx.addSlide({ masterName: layoutName });

                const hH = ADJUSTED_HEADER_H * scale; 
                const rH = hH / 3;                    
                const cW = slideWidth / 6;            

                const rgbToHex = (rgb: string): string => {
                    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
                    if (!match) return rgb.replace('#', '');
                    return [match[1], match[2], match[3]]
                        .map((x) => parseInt(x, 10).toString(16).padStart(2, '0'))
                        .join('')
                        .toUpperCase();
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
                    };
                } => {
                    if (!html) return { text: "", options: {} };
                    

                    // 1. 색상 추출 (style="color:..." 또는 <font color="...">)
                    const colorMatch = html.match(/color:\s*([^;"]+)/i) || html.match(/color="([^"]+)"/i);
                    let color = "000000";
                    if (colorMatch) {
                        const rawColor = colorMatch[1].trim();
                        color = rawColor.startsWith('rgb') ? rgbToHex(rawColor) : rawColor.replace('#', '');
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

                    return {
                        text: cleanText,
                        options: {
                            bold: isBold,
                            italic: isItalic,
                            underline: isUnderline,
                            fontFace: fontFace,
                            color,
                            fontSizePx,
                        },
                    };
                };

                // --- 데이터 매핑용 맵 생성 ---
                const textMap: Record<string, string> = {
                    "0,0": "시스템명",
                    "0,1": screen.systemName || '',
                    "0,2": "작성자",
                    "0,3": screen.author || '',
                    "0,4": "작성일자",
                    "0,5": screen.createdDate || '',
                    "1,0": "화면ID",
                    "1,1": screen.screenId || '',
                    "1,2": "화면유형",
                    "1,3": screen.screenType || '',
                    "1,4": "페이지",
                    "1,5": screen.page || '',
                    "2,0": "화면설명",
                    "2,1": screen.screenDescription || '화면에 대한 구체적인 설명을 입력하세요'
                };

                // ─── 상단 헤더 영역 ───
                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: 0, w: slideWidth, h: hH,
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
                                slide.addText(text, {
                                    x: c * cW, y: r * rH, w: cW * 5, h: rH,
                                    align: 'left', valign: 'middle',
                                    fontSize: Math.max(PPT_FONT_MIN_SIZE, 9), color: '94A3B8', 
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
                            slide.addText(text, {
                                x: c * cW, y: r * rH, w: cW, h: rH,
                                align: 'center', valign: 'middle',
                                fontSize: Math.max(PPT_FONT_MIN_SIZE, isLabel ? 9 : 9.5),
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
                const leftW = slideWidth * 0.7; 
                const rightW = slideWidth * 0.3;

                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: bodyY, w: leftW, h: bodyH,
                    fill: { color: "F3F4F6" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                slide.addShape(pptx.ShapeType.rect, {
                    x: leftW, y: bodyY, w: rightW, h: bodyH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                const ratios = screen.rightPaneRatios || [40, 35, 25];
                const titleH = 26 * scale; 
                const titles = ["초기화면설정", "기능상세", "관련테이블"];
                
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
                        return `[${el.text}] ${cleanDesc}`;
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
                
                let currentY = bodyY;
                ratios.forEach((ratioVal, idx) => {
                    const sectionH = (bodyH * ratioVal) / 100;
                    const sectionColor = idx === 2 ? "5E6B7C" : "5C6B9E";
                    
                    // 1. 섹션 타이틀 바 배경
                    slide.addShape(pptx.ShapeType.rect, {
                        x: leftW, y: currentY, w: rightW, h: titleH,
                        fill: { color: sectionColor }
                    });

                    // 2. 섹션 제목 텍스트 (흰색 Bold)
                    slide.addText(titles[idx], {
                        x: leftW + 0.05, y: currentY, w: rightW - 0.1, h: titleH,
                        align: 'left', valign: 'middle',
                        fontSize: 8, color: 'FFFFFF', bold: true,
                        inset: 0.05
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
                            slide.addText(el.text || '', {
                                x: leftW + 0.1, y: itemY, w: 0.16, h: 0.16,
                                align: 'center', valign: 'middle',
                                fontSize: 6, color: 'FFFFFF', bold: true
                            });
                            // 📝 상세 설명 텍스트 (아이콘 옆 배치)
                            slide.addText(cleanDesc, {
                                x: leftW + 0.32, y: itemY, w: rightW - 0.45, h: 0.16,
                                align: 'left', valign: 'middle',
                                fontSize: 5, color: '334155'
                            });

                            itemOffset += 0.22; // 다음 줄 간격
                        });

                        // 원본 기능상세(functionDetails) 텍스트가 있으면 추가 렌더링
                        if (screen.functionDetails) {
                            const { text: cleanFuncText } = parseStyles(screen.functionDetails);
                            slide.addText(cleanFuncText, {
                                x: leftW + 0.1, y: currentY + titleH + itemOffset, 
                                w: rightW - 0.2, h: 0.2,
                                align: 'left', valign: 'top',
                                fontSize: 7.5, color: '334155'
                            });
                        }
                    } else {
                        // 초기화면설정(0), 관련테이블(2) 영역은 기존 텍스트 방식 유지
                        const content = sectionContents[idx];
                        if (content) {
                            const { text: cleanText } = parseStyles(content);
                            slide.addText(cleanText, {
                                x: leftW + 0.1, 
                                y: currentY + titleH + 0.05, 
                                w: rightW - 0.2, 
                                h: sectionH - titleH - 0.1,
                                align: 'left', valign: 'top', 
                                fontSize: 5.5, color: '334155', 
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
                        case 'rect':
                            const shapeType = el.borderRadius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
                            const rectRadius = el.borderRadius ? (el.borderRadius * scale * 1) : undefined;
                            slide.addShape(shapeType, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rectRadius: rectRadius,
                                rotate: el.rotation || 0,
                            });
                            if (el.text) {
                                const { text: cleanText, options: styleOpts } = parseStyles(el.text);
                                slide.addText(cleanText, {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (el.textAlign || 'center') as any,
                                    valign: (el.verticalAlign || 'middle') as any,
                                    fontSize: Math.max(PPT_FONT_MIN_SIZE, (styleOpts?.fontSizePx || el.fontSize || 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                });
                            }
                            break;
                        case 'circle':
                            slide.addShape(pptx.ShapeType.ellipse, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rotate: el.rotation || 0,
                            });
                            if (el.text) {
                                const { text: cleanText, options: styleOpts } = parseStyles(el.text);
                                slide.addText(cleanText, {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (el.textAlign || 'center') as any,
                                    valign: (el.verticalAlign || 'middle') as any,
                                    fontSize: Math.max(PPT_FONT_MIN_SIZE, (styleOpts?.fontSizePx || el.fontSize || 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                });
                            }
                            break;
                        case 'text':
                            if (el.text) {
                                const { text, options: styleOpts } = parseStyles(el.text);
                                slide.addText(text, {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (el.textAlign || 'left') as 'left' | 'center' | 'right',
                                    valign: (el.verticalAlign || 'middle') as 'top' | 'middle' | 'bottom',
                                    fontSize: Math.max(PPT_FONT_MIN_SIZE, (styleOpts?.fontSizePx || el.fontSize || 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor(el.color) || '000000',
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: (styleOpts?.underline ?? false) as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                });
                            }
                            break;
                        case 'func-no':
                            slide.addShape(pptx.ShapeType.ellipse, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: { color: cleanColor(el.fill || 'EF4444') },
                            });
                            slide.addText(el.text || '', {
                                x: elX, y: elY, w: elW, h: elH,
                                align: 'center', valign: 'middle',
                                fontSize: Math.max(PPT_FONT_MIN_SIZE, (el.fontSize || 10) * scale * PPT_FONT_SCALE_RATIO),
                                color: 'FFFFFF',
                                bold: true,
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

                            const TABLE_CELL_INSET = 0;

                            let finalColWidths: number[] = [];
                            const rawColWidths = Array.isArray((el as any).tableColWidths) ? ((el as any).tableColWidths as number[]) : [];
                            if (rawColWidths.length === tCols) {
                                const sumRawW = rawColWidths.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
                                const adjustFactor = ((el.width || 1) as number) / (sumRawW || 1);
                                finalColWidths = rawColWidths.map((w) => (Number.isFinite(w) ? w : 0) * adjustFactor * scale);
                            } else {
                                finalColWidths = Array.from({ length: tCols }, () => elW / tCols);
                            }

                            let finalRowHeights: number[] = [];
                            const rawRowHeights = Array.isArray((el as any).tableRowHeights) ? ((el as any).tableRowHeights as number[]) : [];
                            if (rawRowHeights.length === tRows) {
                                const sumRawH = rawRowHeights.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
                                const adjustFactorH = ((el.height || 1) as number) / (sumRawH || 1);
                                finalRowHeights = rawRowHeights.map((h) => (Number.isFinite(h) ? h : 0) * adjustFactorH * scale);
                            } else {
                                finalRowHeights = Array.from({ length: tRows }, () => elH / tRows);
                            }

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

                                    const rawContent = (cellV2 as any)?.content ?? (cellV2 as any)?.text ?? fallback ?? '';

                                    const { text, options: s } = parseStyles(String(rawContent));

                                    // 셀의 inline style에서 스타일 추출 (HTML이 포함된 경우)
                                    const cellInlineStyle = (cellV2 as any)?.style || {};

                                    const finalColor = ((cellStyle as any)?.color || cellInlineStyle.color || s.color || '000000').replace('#', '');
                                    // 🚀 디버깅: 텍스트 색상 확인
                                    if (index === 37) {
                                        console.log('=== 텍스트 색상 디버깅 (index=37) ===');
                                        console.log('index:', index);
                                        console.log('cellStyle:', cellStyle);
                                        console.log('s.color:', s.color);
                                        console.log('cellInlineStyle.color:', cellInlineStyle.color);
                                        console.log('cellStyle?.color:', (cellStyle as any)?.color);
                                        console.log('finalColor:', finalColor);
                                    }
                                    const finalFontSizePx = (s.fontSizePx ?? cellInlineStyle.fontSize ?? (cellStyle as any)?.fontSize) ?? 12;
                                    const finalFontFace = cellInlineStyle.fontFamily || (cellStyle as any)?.fontFamily || el.fontFamily || 'Pretendard' || s.fontFace;

                                    // cellStyle에서 bold/italic/underline 추출 (없으면 parseStyles 결과 사용)
                                    const isBold = (cellStyle as any)?.fontWeight === 'bold' || s.bold;
                                    const isItalic = (cellStyle as any)?.fontStyle === 'italic' || s.italic;
                                    const isUnderline = (cellStyle as any)?.textDecoration === 'underline' || s.underline;

                                    // colSpan/rowSpan 값 계산
                                    const colspan = (cellSpan as any)?.colSpan || (cellV2 as any)?.colSpan || 1;
                                    const rowspan = (cellSpan as any)?.rowSpan || (cellV2 as any)?.rowSpan || 1;

                                    // 셀 추가 (isMerged가 true이면 빈 셀 대신 추가하지 않음)
                                    const isMerged = (cellV2 as any)?.isMerged;
                                    if (!isMerged) {
                                        // 배경색 우선순위: cellColor > cellStyle.backgroundColor > cellV2.style.backgroundColor > FFFFFF
                                        const bgColor = cellColor || (cellStyle as any)?.backgroundColor || (cellV2 as any)?.style?.backgroundColor || 'FFFFFF';
                                        // 🚀 디버깅: 배경색 확인
                                        if (index === 37) {
                                            console.log('=== 배경색 디버깅 (index=37) ===');
                                            console.log('cellColor:', cellColor);
                                            console.log('cellStyle?.backgroundColor:', (cellStyle as any)?.backgroundColor);
                                            console.log('cellV2?.style?.backgroundColor:', (cellV2 as any)?.style?.backgroundColor);
                                            console.log('bgColor:', bgColor);
                                        }
                                        row.push({
                                            text: text || '',
                                            options: {
                                                fill: { color: bgColor.replace('#', '') },
                                                color: finalColor,
                                                align: (cellV2 as any)?.style?.textAlign || 'center',
                                                valign: 'middle',
                                                fontSize: Math.max(PPT_FONT_MIN_SIZE, finalFontSizePx * scale * PPT_FONT_SCALE_RATIO),
                                                inset: TABLE_CELL_INSET,
                                                breakLine: false,
                                                shrinkText: true,
                                                autoFit: true,
                                                border: { pt: 0.5, color: 'D1D5DB' },
                                                bold: isBold,
                                                italic: isItalic,
                                                underline: (isUnderline ?? false) as any,
                                                fontFace: finalFontFace,
                                                rowspan: rowspan > 1 ? rowspan : undefined,
                                                colspan: colspan > 1 ? colspan : undefined,
                                            },
                                        });
                                    }

                                    // colSpan만큼 열 인덱스 증가
                                    c += colspan;
                                }
                                if (row.length > 0) tableRows.push(row);
                            }

                            // 디버깅: 첫 번째 행의 열 수 확인
                            if (tableRows.length > 0) {
                            }

                            // colSpan을 고려하여 colWidths 조정
                            let adjustedColWidths = finalColWidths;
                            if (tableRows.length > 0 && tableRows[0].length !== finalColWidths.length) {
                                const firstRow = tableRows[0];
                                adjustedColWidths = [];
                                let rawColIdx = 0;
                                for (let c = 0; c < firstRow.length && rawColIdx < finalColWidths.length; c++) {
                                    const cell = firstRow[c];
                                    const colspan = cell?.options?.colspan || 1;
                                    // colspan이 적용된 경우 해당 열들의 너비를 합산
                                    let combinedWidth = 0;
                                    for (let i = 0; i < colspan && rawColIdx < finalColWidths.length; i++) {
                                        combinedWidth += finalColWidths[rawColIdx];
                                        rawColIdx++;
                                    }
                                    adjustedColWidths.push(combinedWidth);
                                }

                                // 모든 행에서 colspan 옵션 제거 (너비 일관성 유지)
                                for (const row of tableRows) {
                                    for (const cell of row) {
                                        if (cell?.options?.colspan) {
                                            delete cell.options.colspan;
                                        }
                                    }
                                }
                            }

                            // @ts-ignore pptxgenjs table typing is loose
                            slide.addTable(tableRows, {
                                x: elX, y: elY, w: elW, h: elH,
                                colW: adjustedColWidths,
                                rowH: finalRowHeights,
                                border: { pt: 0.5, color: 'D1D5DB' },
                                autoPage: false,
                            });
                            break;
                        }
                        case 'line': {
                            const arrowProps: any = {
                                color: cleanColor(el.stroke || '000000'),
                                width: (el.strokeWidth || 1) * scale * 72,
                                dashType: (el.strokeStyle === 'dashed' ? 'dash' : el.strokeStyle === 'dotted' ? 'sysDot' : 'solid') as any,
                            };
                            if (el.lineEnd === 'start' || el.lineEnd === 'both') arrowProps.beginArrowType = 'arrow';
                            if (el.lineEnd === 'end' || el.lineEnd === 'both') arrowProps.endArrowType = 'arrow';

                            slide.addShape(pptx.ShapeType.line, {
                                x: elX, y: elY, w: elW, h: elH,
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
                                slide.addText(cleanText, {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (el.textAlign || 'center') as any,
                                    valign: (el.verticalAlign || 'middle') as any,
                                    fontSize: Math.max(PPT_FONT_MIN_SIZE, (styleOpts?.fontSizePx || el.fontSize || 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
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
                                slide.addText(cleanText, {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (el.textAlign || 'center') as any,
                                    valign: (el.verticalAlign || 'middle') as any,
                                    fontSize: Math.max(PPT_FONT_MIN_SIZE, (styleOpts?.fontSizePx || el.fontSize || 12) * scale * PPT_FONT_SCALE_RATIO),
                                    color: styleOpts?.color || cleanColor(el.color) || (el.fill === '#2c3e7c' ? 'FFFFFF' : '000000'),
                                    bold: styleOpts?.bold,
                                    italic: styleOpts?.italic,
                                    underline: styleOpts?.underline as any,
                                    fontFace: styleOpts?.fontFace,
                                    rotate: el.rotation || 0,
                                    breakLine: true,
                                });
                            }
                            break;
                        }
                        case 'image':
                            if (el.imageUrl && el.imageUrl.length > 10) {
                                // 🚀 이미지 비율 수동 계산 로직
                                const dim = await getImageSize(el.imageUrl);
                                const imgRatio = dim.w / dim.h;

                                let finalW = elW;
                                let finalH = elW / imgRatio;

                                if (finalH > elH) {
                                    finalH = elH;
                                    finalW = elH * imgRatio;
                                }

                                // 중앙 정렬 좌표 계산
                                const offsetX = (elW - finalW) / 2;
                                const offsetY = (elH - finalH) / 2;

                                const imgOptions: any = { 
                                    x: elX + offsetX, y: elY + offsetY, w: finalW, h: finalH, 
                                    rotate: el.imageRotation || 0 
                                };
                                
                                if (el.imageUrl.startsWith('data:')) imgOptions.data = el.imageUrl;
                                else imgOptions.path = el.imageUrl;
                                
                                try { slide.addImage(imgOptions); } catch { }
                            }
                            break;
                    }
                }
            }

            await pptx.writeFile({ fileName: `Blueprint_BETA_FullData_${Date.now()}.pptx` });
        };

        const runExport = async () => {
            try {
                const selectedScreens = screens.filter(screen => screenIds.includes(screen.id));
                if (selectedScreens.length === 0) throw new Error('선택된 화면을 찾을 수 없습니다.');
                await exportLayoutToPPT(selectedScreens);
                onComplete?.();
            } catch (error) {
                onError?.(`PPT_BETA 내보내기 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
            }
        };

        runExport();
    }, [screenIds, screens, onComplete, onError]);

    return (
        <div className="p-4">
            <h3 className="text-lg font-bold mb-2 text-purple-700">PPT_BETA 데이터 매핑 중</h3>
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
