import React from 'react';
import type { Screen } from '../../types/screenDesign';
import PremiumTooltip from './PremiumTooltip';

type GuideLines = Screen['guideLines'] | undefined;

type Props = {
    guideLines: GuideLines;
    gridClipboard: { vertical: number[]; horizontal: number[] } | null;
    setGridClipboard: (value: { vertical: number[]; horizontal: number[] } | null) => void;
    update: (updates: { guideLines: { vertical: number[]; horizontal: number[] } }) => void;
    syncUpdate: (updates: { guideLines: { vertical: number[]; horizontal: number[] } }) => void;
};

const GuideClipboardControls: React.FC<Props> = ({
    guideLines,
    gridClipboard,
    setGridClipboard,
    update,
    syncUpdate,
}) => {
    if (guideLines == null) return null;

    return (
        <div className="flex flex-col gap-1 pt-1 mt-1 border-t border-gray-100">
            <span className="text-[10px] font-medium text-gray-500">격자 복사 · 붙여넣기</span>
            <div className="flex items-center gap-1">
                <PremiumTooltip label="현재 격자를 복사해 다른 화면에 붙여넣을 수 있습니다">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setGridClipboard({
                                vertical: [...(guideLines.vertical ?? [])],
                                horizontal: [...(guideLines.horizontal ?? [])],
                            });
                        }}
                        className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-600"
                    >
                        격자 복사
                    </button>
                </PremiumTooltip>
                <PremiumTooltip
                    label={
                        gridClipboard
                            ? '복사한 격자를 이 화면에 적용합니다'
                            : '먼저 다른 화면에서 격자를 복사하세요'
                    }
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!gridClipboard) return;
                            const next = {
                                vertical: [...gridClipboard.vertical],
                                horizontal: [...gridClipboard.horizontal],
                            };
                            update({ guideLines: next });
                            syncUpdate({ guideLines: next });
                        }}
                        disabled={!gridClipboard}
                        className="px-2 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        격자 붙여넣기
                    </button>
                </PremiumTooltip>
            </div>
        </div>
    );
};

export default GuideClipboardControls;

