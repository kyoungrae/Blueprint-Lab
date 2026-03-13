import pptxgen from "pptxgenjs";
import type { Screen, DrawElement } from '../types/screenDesign';

const cleanColor = (color?: string) => color ? color.replace('#', '') : '000000';

export async function exportEditablePPT(screens: Screen[]): Promise<void> {
    try {
        console.log('최종 보정판 PPT 생성을 시작합니다...');
        const pres = new pptxgen();
        pres.layout = 'LAYOUT_16x9'; 

        const NAVY = '2c3e7c';
        const GRAY_BG = 'f8f9fa';
        const BORDER = 'e5e7eb';

        screens.forEach((screen) => {
            const slide = pres.addSlide();

            // 1. 헤더 그리기 (데이터가 없을 경우를 대비해 기본값 처리)
            const drawHeaderCell = (label: string, value: string, x: number, y: number, w1: number, w2: number) => {
                slide.addShape(pres.ShapeType.rect, { x, y, w: w1, h: 0.25, fill: { color: NAVY } });
                slide.addText(label, { x, y, w: w1, h: 0.25, color: 'FFFFFF', fontSize: 8, bold: true, align: 'center', valign: 'middle' });
                slide.addShape(pres.ShapeType.rect, { x: x + w1, y, w: w2, h: 0.25, fill: { color: 'FFFFFF' }, line: { color: BORDER, width: 1 } });
                slide.addText(value || '-', { x: x + w1 + 0.05, y, w: w2 - 0.1, h: 0.25, color: '333333', fontSize: 8, align: 'left', valign: 'middle' });
            };

            // screen 객체에 직접 들어있는 속성들 매핑
            drawHeaderCell('시스템명', screen.systemName, 0.2, 0.2, 0.8, 1.8);
            drawHeaderCell('작성자', screen.author, 2.9, 0.2, 0.8, 1.8);
            drawHeaderCell('작성일자', screen.createdDate, 5.6, 0.2, 0.8, 1.0);
            drawHeaderCell('화면ID', screen.screenId, 0.2, 0.45, 0.8, 1.8);
            drawHeaderCell('화면유형', screen.screenType, 2.9, 0.45, 0.8, 1.8);
            drawHeaderCell('페이지', screen.page, 5.6, 0.45, 0.8, 1.0);
            drawHeaderCell('화면설명', screen.screenDescription, 0.2, 0.7, 0.8, 6.4);

            // 2. 우측 패널 그리기
            const drawPanel = (title: string, content: string, y: number, h: number) => {
                slide.addShape(pres.ShapeType.rect, { x: 7.6, y, w: 2.2, h: 0.25, fill: { color: NAVY } });
                slide.addText(title, { x: 7.6, y, w: 2.2, h: 0.25, color: 'FFFFFF', fontSize: 8, bold: true, align: 'center', valign: 'middle' });
                slide.addShape(pres.ShapeType.rect, { x: 7.6, y: y + 0.25, w: 2.2, h: h - 0.25, fill: { color: GRAY_BG }, line: { color: BORDER, width: 1 } });
                slide.addText(content || '내용 없음', { x: 7.65, y: y + 0.3, w: 2.1, h: h - 0.35, color: '666666', fontSize: 7, valign: 'top' });
            };

            drawPanel('초기화면설정', screen.initialSettings, 0.2, 1.6);
            drawPanel('기능상세', screen.functionDetails, 1.9, 1.8);
            drawPanel('관련테이블', screen.relatedTables, 3.8, 1.6);

            // 3. 캔버스 영역 (표 비율 및 크기 보정)
            if (screen.drawElements && screen.drawElements.length > 0) {
                const allX = screen.drawElements.map(e => e.x);
                const allY = screen.drawElements.map(e => e.y);
                const minX = Math.min(...allX);
                const minY = Math.min(...allY);
                
                const maxX = Math.max(...screen.drawElements.map(e => e.x + (e.width || 0)));
                
                const realW = Math.max(maxX - minX, 100); // 0 방지

                // PPT 내 실제 그릴 수 있는 영역 (인치)
                const PPT_CANVAS_W = 7.2;
                const START_X = 0.2;
                const START_Y = 1.0;

                // 💡 핵심 수정: 픽셀 데이터를 PPT 인치로 변환하는 비율
                // 화면의 픽셀 너비를 PPT 가용 너비(7.2인치)에 꽉 맞춥니다.
                const ratio = PPT_CANVAS_W / realW;

                const toPPTX = (px: number) => START_X + (px - minX) * ratio;
                const toPPTY = (px: number) => START_Y + (px - minY) * ratio; // 가로세로 비율 유지를 위해 동일 ratio 사용
                const toPPTW = (px: number) => px * ratio;
                const toPPTH = (px: number) => px * ratio;

                screen.drawElements.forEach((el: DrawElement) => {
                    const x = toPPTX(el.x);
                    const y = toPPTY(el.y);
                    const w = toPPTW(el.width || 100);
                    const h = toPPTH(el.height || 20);

                    switch (el.type) {
                        case 'table':
                            if (el.tableRows && el.tableCols && el.tableCellData) {
                                // 기존 구조를 2차원 배열로 변환
                                const rows = [];
                                for (let r = 0; r < el.tableRows; r++) {
                                    const rowData = [];
                                    for (let c = 0; c < el.tableCols; c++) {
                                        const cellText = el.tableCellData[r * el.tableCols + c] || '';
                                        
                                        rowData.push({ 
                                            text: cellText, 
                                            options: { 
                                                fontSize: Math.max(6, 9 * (ratio * 96)), // 스케일에 따른 폰트 크기 보정
                                                fill: { color: 'FFFFFF' }, 
                                                align: 'center' as const, 
                                                valign: 'middle' as const
                                            } 
                                        });
                                    }
                                    rows.push(rowData);
                                }

                                // 💡 표의 컬럼 너비를 비율(%)에 맞춰 정확히 인치로 변환
                                let colW: number[] | undefined = undefined;
                                if (el.tableColWidths && el.tableColWidths.length === el.tableCols) {
                                    // el.tableColWidths는 [20, 30, 50] 같은 백분율 배열
                                    colW = el.tableColWidths.map(pct => (pct / 100) * w);
                                }

                                slide.addTable(rows, { 
                                    x, y, w, h, 
                                    colW: colW, // 이 부분이 들어가야 컬럼 비율이 맞습니다!
                                    border: { type: 'solid', color: 'CCCCCC', pt: 0.5 },
                                    autoPage: false 
                                });
                            }
                            break;

                        case 'text':
                            if (el.text) {
                                slide.addText(el.text, {
                                    x, y, w, h,
                                    color: cleanColor(el.color),
                                    fontSize: (el.fontSize || 12) * (ratio * 96), // 96dpi 기준 변환
                                    fontFace: el.fontFamily || '맑은 고딕',
                                    align: el.textAlign || 'left',
                                    valign: 'middle'
                                });
                            }
                            break;

                        case 'rect':
                            slide.addShape(pres.ShapeType.rect, { 
                                x, y, w, h, 
                                fill: el.fill ? { color: cleanColor(el.fill) } : undefined, 
                                line: el.stroke ? { color: cleanColor(el.stroke), width: 1 } : undefined 
                            });
                            break;
                        
                        // line 등 나머지 케이스는 동일하게 toPPTX, toPPTY 적용
                    }
                });
            }
        });

        await pres.writeFile({ fileName: `Editable_Design_${Date.now()}.pptx` });
    } catch (error) {
        console.error(error);
        alert('PPT 내보내기 실패');
    }
}
