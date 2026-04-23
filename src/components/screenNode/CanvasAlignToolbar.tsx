import React from 'react';
import type { DrawElement } from '../../types/screenDesign';
import PremiumTooltip from './PremiumTooltip';
import {
    AlignHorizontalJustifyStart,
    AlignHorizontalJustifyCenter,
    AlignHorizontalJustifyEnd,
    AlignVerticalJustifyStart,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
} from 'lucide-react';

type Props = {
    selectedElementIds: string[];
    textSelectionRect: DOMRect | null | undefined;
    drawElements: DrawElement[];
    canvasW: number;
    canvasH: number;
    update: (updates: { drawElements: DrawElement[] }) => void;
    syncUpdate: (updates: { drawElements: DrawElement[] }) => void;
};

const CanvasAlignToolbar: React.FC<Props> = ({
    selectedElementIds,
    textSelectionRect: _textSelectionRect,
    drawElements,
    canvasW,
    canvasH,
    update,
    syncUpdate,
}) => {
    if (selectedElementIds.length === 0) return null;
    const textAlignTargetTypes = new Set<DrawElement['type']>(['text', 'rect', 'circle', 'polygon', 'arrow', 'func-no']);
    const textAlignTargetIds = drawElements
        .filter((el) => selectedElementIds.includes(el.id) && textAlignTargetTypes.has(el.type))
        .map((el) => el.id);
    const firstTextAlignTarget = drawElements.find((el) => textAlignTargetIds.includes(el.id));

    return (
        <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1 ml-1 animate-in fade-in duration-200">
            {textAlignTargetIds.length > 0 && (
                <>
                    <div className="flex gap-0.5 bg-amber-50 p-0.5 rounded-lg border border-amber-100">
                        {(['left', 'center', 'right'] as const).map((align) => (
                            <PremiumTooltip
                                key={`text-${align}`}
                                label={`텍스트 ${align === 'left' ? '왼쪽' : align === 'right' ? '오른쪽' : '중앙'} 정렬`}
                            >
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        const targetSet = new Set(textAlignTargetIds);
                                        const nextElements = drawElements.map((el) =>
                                            targetSet.has(el.id) ? { ...el, textAlign: align } : el,
                                        );
                                        update({ drawElements: nextElements });
                                        syncUpdate({ drawElements: nextElements });
                                    }}
                                    className={`p-1.5 rounded-md transition-all ${
                                        firstTextAlignTarget?.textAlign === align
                                            ? 'bg-white shadow-sm text-amber-600'
                                            : 'text-amber-400 hover:text-amber-600'
                                    }`}
                                >
                                    {align === 'left' ? (
                                        <AlignHorizontalJustifyStart size={16} />
                                    ) : align === 'right' ? (
                                        <AlignHorizontalJustifyEnd size={16} />
                                    ) : (
                                        <AlignHorizontalJustifyCenter size={16} />
                                    )}
                                </button>
                            </PremiumTooltip>
                        ))}
                    </div>
                    <div className="flex gap-0.5 bg-amber-50 p-0.5 rounded-lg border border-amber-100">
                        {(['top', 'middle', 'bottom'] as const).map((vAlign) => (
                            <PremiumTooltip
                                key={`text-v-${vAlign}`}
                                label={`텍스트 ${vAlign === 'top' ? '상단' : vAlign === 'bottom' ? '하단' : '중앙'} 정렬`}
                            >
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        const targetSet = new Set(textAlignTargetIds);
                                        const nextElements = drawElements.map((el) =>
                                            targetSet.has(el.id) ? { ...el, verticalAlign: vAlign } : el,
                                        );
                                        update({ drawElements: nextElements });
                                        syncUpdate({ drawElements: nextElements });
                                    }}
                                    className={`p-1.5 rounded-md transition-all ${
                                        firstTextAlignTarget?.verticalAlign === vAlign
                                            ? 'bg-white shadow-sm text-amber-600'
                                            : 'text-amber-400 hover:text-amber-600'
                                    }`}
                                >
                                    {vAlign === 'top' ? (
                                        <AlignVerticalJustifyStart size={16} />
                                    ) : vAlign === 'bottom' ? (
                                        <AlignVerticalJustifyEnd size={16} />
                                    ) : (
                                        <AlignVerticalJustifyCenter size={16} />
                                    )}
                                </button>
                            </PremiumTooltip>
                        ))}
                    </div>
                </>
            )}
            <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                {(['left', 'center', 'right'] as const).map((align) => (
                    <PremiumTooltip
                        key={align}
                        label={`캔버스 ${align === 'left' ? '왼쪽' : align === 'right' ? '오른쪽' : '중앙'} 정렬`}
                    >
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                const selectedBaseEls = drawElements.filter((el) => selectedElementIds.includes(el.id));
                                const expandedSelectedIds = (() => {
                                    if (selectedBaseEls.length !== 1) return selectedElementIds;
                                    const gid = selectedBaseEls[0].groupId;
                                    if (!gid) return selectedElementIds;
                                    return drawElements.filter((el) => el.groupId === gid).map((el) => el.id);
                                })();
                                const selectedEls = drawElements.filter((el) => expandedSelectedIds.includes(el.id));
                                if (selectedEls.length === 0) return;

                                type ElGroup = { id: string; elements: DrawElement[] };
                                const groupMap = new Map<string, ElGroup>();
                                const groups: ElGroup[] = [];

                                for (const el of selectedEls) {
                                    const gid = el.groupId ?? el.id;
                                    let grp = groupMap.get(gid);
                                    if (!grp) {
                                        grp = { id: gid, elements: [] };
                                        groupMap.set(gid, grp);
                                        groups.push(grp);
                                    }
                                    grp.elements.push(el);
                                }

                                const groupOffsets = new Map<string, number>();

                                for (const grp of groups) {
                                    const left = Math.min(...grp.elements.map((e) => e.x));
                                    const right = Math.max(...grp.elements.map((e) => e.x + e.width));
                                    const groupCenter = (left + right) / 2;

                                    let targetCenter = groupCenter;
                                    let targetLeft = left;

                                    if (align === 'left') {
                                        targetLeft = 10;
                                        targetCenter = targetLeft + (right - left) / 2;
                                    } else if (align === 'center') {
                                        targetCenter = canvasW / 2;
                                    } else if (align === 'right') {
                                        targetLeft = canvasW - (right - left) - 10;
                                        targetCenter = targetLeft + (right - left) / 2;
                                    }

                                    const dx = targetCenter - groupCenter;
                                    groupOffsets.set(grp.id, dx);
                                }

                                const nextElements = drawElements.map((el) => {
                                    if (!expandedSelectedIds.includes(el.id)) return el;
                                    const gid = el.groupId ?? el.id;
                                    const dx = groupOffsets.get(gid) ?? 0;
                                    return { ...el, x: el.x + dx };
                                });

                                update({ drawElements: nextElements });
                                syncUpdate({ drawElements: nextElements });
                            }}
                            className="p-1.5 rounded-md transition-all text-gray-400 hover:text-gray-600"
                        >
                            {align === 'left' ? (
                                <AlignHorizontalJustifyStart size={16} />
                            ) : align === 'right' ? (
                                <AlignHorizontalJustifyEnd size={16} />
                            ) : (
                                <AlignHorizontalJustifyCenter size={16} />
                            )}
                        </button>
                    </PremiumTooltip>
                ))}
            </div>
            <div className="flex gap-0.5 bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                {(['top', 'middle', 'bottom'] as const).map((vAlign) => (
                    <PremiumTooltip
                        key={vAlign}
                        label={`캔버스 ${vAlign === 'top' ? '상단' : vAlign === 'bottom' ? '하단' : '중앙'} 정렬`}
                    >
                        <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                const selectedBaseEls = drawElements.filter((el) => selectedElementIds.includes(el.id));
                                const expandedSelectedIds = (() => {
                                    if (selectedBaseEls.length !== 1) return selectedElementIds;
                                    const gid = selectedBaseEls[0].groupId;
                                    if (!gid) return selectedElementIds;
                                    return drawElements.filter((el) => el.groupId === gid).map((el) => el.id);
                                })();
                                const selectedEls = drawElements.filter((el) => expandedSelectedIds.includes(el.id));
                                if (selectedEls.length === 0) return;

                                type ElGroup = { id: string; elements: DrawElement[] };
                                const groupMap = new Map<string, ElGroup>();
                                const groups: ElGroup[] = [];
                                for (const el of selectedEls) {
                                    const gid = el.groupId ?? el.id;
                                    let grp = groupMap.get(gid);
                                    if (!grp) {
                                        grp = { id: gid, elements: [] };
                                        groupMap.set(gid, grp);
                                        groups.push(grp);
                                    }
                                    grp.elements.push(el);
                                }
                                const groupOffsets = new Map<string, number>();
                                for (const grp of groups) {
                                    const top = Math.min(...grp.elements.map((e) => e.y));
                                    const bottom = Math.max(...grp.elements.map((e) => e.y + e.height));
                                    const groupMiddle = (top + bottom) / 2;
                                    let targetMiddle = groupMiddle;
                                    let targetTop = top;
                                    if (vAlign === 'top') {
                                        targetTop = 10;
                                        targetMiddle = targetTop + (bottom - top) / 2;
                                    } else if (vAlign === 'middle') {
                                        targetMiddle = canvasH / 2;
                                    } else if (vAlign === 'bottom') {
                                        targetTop = canvasH - (bottom - top) - 10;
                                        targetMiddle = targetTop + (bottom - top) / 2;
                                    }
                                    const dy = targetMiddle - groupMiddle;
                                    groupOffsets.set(grp.id, dy);
                                }
                                const nextElements = drawElements.map((el) => {
                                    if (!expandedSelectedIds.includes(el.id)) return el;
                                    const gid = el.groupId ?? el.id;
                                    const dy = groupOffsets.get(gid) ?? 0;
                                    return { ...el, y: el.y + dy };
                                });
                                update({ drawElements: nextElements });
                                syncUpdate({ drawElements: nextElements });
                            }}
                            className="p-1.5 rounded-md transition-all text-gray-400 hover:text-gray-600"
                        >
                            {vAlign === 'top' ? (
                                <AlignVerticalJustifyStart size={16} />
                            ) : vAlign === 'bottom' ? (
                                <AlignVerticalJustifyEnd size={16} />
                            ) : (
                                <AlignVerticalJustifyCenter size={16} />
                            )}
                        </button>
                    </PremiumTooltip>
                ))}
            </div>
        </div>
    );
};

export default CanvasAlignToolbar;

