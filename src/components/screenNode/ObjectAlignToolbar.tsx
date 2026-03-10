import React from 'react';
import PremiumTooltip from './PremiumTooltip';
import {
    AlignHorizontalJustifyStart,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    AlignHorizontalDistributeCenter,
    AlignVerticalDistributeCenter,
} from 'lucide-react';

type Action =
    | 'align-left'
    | 'align-center-h'
    | 'align-right'
    | 'align-top'
    | 'align-center-v'
    | 'align-bottom'
    | 'distribute-h'
    | 'distribute-v';

type Props = {
    selectedElementIds: string[];
    onAlign: (action: Action) => void;
};

const ObjectAlignToolbar: React.FC<Props> = ({ selectedElementIds, onAlign }) => {
    if (selectedElementIds.length < 2) return null;

    const canDistribute = selectedElementIds.length >= 3;

    return (
        <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
            <div className="flex gap-0.5 bg-gradient-to-r from-indigo-50 to-blue-50 p-0.5 rounded-lg border border-indigo-100">
                <PremiumTooltip label="객체 왼쪽 정렬">
                    <button
                        onClick={() => onAlign('align-left')}
                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                    >
                        <AlignHorizontalJustifyStart size={16} />
                    </button>
                </PremiumTooltip>
                <PremiumTooltip label="객체 가로 중앙 정렬">
                    <button
                        onClick={() => onAlign('align-center-h')}
                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                    >
                        <AlignHorizontalJustifyCenter size={16} />
                    </button>
                </PremiumTooltip>
                <PremiumTooltip label="객체 오른쪽 정렬">
                    <button
                        onClick={() => onAlign('align-right')}
                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                    >
                        <AlignHorizontalJustifyEnd size={16} />
                    </button>
                </PremiumTooltip>
            </div>
            <div className="flex gap-0.5 bg-gradient-to-r from-indigo-50 to-blue-50 p-0.5 rounded-lg border border-indigo-100">
                <PremiumTooltip label="객체 상단 정렬">
                    <button
                        onClick={() => onAlign('align-top')}
                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                    >
                        <AlignVerticalJustifyStart size={16} />
                    </button>
                </PremiumTooltip>
                <PremiumTooltip label="객체 세로 중앙 정렬">
                    <button
                        onClick={() => onAlign('align-center-v')}
                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                    >
                        <AlignVerticalJustifyCenter size={16} />
                    </button>
                </PremiumTooltip>
                <PremiumTooltip label="객체 하단 정렬">
                    <button
                        onClick={() => onAlign('align-bottom')}
                        className="p-1.5 rounded-md transition-all text-indigo-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm"
                    >
                        <AlignVerticalJustifyEnd size={16} />
                    </button>
                </PremiumTooltip>
            </div>
            {canDistribute && (
                <div className="flex gap-0.5 bg-gradient-to-r from-purple-50 to-pink-50 p-0.5 rounded-lg border border-purple-100">
                    <PremiumTooltip label="가로 균등 분배">
                        <button
                            onClick={() => onAlign('distribute-h')}
                            className="p-1.5 rounded-md transition-all text-purple-400 hover:text-purple-600 hover:bg-white hover:shadow-sm"
                        >
                            <AlignHorizontalDistributeCenter size={16} />
                        </button>
                    </PremiumTooltip>
                    <PremiumTooltip label="세로 균등 분배">
                        <button
                            onClick={() => onAlign('distribute-v')}
                            className="p-1.5 rounded-md transition-all text-purple-400 hover:text-purple-600 hover:bg-white hover:shadow-sm"
                        >
                            <AlignVerticalDistributeCenter size={16} />
                        </button>
                    </PremiumTooltip>
                </div>
            )}
        </div>
    );
};

export default ObjectAlignToolbar;

