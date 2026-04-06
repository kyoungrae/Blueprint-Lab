import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useYjsStore } from '../../../store/yjsStore';
import type { ProcessFlowNode as ProcessFlowNodeType, ProcessFlowRectShape } from '../../../types/processFlow';
import { User as UserIcon, UserCog } from 'lucide-react';

interface ProcessFlowNodeProps {
    data: ProcessFlowNodeType & { label?: string };
    selected?: boolean;
}

function resolveRectShape(data: ProcessFlowNodeType): ProcessFlowRectShape {
    if (data.type !== 'RECT') return 'rectangle';
    return data.shape ?? 'rectangle';
}

/** 플로우차트 입출력형 평행사변형: 상·하변 수평, 좌·우변 평행 기울기 */
function parallelogramParams(W: number, H: number, bw: number) {
    const pad = Math.max(4, Math.ceil(bw));
    const maxSkew = Math.max(0, W - 2 * pad - 20);
    const desired = Math.min(Math.round(W * 0.22), Math.round(H * 0.42), 72);
    const skew = maxSkew <= 0 ? 0 : Math.max(8, Math.min(desired, maxSkew));
    return { pad, skew };
}

const ProcessFlowNodeComponent: React.FC<ProcessFlowNodeProps> = ({ data, selected }) => {
    const yjsUpdateNode = useYjsStore((s: any) => s.pfUpdateNode);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(data.text ?? '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleDoubleClick = useCallback(() => {
        setIsEditing(true);
        setEditText(data.text ?? '');
    }, [data.text]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            const textarea = textareaRef.current;
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 80)}px`;
        }
    }, [editText, isEditing]);

    const handleSave = useCallback(() => {
        const trimmed = editText.trim();
        if (trimmed !== (data.text ?? '')) {
            yjsUpdateNode(data.id, { text: trimmed });
        }
        setIsEditing(false);
    }, [data.text, editText, yjsUpdateNode, data.id]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
            }
            if (e.key === 'Escape') {
                setIsEditing(false);
                setEditText(data.text ?? '');
            }
        },
        [handleSave, data.text]
    );

    const nodeStyle = {
        background: data.style?.fill ?? '#ffffff',
        borderColor: data.style?.stroke ?? '#94a3b8',
        borderWidth: data.style?.strokeWidth ?? 1,
        borderRadius: data.style?.radius ?? 12,
        width: data.style?.width ?? 240,
        height: data.style?.height ?? 120,
        color: data.textStyle?.color ?? '#0f172a',
        fontSize: data.textStyle?.fontSize ?? 14,
        fontWeight: data.textStyle?.bold ? 700 : 500,
        fontStyle: data.textStyle?.italic ? 'italic' : 'normal',
    };

    const isUserNode = data.type === 'USER';
    const rectShape = resolveRectShape(data);
    const bw = Number(nodeStyle.borderWidth) || 1;
    const W = nodeStyle.width;
    const H = nodeStyle.height;

    const connDot: React.CSSProperties = {
        width: 10,
        height: 10,
        minWidth: 10,
        minHeight: 10,
        background: '#10b981',
        border: '2px solid #fff',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.2)',
    };

    const connHandleClass = 'pf-process-flow-conn-handle';
    /**
     * 연결점(10px + 흰 테두리)이 부모 노드 박스 밖으로 나가면 잘림.
     * 모든 도형 공통으로 W×H 경계 안쪽에 중심을 둔다 (상·하·좌·우 변 중앙).
     */
    const handleInset = -5;
    const handleCenterStyle = { transform: 'translate(-50%, -50%)' as const };

    const handlesInParentBox = (
        <>
            <Handle
                type="target"
                position={Position.Top}
                id="in-top"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Top}
                id="top"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="target"
                position={Position.Right}
                id="in-right"
                className={connHandleClass}
                style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="right"
                className={connHandleClass}
                style={{ ...connDot, left: W - handleInset, top: '50%', ...handleCenterStyle }}
            />
            <Handle
                type="target"
                position={Position.Bottom}
                id="in-bottom"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                id="bottom"
                className={connHandleClass}
                style={{ ...connDot, left: '50%', top: H - handleInset, ...handleCenterStyle }}
            />
            <Handle
                type="target"
                position={Position.Left}
                id="in-left"
                className={connHandleClass}
                style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle }}
            />
            <Handle
                type="source"
                position={Position.Left}
                id="left"
                className={connHandleClass}
                style={{ ...connDot, left: handleInset, top: '50%', ...handleCenterStyle }}
            />
        </>
    );

    const textStyleProps: React.CSSProperties = {
        fontSize: nodeStyle.fontSize,
        color: nodeStyle.color,
        fontWeight: nodeStyle.fontWeight,
        fontStyle: nodeStyle.fontStyle,
    };

    const rectBody = (
        <>
            {isEditing ? (
                <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className="w-full max-w-[90%] bg-transparent border-none outline-none text-center"
                    style={textStyleProps}
                    autoFocus
                />
            ) : (
                <span className="px-1 text-center" style={{ ...textStyleProps, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {data.text ?? 'Process'}
                </span>
            )}
        </>
    );

    const ringClass = selected ? 'ring-2 ring-emerald-400 ring-offset-2' : '';

    const renderRectShell = () => {
        switch (rectShape) {
            case 'diamond': {
                const o = Math.max(4, Math.ceil(bw));
                const cx = W / 2;
                const cy = H / 2;
                const pts = `${cx},${o} ${W - o},${cy} ${cx},${H - o} ${o},${cy}`;
                return (
                    <div
                        className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${ringClass}`}
                        style={{ width: W, height: H }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg className="absolute inset-0 h-full w-full" aria-hidden>
                            <polygon points={pts} fill={nodeStyle.background} stroke={nodeStyle.borderColor} strokeWidth={bw} strokeLinejoin="round" />
                        </svg>
                        <div className="relative z-10 flex h-full w-full items-center justify-center px-3 py-2">{rectBody}</div>
                    </div>
                );
            }
            case 'trapezoid': {
                const { pad, skew } = parallelogramParams(W, H, bw);
                const pts = `${pad + skew},${pad} ${W - pad},${pad} ${W - pad - skew},${H - pad} ${pad},${H - pad}`;
                return (
                    <div
                        className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${ringClass}`}
                        style={{ width: W, height: H }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg className="absolute inset-0 h-full w-full" aria-hidden>
                            <polygon points={pts} fill={nodeStyle.background} stroke={nodeStyle.borderColor} strokeWidth={bw} strokeLinejoin="round" />
                        </svg>
                        <div className="relative z-10 flex h-full w-full items-center justify-center px-4 py-2">{rectBody}</div>
                    </div>
                );
            }
            case 'db': {
                const pad = Math.max(2, bw);
                const cx = W / 2;
                const rx = Math.min((W - 2 * pad) * 0.4, W / 2 - pad - 1);
                const ry = Math.min(H * 0.085, 11);
                const ty = pad + ry + 2;
                const gapBetweenTiers = Math.max(4, bw * 1.5);
                /** 윗타원 좌·우 끝점 (cx±rx, ty)에서 세로가 이어지도록 몸통 시작 = 타원 중심 높이 */
                const bodyStart = ty;
                const bottomArcCenterY = H - pad - ry - 2;
                const usable = Math.max(0, bottomArcCenterY - bodyStart - 2 * gapBetweenTiers);
                const tierV = usable > 0 ? usable / 3 : Math.max(8, (H - bodyStart - 2 * gapBetweenTiers) / 3);
                const c0 = bodyStart + tierV;
                const c1 = c0 + gapBetweenTiers + tierV;
                const c2 = c1 + gapBetweenTiers + tierV;
                const y0 = bodyStart;
                const y1 = c0 + gapBetweenTiers;
                const y2 = c1 + gapBetweenTiers;
                const arcSweepDown = 0;
                /** 본체 채움: (cx±rx,ty)에서 내려가 맨 아래 호로 닫고, 윗면은 타원 아래쪽 반원으로 상단 경계 연결 */
                const bodyFill = [
                    `M ${cx - rx} ${ty}`,
                    `L ${cx - rx} ${c2}`,
                    `A ${rx} ${ry} 0 0 ${arcSweepDown} ${cx + rx} ${c2}`,
                    `L ${cx + rx} ${ty}`,
                    `A ${rx} ${ry} 0 0 0 ${cx - rx} ${ty}`,
                    'Z',
                ].join(' ');
                const bulletR = Math.max(2, Math.min(3.5, bw + 1.2));
                const bulletX = cx - rx + bulletR + Math.max(3, bw);
                const tiers = [
                    { yTop: y0, c: c0 },
                    { yTop: y1, c: c1 },
                    { yTop: y2, c: c2 },
                ] as const;
                return (
                    <div
                        className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${ringClass}`}
                        style={{ width: W, height: H }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                            <ellipse cx={cx} cy={ty} rx={rx} ry={ry} fill={nodeStyle.background} />
                            <path d={bodyFill} fill={nodeStyle.background} />
                            <g
                                fill="none"
                                stroke={nodeStyle.borderColor}
                                strokeWidth={bw}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            >
                                <ellipse cx={cx} cy={ty} rx={rx} ry={ry} />
                                {tiers.map(({ yTop, c }) => (
                                    <React.Fragment key={`${yTop}-${c}`}>
                                        <line x1={cx - rx} y1={yTop} x2={cx - rx} y2={c} />
                                        <line x1={cx + rx} y1={yTop} x2={cx + rx} y2={c} />
                                        <path d={`M ${cx - rx} ${c} A ${rx} ${ry} 0 0 ${arcSweepDown} ${cx + rx} ${c}`} />
                                    </React.Fragment>
                                ))}
                            </g>
                            <g fill={nodeStyle.borderColor}>
                                {tiers.map(({ yTop, c }) => (
                                    <circle
                                        key={`b-${yTop}`}
                                        cx={bulletX}
                                        cy={(yTop + c) / 2}
                                        r={bulletR}
                                    />
                                ))}
                            </g>
                        </svg>
                        <div className="relative z-10 flex h-full w-full items-center justify-center px-3 py-5">{rectBody}</div>
                    </div>
                );
            }
            default:
                return (
                    <div
                        className={`cursor-pointer border-2 px-3 py-2 transition-all duration-200 hover:shadow-lg ${ringClass} rounded-xl`}
                        style={{
                            ...nodeStyle,
                            borderStyle: 'solid',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}
                        onDoubleClick={handleDoubleClick}
                    >
                        {rectBody}
                    </div>
                );
        }
    };

    return (
        <>
            {handlesInParentBox}

            {isUserNode ? (
                <div
                    className={`cursor-pointer transition-all duration-200 ${selected ? 'ring-2 ring-emerald-400 ring-offset-2 rounded-2xl' : ''}`}
                    style={{
                        width: nodeStyle.width - 135,
                        height: nodeStyle.height - 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                    }}
                    onDoubleClick={handleDoubleClick}
                >
                    <div
                        className="flex items-center justify-center border-2 shadow-sm"
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 9999,
                            background: '#ffffff',
                            borderColor: nodeStyle.borderColor,
                            borderWidth: nodeStyle.borderWidth,
                            borderStyle: 'solid',
                        }}
                    >
                        {data.userRole === 'admin' ? (
                            <UserCog size={24} className="text-slate-700" />
                        ) : (
                            <UserIcon size={24} className="text-slate-700" />
                        )}
                    </div>

                    {isEditing ? (
                        <textarea
                            ref={textareaRef}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-transparent border-b border-gray-200 outline-none text-center px-2 resize-none overflow-hidden"
                            style={{
                                ...textStyleProps,
                                minHeight: '20px',
                                maxHeight: '80px',
                            }}
                            autoFocus
                            rows={1}
                        />
                    ) : (
                        <div
                            className="w-full text-center px-2"
                            style={{
                                ...textStyleProps,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {data.text ?? (data.userRole === 'admin' ? '관리자' : '사용자')}
                        </div>
                    )}
                </div>
            ) : (
                renderRectShell()
            )}
        </>
    );
};

export const ProcessFlowNode = memo(ProcessFlowNodeComponent);
