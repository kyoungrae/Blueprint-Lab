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
                const capH = Math.max(10, H * 0.14);
                const capTop = H * 0.06;
                const bodyTop = capTop + capH * 0.45;
                const bodyH = H - bodyTop - (capH * 0.55);
                const capRx = W * 0.38;
                const capRy = capH * 0.42;
                const cx = W / 2;
                return (
                    <div
                        className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg ${ringClass}`}
                        style={{ width: W, height: H }}
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                            <ellipse
                                cx={cx}
                                cy={capTop + capRy}
                                rx={capRx}
                                ry={capRy}
                                fill={nodeStyle.background}
                                stroke={nodeStyle.borderColor}
                                strokeWidth={bw}
                            />
                            <rect
                                x={bw / 2}
                                y={bodyTop}
                                width={W - bw}
                                height={bodyH}
                                fill={nodeStyle.background}
                                stroke={nodeStyle.borderColor}
                                strokeWidth={bw}
                            />
                            <ellipse
                                cx={cx}
                                cy={bodyTop + bodyH}
                                rx={capRx}
                                ry={capRy}
                                fill={nodeStyle.background}
                                stroke={nodeStyle.borderColor}
                                strokeWidth={bw}
                            />
                            <line
                                x1={bw}
                                y1={bodyTop}
                                x2={W - bw}
                                y2={bodyTop}
                                stroke={nodeStyle.borderColor}
                                strokeWidth={bw}
                            />
                        </svg>
                        <div className="relative z-10 flex h-full w-full items-center justify-center px-3 py-6">{rectBody}</div>
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
