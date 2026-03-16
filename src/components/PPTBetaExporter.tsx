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
    
    // TODO: PPT_BETA 내보내기 로직 구현
    console.log('PPT_BETA export initiated for screens:', screenIds);

    React.useEffect(() => {
        const exportLayoutToPPT = async (screens: Screen[]) => {
            const pptx = new pptxgen();

            screens.forEach((screen) => {
                const canvasW = screen.imageWidth || 800;
                // const canvasH = screen.imageHeight || 600;
                const canvasH = 770;
                
                // 1. 🚀 헤더 높이 보정: 180px -> 170px로 변경하여 빨간색 오차 제거
                const ADJUSTED_HEADER_H = 130; 
                
                // 웹 노드와 시각적으로 일치하는 논리적 크기 계산
                const totalEntityW = Math.ceil(canvasW / 0.7); 
                const totalEntityH = canvasH + ADJUSTED_HEADER_H; // 보정된 높이 적용

                // 2. 너비 10인치 기준 스케일 생성
                const slideWidth = 10; 
                const scale = slideWidth / totalEntityW; 
                const slideHeight = totalEntityH * scale;

                // 3. 해당 슬라이드만을 위한 전용 레이아웃 정의
                const layoutName = `LAYOUT_${screen.id}`;
                pptx.defineLayout({ name: layoutName, width: slideWidth, height: slideHeight });
                
                const slide = pptx.addSlide();

                // 4. 변환 치수 (PX -> INCH)
                const hH = ADJUSTED_HEADER_H * scale; // 보정된 헤더 높이
                const rH = hH / 3;                    // 3개 행으로 균등 분할
                const cW = slideWidth / 6;            // 6개 열로 균등 분할

                // ─── 상단 헤더 영역 (보정된 높이까지) ───
                // 1. 헤더 전체 외곽 배경 (기본 흰색)
                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: 0, w: slideWidth, h: hH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 1 }
                });

                // 2. 🚀 헤더 격자 및 테두리 정밀 생성 (3행 6열 구조)
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 6; c++) {
                        // 레이블 칸 여부 판단 (0, 2, 4열 및 마지막 행 0열)
                        const isLabel = (r === 0 && (c === 0 || c === 2 || c === 4)) ||
                                        (r === 1 && (c === 0 || c === 2 || c === 4)) ||
                                        (r === 2 && c === 0);

                        // 🚀 '화면설명' 행의 데이터 칸 (Row 2, Col 1~5) 병합 처리
                        if (r === 2 && c >= 1) {
                            if (c === 1) { // 첫 번째 데이터 칸에서만 5칸 너비로 한 번 생성
                                slide.addShape(pptx.ShapeType.rect, {
                                    x: c * cW, 
                                    y: r * rH, 
                                    w: cW * 5, 
                                    h: rH,
                                    fill: { color: "FFFFFF" },
                                    line: { color: "E2E8F0", width: 1 }
                                });
                            }
                            continue; // 나머지 2~5열 루프 건너뛰기
                        }

                        // 일반 칸 생성 (레이블은 파란색, 데이터는 흰색 + 모두 동일 테두리)
                        slide.addShape(pptx.ShapeType.rect, {
                            x: c * cW,
                            y: r * rH,
                            w: cW,
                            h: rH,
                            fill: { color: isLabel ? "2C3E7C" : "FFFFFF" },
                            line: { color: "E2E8F0", width: 1 }
                        });
                    }
                }

                // ─── 하단 본문 영역 ───
                const bodyY = hH;
                const bodyH = slideHeight - hH;
                const leftW = slideWidth * 0.7; 
                const rightW = slideWidth * 0.3;

                // 왼쪽 캔버스
                slide.addShape(pptx.ShapeType.rect, {
                    x: 0, y: bodyY, w: leftW, h: bodyH,
                    fill: { color: "F3F4F6" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                // 오른쪽 패널 프레임
                slide.addShape(pptx.ShapeType.rect, {
                    x: leftW, y: bodyY, w: rightW, h: bodyH,
                    fill: { color: "FFFFFF" },
                    line: { color: "E2E8F0", width: 0.5 }
                });

                // 우측 패널 3단 섹션 (비율 40:35:25)
                const ratios = screen.rightPaneRatios || [40, 35, 25];
                const titleH = 26 * scale; // 패널 타이틀바도 헤더 비율에 맞춰 미세 조정
                let currentY = bodyY;

                ratios.forEach((ratioVal, idx) => {
                    const sectionH = (bodyH * ratioVal) / 100;
                    slide.addShape(pptx.ShapeType.rect, {
                        x: leftW, y: currentY, w: rightW, h: titleH,
                        fill: { color: idx === 2 ? "5E6B7C" : "5C6B9E" }
                    });
                    currentY += sectionH;
                });
            });

            await pptx.writeFile({ fileName: `Blueprint_Corrected_${Date.now()}.pptx` });
        };

        // PPT_BETA 내보내기 로직 실행
        const runExport = async () => {
            try {
                // 실제 화면 데이터 수집
                const selectedScreens = screens.filter(screen => screenIds.includes(screen.id));
                
                if (selectedScreens.length === 0) {
                    throw new Error('선택된 화면을 찾을 수 없습니다.');
                }

                console.log('Exporting screens:', selectedScreens.map(s => ({ id: s.id, name: s.name })));
                
                await exportLayoutToPPT(selectedScreens);
                
                console.log('PPT_BETA export completed');
                onComplete?.();
            } catch (error) {
                console.error('PPT_BETA export error:', error);
                onError?.(`PPT_BETA 내보내기 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
            }
        };

        runExport();
    }, [screenIds, screens, onComplete, onError]);

    return (
        <div className="p-4">
            <h3 className="text-lg font-bold mb-2">PPT_BETA 레이아웃 내보내기</h3>
            <p className="text-sm text-gray-600 mb-4">
                선택된 {screenIds.length}개 화면의 뼈대 구조를 PPT 슬라이드로 내보내는 중...
            </p>
            
            {/* 진행 상태 표시 */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm">화면 레이아웃 분석 중...</span>
                </div>
                
                {/* 추가 진행 상태 요소들 */}
                <div className="text-xs text-gray-500 space-y-1">
                    <div>• 화면 크기 및 비율 계산</div>
                    <div>• 헤더 격자 구조 생성</div>
                    <div>• 본문 영역 분할 (70:30)</div>
                    <div>• 우측 패널 3단 구성</div>
                    <div>• PPT 파일 생성 및 다운로드</div>
                </div>
            </div>
        </div>
    );
};

export default PPTBetaExporter;
