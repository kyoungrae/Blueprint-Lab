import React, { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useYjsStore } from '../../../store/yjsStore';
import type { ProcessFlowNode as ProcessFlowNodeType } from '../../../types/processFlow';
import { User as UserIcon, UserCog } from 'lucide-react';

interface ProcessFlowNodeProps {
    data: ProcessFlowNodeType & { label?: string };
    selected?: boolean;
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

    // Auto-resize textarea based on content
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

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // Enter만 누르면 저장
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            setIsEditing(false);
            setEditText(data.text ?? '');
        }
        // Shift+Enter는 기본 동작(줄바꿈) 유지
    }, [handleSave, data.text]);

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

    /** 시각적으로는 한 점. target을 먼저 그리고 source를 위에 두면, RF getClosestHandle이 연결 끝에서 같은 좌표면 target을 우선함 */
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

    const handlesFourWay = (
        <>
            <Handle type="target" position={Position.Top} id="in-top" className={connHandleClass} style={{ ...connDot, left: '50%', top: -4, transform: 'translateX(-50%)' }} />
            <Handle type="source" position={Position.Top} id="top" className={connHandleClass} style={{ ...connDot, left: '50%', top: -4, transform: 'translateX(-50%)' }} />
            <Handle type="target" position={Position.Right} id="in-right" className={connHandleClass} style={{ ...connDot, top: '50%', right: -4, transform: 'translateY(-50%)' }} />
            <Handle type="source" position={Position.Right} id="right" className={connHandleClass} style={{ ...connDot, top: '50%', right: -4, transform: 'translateY(-50%)' }} />
            <Handle type="target" position={Position.Bottom} id="in-bottom" className={connHandleClass} style={{ ...connDot, left: '50%', bottom: -4, transform: 'translateX(-50%)' }} />
            <Handle type="source" position={Position.Bottom} id="bottom" className={connHandleClass} style={{ ...connDot, left: '50%', bottom: -4, transform: 'translateX(-50%)' }} />
            <Handle type="target" position={Position.Left} id="in-left" className={connHandleClass} style={{ ...connDot, top: '50%', left: -4, transform: 'translateY(-50%)' }} />
            <Handle type="source" position={Position.Left} id="left" className={connHandleClass} style={{ ...connDot, top: '50%', left: -4, transform: 'translateY(-50%)' }} />
        </>
    );

    return (
        <>
            {handlesFourWay}

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
                                fontSize: nodeStyle.fontSize,
                                color: nodeStyle.color,
                                fontWeight: nodeStyle.fontWeight,
                                fontStyle: nodeStyle.fontStyle,
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
                                fontSize: nodeStyle.fontSize,
                                color: nodeStyle.color,
                                fontWeight: nodeStyle.fontWeight,
                                fontStyle: nodeStyle.fontStyle,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {data.text ?? (data.userRole === 'admin' ? '관리자' : '사용자')}
                        </div>
                    )}
                </div>
            ) : (
                <div
                    className={`px-3 py-2 border-2 rounded-xl cursor-pointer transition-all duration-200 hover:shadow-lg ${
                        selected ? 'ring-2 ring-emerald-400 ring-offset-2' : ''
                    }`}
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
                    {isEditing ? (
                        <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-transparent border-none outline-none text-center"
                            style={{
                                fontSize: nodeStyle.fontSize,
                                color: nodeStyle.color,
                                fontWeight: nodeStyle.fontWeight,
                                fontStyle: nodeStyle.fontStyle,
                            }}
                            autoFocus
                        />
                    ) : (
                        <span>{data.text ?? 'Node'}</span>
                    )}
                </div>
            )}
        </>
    );
};

export const ProcessFlowNode = memo(ProcessFlowNodeComponent);
