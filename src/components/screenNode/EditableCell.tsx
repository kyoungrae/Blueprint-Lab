import React, { memo } from 'react';
import { ChevronDown } from 'lucide-react';

interface EditableCellProps {
    value: string;
    onChange: (val: string) => void;
    onBlur?: (val: string) => void;
    isLocked: boolean;
    placeholder?: string;
    className?: string;
    isSelect?: boolean;
    options?: readonly string[];
    mono?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = memo(({ value, onChange, onBlur, isLocked, placeholder, className = '', isSelect, options, mono }) => {
    if (isSelect && options) {
        return (
            <div className="relative w-full h-full flex items-center">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => onBlur?.(e.target.value)}
                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                    disabled={isLocked}
                    className={`w-full h-full bg-transparent border-none outline-none text-xs p-1 appearance-none ${isLocked ? 'text-gray-700' : 'nodrag text-gray-900 cursor-pointer hover:bg-blue-50 transition-colors'} ${className}`}
                >
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {!isLocked && <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
            </div>
        );
    }
    return (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onBlur?.(e.target.value)}
            onMouseDown={(e) => !isLocked && e.stopPropagation()}
            disabled={isLocked}
            className={`w-full bg-transparent border-none outline-none text-xs p-1 ${isLocked ? 'text-gray-700' : 'nodrag text-gray-900 hover:bg-blue-50 focus:bg-blue-50 rounded transition-colors'} ${mono ? 'font-mono' : ''} ${className}`}
            placeholder={placeholder}
            spellCheck={false}
        />
    );
});

export default EditableCell;
