import React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import PremiumTooltip from './PremiumTooltip';

type UndoRedoProps = {
    undo: () => void;
    redo: () => void;
    pastLength: number;
    futureLength: number;
};

const UndoRedoControls: React.FC<UndoRedoProps> = ({ undo, redo, pastLength, futureLength }) => (
    <div className="flex items-center gap-0.5 border-l border-gray-200 ml-1">
        <PremiumTooltip label="되돌리기 (Ctrl+Z)">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    undo();
                }}
                disabled={pastLength <= 1}
                className={`p-2 rounded-lg transition-colors ${
                    pastLength <= 1 ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'
                }`}
            >
                <Undo2 className="w-4 h-4" />
            </button>
        </PremiumTooltip>
        <PremiumTooltip label="다시 실행 (Ctrl+Shift+Z)">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    redo();
                }}
                disabled={futureLength === 0}
                className={`p-2 rounded-lg transition-colors ${
                    futureLength === 0 ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-500'
                }`}
            >
                <Redo2 className="w-4 h-4" />
            </button>
        </PremiumTooltip>
    </div>
);

export default UndoRedoControls;

