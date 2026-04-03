import React, { memo, useCallback, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { useYjsStore } from '../../../store/yjsStore';
import type { ProcessFlowNode as ProcessFlowNodeType } from '../../../types/processFlow';

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

    return (
        <>
            {/* Handles for 4-way connections */}
            <Handle type="target" position={Position.Top} id="top" style={{ background: '#10b981' }} />
            <Handle type="source" position={Position.Right} id="right" style={{ background: '#10b981' }} />
            <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#10b981' }} />
            <Handle type="target" position={Position.Left} id="left" style={{ background: '#10b981' }} />

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
                    <span>{data.text ?? (data.type === 'USER' ? 'User' : 'Node')}</span>
                )}
            </div>
        </>
    );
};

export const ProcessFlowNode = memo(ProcessFlowNodeComponent);
