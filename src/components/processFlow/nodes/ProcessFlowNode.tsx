import React, { memo, useCallback, useState } from 'react';
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

    const handleDoubleClick = useCallback(() => {
        setIsEditing(true);
        setEditText(data.text ?? '');
    }, [data.text]);

    const handleSave = useCallback(() => {
        const trimmed = editText.trim();
        if (trimmed !== (data.text ?? '')) {
            yjsUpdateNode(data.id, { text: trimmed });
        }
        setIsEditing(false);
    }, [data.text, editText, yjsUpdateNode, data.id]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            setIsEditing(false);
            setEditText(data.text ?? '');
        }
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

    return (
        <>
            {/* Handles for 4-way connections */}
            {isUserNode ? (
                <>
                    <Handle type="target" position={Position.Top} style={{ background: '#10b981', top: 5 }} />
                    <Handle type="source" position={Position.Right} style={{ background: '#10b981', left: 'auto', right: 62 }} />
                    <Handle type="source" position={Position.Bottom} style={{ background: '#10b981', top: 'auto', bottom: 5 }} />
                    <Handle type="target" position={Position.Left} style={{ background: '#10b981', left: 62 }} />
                </>
            ) : (
                <>
                    <Handle type="target" position={Position.Top} id="top" style={{ background: '#10b981' }} />
                    <Handle type="source" position={Position.Right} id="right" style={{ background: '#10b981' }} />
                    <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#10b981' }} />
                    <Handle type="target" position={Position.Left} id="left" style={{ background: '#10b981' }} />
                </>
            )}

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
                        <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-transparent border-b border-gray-200 outline-none text-center px-2"
                            style={{
                                fontSize: nodeStyle.fontSize,
                                color: nodeStyle.color,
                                fontWeight: nodeStyle.fontWeight,
                                fontStyle: nodeStyle.fontStyle,
                            }}
                            autoFocus
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
