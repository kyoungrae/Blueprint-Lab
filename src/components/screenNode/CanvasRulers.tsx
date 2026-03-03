import { memo } from 'react';

interface CanvasRulersProps {
    canvasWidth: number;
    canvasHeight: number;
    inset: number;
    visible?: boolean;
    children: React.ReactNode;
}

const TICK_INTERVAL_MAJOR = 100;
const TICK_INTERVAL_MEDIUM = 50; // 0.5 단위
const TICK_INTERVAL_MINOR = 20; // 4 minor ticks between majors = 5 subdivisions per unit

const RULER_BG = '#f5f5f5';
const TICK_COLOR_MAJOR = '#a0a0a0';
const TICK_COLOR_MEDIUM = '#b8b8b8';
const TICK_COLOR_MINOR = '#d0d0d0';
const NUMBER_COLOR = '#888888';

const CanvasRulers = memo(({ canvasWidth, canvasHeight, inset, visible = true, children }: CanvasRulersProps) => {
    if (!visible || inset < 4) {
        return <>{children}</>;
    }

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    type TickLevel = 'major' | 'medium' | 'minor';
    const getTickLevel = (v: number): TickLevel => {
        if (v % TICK_INTERVAL_MAJOR === 0) return 'major';
        if (v % TICK_INTERVAL_MEDIUM === 0) return 'medium';
        return 'minor';
    };

    // 가운데 0, 좌우/상하로 ±값 표시, 3단계 눈금
    const horizontalTicks: { x: number; value: number; level: TickLevel }[] = [];
    const minH = -Math.floor(centerX / TICK_INTERVAL_MINOR) * TICK_INTERVAL_MINOR;
    const maxH = Math.ceil(centerX / TICK_INTERVAL_MINOR) * TICK_INTERVAL_MINOR;
    for (let v = minH; v <= maxH; v += TICK_INTERVAL_MINOR) {
        const x = centerX + v;
        if (x >= 0 && x <= canvasWidth) {
            horizontalTicks.push({ x, value: v, level: getTickLevel(v) });
        }
    }

    const verticalTicks: { y: number; value: number; level: TickLevel }[] = [];
    const minV = -Math.floor(centerY / TICK_INTERVAL_MINOR) * TICK_INTERVAL_MINOR;
    const maxV = Math.ceil(centerY / TICK_INTERVAL_MINOR) * TICK_INTERVAL_MINOR;
    for (let v = minV; v <= maxV; v += TICK_INTERVAL_MINOR) {
        const y = centerY + v;
        if (y >= 0 && y <= canvasHeight) {
            verticalTicks.push({ y, value: v, level: getTickLevel(v) });
        }
    }

    const getTickStyle = (level: TickLevel, baseHeight: number) => {
        const heights = { major: 1, medium: 0.7, minor: 0.45 };
        const colors = { major: TICK_COLOR_MAJOR, medium: TICK_COLOR_MEDIUM, minor: TICK_COLOR_MINOR };
        return { height: baseHeight * heights[level], color: colors[level] };
    };
    // 숫자 영역(상단)과 눈금선 영역(하단) 분리 - 겹침 방지
    const horizontalNumberZone = 10; // 숫자 전용 상단 (9px 폰트 + 여유)
    const horizontalTickZone = Math.max(4, inset - horizontalNumberZone); // 눈금선 전용 하단
    const tickBaseHeight = horizontalTickZone - 1; // 눈금선 높이 (숫자와 1px 간격)
    const verticalNumberZone = inset * 0.4; // 세로 눈금자: 숫자 전용 좌측
    const verticalTickZone = inset * 0.4; // 세로 눈금자: 눈금선 전용 우측 (간격으로 겹침 방지)

    return (
        <div
            className="nodrag flex flex-col shrink-0"
            style={{ width: canvasWidth + inset * 2, height: canvasHeight + inset * 2 }}
        >
            {/* Top row: corner + horizontal ruler + corner */}
            <div className="flex" style={{ height: inset }}>
                <div style={{ width: inset, backgroundColor: RULER_BG }} />
                <div
                    className="relative overflow-visible"
                    style={{
                        width: canvasWidth,
                        height: inset,
                        minHeight: inset,
                        backgroundColor: RULER_BG,
                        borderTop: '1px solid #e5e5e5',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
                    }}
                >
                    {/* Numbers - 상단 배치, 눈금선과 분리 (스크린샷 스타일) */}
                    {horizontalTicks.filter(t => t.level === 'major').map(({ x, value }) => (
                        <span
                            key={`hl-${x}`}
                            className="absolute text-[9px] font-medium select-none pointer-events-none leading-none"
                            style={{
                                left: x,
                                top: 0,
                                transform: 'translateX(-50%)',
                                color: NUMBER_COLOR,
                                lineHeight: 1,
                            }}
                        >
                            {value}
                        </span>
                    ))}
                    {/* Tick marks - 하단 배치, 3단계 눈금 (숫자와 겹치지 않음) */}
                    {horizontalTicks.map(({ x, level }) => {
                        const { height, color } = getTickStyle(level, tickBaseHeight);
                        return (
                            <div
                                key={`h-${x}`}
                                className="absolute bottom-0"
                                style={{
                                    left: x,
                                    width: level === 'major' ? 1.5 : 1,
                                    height,
                                    backgroundColor: color,
                                    transform: 'translateX(-50%)',
                                }}
                            />
                        );
                    })}
                </div>
                <div style={{ width: inset, backgroundColor: RULER_BG }} />
            </div>

            {/* Middle row: left ruler + canvas + right spacer */}
            <div className="flex flex-1 min-h-0">
                <div
                    className="relative overflow-visible"
                    style={{
                        width: inset,
                        height: canvasHeight,
                        minWidth: inset,
                        backgroundColor: RULER_BG,
                        borderLeft: '1px solid #e5e5e5',
                        boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.8)',
                    }}
                >
                    {/* Numbers - 좌측 배치, 90deg 시계방향 회전 (스크린샷 스타일) */}
                    {verticalTicks.filter(t => t.level === 'major').map(({ y, value }) => (
                        <span
                            key={`vl-${y}`}
                            className="absolute text-[9px] font-medium select-none pointer-events-none leading-none whitespace-nowrap"
                            style={{
                                left: 2,
                                top: y,
                                width: verticalNumberZone,
                                transform: 'translateY(-50%) rotate(270deg)',
                                transformOrigin: 'center center',
                                textAlign: 'center',
                                color: NUMBER_COLOR,
                            }}
                        >
                            {value}
                        </span>
                    ))}
                    {/* Tick marks - 우측 영역, 3단계 눈금 (숫자와 겹치지 않음) */}
                    {verticalTicks.map(({ y, level }) => {
                        const { color } = getTickStyle(level, tickBaseHeight);
                        const width = level === 'major' ? verticalTickZone : level === 'medium' ? verticalTickZone * 0.7 : verticalTickZone * 0.45;
                        return (
                            <div
                                key={`v-${y}`}
                                className="absolute right-0"
                                style={{
                                    top: y,
                                    height: level === 'major' ? 1.5 : 1,
                                    width,
                                    backgroundColor: color,
                                    transform: 'translateY(-50%)',
                                }}
                            />
                        );
                    })}
                </div>
                <div style={{ width: canvasWidth, height: canvasHeight }} className="shrink-0">
                    {children}
                </div>
                <div style={{ width: inset, backgroundColor: RULER_BG }} />
            </div>

            {/* Bottom row */}
            <div style={{ height: inset, backgroundColor: RULER_BG }} />
        </div>
    );
});

CanvasRulers.displayName = 'CanvasRulers';
export default CanvasRulers;
