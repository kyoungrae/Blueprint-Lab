import React from 'react';
import pptxgen from "pptxgenjs";
import type { Screen, DrawElement } from '../types/screenDesign';
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
    
    React.useEffect(() => {
        const exportLayoutToPPT = async (selectedScreens: Screen[]) => {
            const pptx = new pptxgen();

            selectedScreens.forEach((screen) => {
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
                
                // @ts-ignore - pptxgenjs doesn't support multiple layouts per file, but we follow the user's per-slide logic
                pptx.layout = layoutName;
                const slide = pptx.addSlide();

                const hH = ADJUSTED_HEADER_H * scale; 
                const rH = hH / 3;                    
                const cW = slideWidth / 6;            

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
                                slide.addText(textMap["2,1"], {
                                    x: c * cW, y: r * rH, w: cW * 5, h: rH,
                                    align: 'left', valign: 'middle',
                                    fontSize: 9, color: '94A3B8', // 설명은 조금 흐릿하게
                                    inset: 0.1
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

                        // 🚀 텍스트 추가
                        if (content) {
                            slide.addText(content, {
                                x: c * cW, y: r * rH, w: cW, h: rH,
                                align: 'center', valign: 'middle',
                                fontSize: isLabel ? 9 : 9.5,
                                color: isLabel ? 'FFFFFF' : '1E293B',
                                bold: true
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
                
                // 🚀 섹션별 실제 데이터 매핑 (기능 상세는 번호별 설명과 병합)
                const funcNoDetails = (screen.drawElements || [])
                    .filter(el => el.type === 'func-no')
                    .sort((a, b) => {
                        const aNum = parseFloat((a.text || '0').replace('-', '.'));
                        const bNum = parseFloat((b.text || '0').replace('-', '.'));
                        return aNum - bNum;
                    })
                    .map(el => `[${el.text}] ${el.description || ''}`)
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

                    // 3. 🚀 섹션 본문 텍스트 데이터
                    const content = sectionContents[idx];
                    if (content) {
                        slide.addText(content, {
                            x: leftW + 0.1, 
                            y: currentY + titleH + 0.05, 
                            w: rightW - 0.2, 
                            h: sectionH - titleH - 0.1,
                            align: 'left', 
                            valign: 'top', 
                            fontSize: 7.5, 
                            color: '334155', 
                            breakLine: true, 
                            inset: 0.05
                        });
                    }

                    currentY += sectionH;
                });

                // ─── 좌측 캔버스 UI 요소 매핑 ───
                const sortedElements = [...(screen.drawElements || [])].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                const cleanColor = (c?: string) => c ? c.replace('#', '') : '1E293B';

                sortedElements.forEach((el: DrawElement) => {
                    const elX = el.x * scale;
                    const elY = bodyY + (el.y * scale);
                    const elW = (el.width || 10) * scale;
                    const elH = (el.height || 10) * scale;

                    const fillOptions = el.fill ? { 
                        color: cleanColor(el.fill), 
                        transparency: el.fillOpacity !== undefined ? (1 - el.fillOpacity) * 100 : 0 
                    } : undefined;

                    const lineOptions = el.stroke ? { 
                        color: cleanColor(el.stroke), 
                        width: (el.strokeWidth || 1) * scale * 72,
                        dashType: (el.strokeStyle === 'dashed' ? 'dash' : el.strokeStyle === 'dotted' ? 'sysDot' : 'solid') as 'dash' | 'sysDot' | 'solid'
                    } : undefined;

                    switch (el.type) {
                        case 'rect':
                            slide.addShape(pptx.ShapeType.rect, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rectRadius: el.borderRadius ? (el.borderRadius * scale) : undefined,
                                rotate: el.rotation || 0
                            });
                            break;
                        case 'circle':
                            slide.addShape(pptx.ShapeType.ellipse, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rotate: el.rotation || 0
                            });
                            break;
                        case 'text':
                            if (el.text) {
                                slide.addText(el.text, {
                                    x: elX, y: elY, w: elW, h: elH,
                                    align: (el.textAlign || 'left') as 'left' | 'center' | 'right',
                                    valign: (el.verticalAlign || 'middle') as 'top' | 'middle' | 'bottom',
                                    fontSize: Math.max(5, (el.fontSize || 12) * scale * 72),
                                    color: cleanColor(el.color),
                                    bold: el.fontWeight === 'bold',
                                    italic: el.fontStyle === 'italic',
                                    fontFace: el.fontFamily || 'Arial',
                                    rotate: el.rotation || 0
                                });
                            }
                            break;
                        case 'func-no':
                            slide.addShape(pptx.ShapeType.ellipse, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: { color: cleanColor(el.fill || 'EF4444') }
                            });
                            slide.addText(el.text || '', {
                                x: elX, y: elY, w: elW, h: elH,
                                align: 'center', valign: 'middle',
                                fontSize: Math.max(5, (el.fontSize || 10) * scale * 72),
                                color: 'FFFFFF',
                                bold: true
                            });
                            break;
                        case 'table':
                            const rows: pptxgen.TableRow[] = [];
                            const tRows = el.tableRows || 1;
                            const tCols = el.tableCols || 1;
                            const cellDataV2 = el.tableCellDataV2 || [];
                            const cellDataLegacy = el.tableCellData || [];

                            for (let r = 0; r < tRows; r++) {
                                const row: pptxgen.TableRow = [];
                                for (let c = 0; c < tCols; c++) {
                                    const idx = r * tCols + c;
                                    const cell = cellDataV2[idx] || { content: cellDataLegacy[idx] || '' };
                                    if (cell.isMerged) continue;

                                    row.push({
                                        text: cell.content || '',
                                        options: {
                                            rowspan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
                                            colspan: cell.colSpan > 1 ? cell.colSpan : undefined,
                                            fill: { color: 'FFFFFF' },
                                            fontSize: Math.max(5, (el.fontSize || 9) * scale * 72),
                                            align: 'center',
                                            valign: 'middle'
                                        }
                                    });
                                }
                                if (row.length > 0) rows.push(row);
                            }
                            slide.addTable(rows, {
                                x: elX, y: elY, w: elW, h: elH,
                                border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }
                            });
                            break;
                        case 'line':
                            const arrowProps: any = { 
                                color: cleanColor(el.stroke || '000000'), 
                                width: (el.strokeWidth || 1) * scale * 72,
                                dashType: (el.strokeStyle === 'dashed' ? 'dash' : el.strokeStyle === 'dotted' ? 'sysDot' : 'solid') as 'dash' | 'sysDot' | 'solid'
                            };
                            if (el.lineEnd === 'start' || el.lineEnd === 'both') arrowProps.beginArrowType = 'arrow';
                            if (el.lineEnd === 'end' || el.lineEnd === 'both') arrowProps.endArrowType = 'arrow';

                            slide.addShape(pptx.ShapeType.line, {
                                x: elX, y: elY, w: elW, h: elH,
                                line: arrowProps,
                                rotate: el.rotation || 0
                            });
                            break;
                        case 'arrow':
                            slide.addShape(pptx.ShapeType.rightArrow, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions || { color: '3B82F6' },
                                line: lineOptions,
                                rotate: el.rotation || 0
                            });
                            break;
                        case 'polygon':
                            let shapeType = pptx.ShapeType.rect;
                            if (el.polygonPreset === 'triangle') shapeType = pptx.ShapeType.triangle;
                            else if (el.polygonPreset === 'diamond') shapeType = pptx.ShapeType.diamond;
                            else if (el.polygonPreset === 'pentagon') shapeType = pptx.ShapeType.pentagon;
                            else if (el.polygonPreset === 'hexagon') shapeType = pptx.ShapeType.hexagon;

                            slide.addShape(shapeType, {
                                x: elX, y: elY, w: elW, h: elH,
                                fill: fillOptions,
                                line: lineOptions,
                                rotate: el.rotation || 0
                            });
                            break;
                        case 'image':
                            if (el.imageUrl) {
                                const imgOptions: any = { x: elX, y: elY, w: elW, h: elH, rotate: el.imageRotation || 0 };
                                if (el.imageUrl.startsWith('data:')) {
                                    imgOptions.data = el.imageUrl;
                                } else {
                                    imgOptions.path = el.imageUrl;
                                }
                                slide.addImage(imgOptions);
                            }
                            break;
                    }
                });
            });

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
