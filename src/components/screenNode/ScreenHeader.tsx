import React, { useState } from 'react';
import type { Screen } from '../../types/screenDesign';
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_DIMENSIONS_MM, getCanvasDimensions } from '../../types/screenDesign';
import { Lock, Unlock, X, Monitor, SlidersHorizontal, RectangleVertical, RectangleHorizontal } from 'lucide-react';

interface ScreenHeaderProps {
    screen: Screen;
    isLocked: boolean;
    isLockedByOther: boolean;
    lockedBy: string | null | undefined;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    onToggleLock: (e?: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    showScreenOptionsPanel: boolean;
    setShowScreenOptionsPanel: (v: boolean | ((prev: boolean) => boolean)) => void;
    screenOptionsRef: React.RefObject<HTMLDivElement | null>;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
    screen,
    isLocked,
    isLockedByOther,
    lockedBy,
    update,
    syncUpdate,
    onToggleLock,
    onDelete,
    showScreenOptionsPanel,
    setShowScreenOptionsPanel,
    screenOptionsRef,
}) => {
    const [composing, setComposing] = useState<string | null>(null);
    const displayValue = composing !== null ? composing : screen.name;
    const isComponent = screen.screenId?.startsWith('CMP-');
    const namePlaceholder = isComponent ? '컴포넌트명' : '화면명';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
            setComposing(v);
            return;
        }
        setComposing(null);
        update({ name: v });
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setComposing(null);
        update({ name: v });
        syncUpdate({ name: v });
    };

    // 컴포넌트: MetaInfoTable과 동일한 라벨-값 스타일 (시스템명|작성자|작성일자 레이아웃)
    const labelCell = "bg-[#2c3e7c] text-white text-[11px] font-bold px-3 py-2 border-r border-[#1e2d5e] select-none text-center align-middle whitespace-nowrap";
    const valueCell = "bg-white text-xs text-gray-800 px-2 py-1 border-r border-[#e2e8f0] align-middle";

    return (
        <div
            className="nodrag nopan border-b border-gray-200 rounded-t-[13px] overflow-visible"
            onMouseDown={(e) => e.stopPropagation()}
        >
            {isComponent ? (
                /* 컴포넌트: MetaInfoTable 스타일 1행 (컴포넌트명 | [input] | 생성자 | [author] | [버튼]) */
                <table className="nodrag w-full table-fixed border-separate border-spacing-0">
                    <tbody>
                        <tr>
                            <td className={`${labelCell} rounded-tl-[13px]`} style={{ width: '10%' }}>컴포넌트명</td>
                            <td className={valueCell} style={{ width: '35%' }}>
                                <input
                                    type="text"
                                    value={displayValue}
                                    onChange={handleChange}
                                    onCompositionEnd={(e) => {
                                        const v = (e.target as HTMLInputElement).value;
                                        setComposing(null);
                                        update({ name: v });
                                    }}
                                    onBlur={handleBlur}
                                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                                    disabled={isLocked}
                                    className={`nodrag w-full border-none focus:ring-0 font-bold text-sm p-0 outline-none placeholder-gray-400 ${!isLocked ? 'bg-transparent' : 'bg-transparent pointer-events-none'}`}
                                    placeholder="컴포넌트명"
                                    spellCheck={false}
                                />
                            </td>
                            <td className={labelCell} style={{ width: '10%' }}>생성자</td>
                            <td className={`${valueCell} text-center font-medium`} style={{ width: '25%' }}>{screen.author || '-'}</td>
                            <td className="bg-[#2c3e7c] px-2 py-1 border-r-0 align-middle rounded-tr-[13px] whitespace-nowrap" style={{ width: '13%', minWidth: '120px' }}>
                                <div className={`flex items-center justify-end gap-1 shrink-0 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto' : ''}`}>
                                    <div className="relative" ref={screenOptionsRef}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowScreenOptionsPanel((v) => !v); }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="nodrag shrink-0 p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90"
                                            title="용지 설정"
                                        >
                                            <SlidersHorizontal size={16} />
                                        </button>
                                        {showScreenOptionsPanel && (
                                            <div
                                                className="nodrag absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[300] animate-in fade-in zoom-in-95 duration-150"
                                                onMouseDown={(e) => e.stopPropagation()}
                                            >
                                                <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">용지 크기</div>
                                                <div className="grid grid-cols-2 gap-1.5 mb-3">
                                                    {PAGE_SIZE_OPTIONS.map((s) => {
                                                        const dim = PAGE_SIZE_DIMENSIONS_MM[s];
                                                        const ori = (screen.pageOrientation || 'portrait') as 'portrait' | 'landscape';
                                                        const labelW = ori === 'portrait' ? dim.w : dim.h;
                                                        const labelH = ori === 'portrait' ? dim.h : dim.w;
                                                        return (
                                                            <button
                                                                key={s}
                                                                type="button"
                                                                onClick={() => {
                                                                    const { width, height } = getCanvasDimensions({ pageSize: s, pageOrientation: screen.pageOrientation || 'portrait' } as Screen);
                                                                    const u = { pageSize: s, imageWidth: width, imageHeight: height };
                                                                    update(u); syncUpdate(u);
                                                                }}
                                                                className={`nodrag w-full px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(screen.pageSize || 'A4') === s ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                                            >
                                                                <span className="block">{s}</span>
                                                                <span className="block text-[8px] font-normal opacity-90">{labelW}×{labelH}mm</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">방향</div>
                                                <div className="flex gap-1">
                                                    <button type="button" onClick={() => {
                                                        const { width, height } = getCanvasDimensions({ pageSize: screen.pageSize || 'A4', pageOrientation: 'portrait' } as Screen);
                                                        const u = { pageOrientation: 'portrait' as const, imageWidth: width, imageHeight: height };
                                                        update(u); syncUpdate(u);
                                                    }}
                                                        className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(screen.pageOrientation || 'portrait') === 'portrait' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                                        <RectangleVertical size={12} /> 세로
                                                    </button>
                                                    <button type="button" onClick={() => {
                                                        const { width, height } = getCanvasDimensions({ pageSize: screen.pageSize || 'A4', pageOrientation: 'landscape' } as Screen);
                                                        const u = { pageOrientation: 'landscape' as const, imageWidth: width, imageHeight: height };
                                                        update(u); syncUpdate(u);
                                                    }}
                                                        className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${screen.pageOrientation === 'landscape' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                                        <RectangleHorizontal size={12} /> 가로
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={onToggleLock}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        disabled={isLockedByOther}
                                        className={`nodrag shrink-0 p-1.5 rounded-md transition-colors ${isLockedByOther ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 text-white/90'}`}
                                        title={isLockedByOther ? `${lockedBy}님이 수정 중` : isLocked ? '잠금 해제' : '잠금'}
                                    >
                                        {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                                    </button>
                                    {!isLocked && (
                                        <button
                                            onClick={onDelete}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="nodrag shrink-0 p-1.5 hover:bg-red-500 rounded-md text-white/90"
                                            title="삭제"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            ) : (
                /* 화면 설계: 기존 네이비 헤더 스타일 */
                <div className="px-4 py-2 flex items-center gap-2 text-white bg-[#2c3e7c] border-b border-white rounded-t-[13px]">
                    <Monitor size={16} className="flex-shrink-0 text-white/90" />
                    <input
                        type="text"
                        value={displayValue}
                        onChange={handleChange}
                        onCompositionEnd={(e) => {
                            const v = (e.target as HTMLInputElement).value;
                            setComposing(null);
                            update({ name: v });
                        }}
                        onBlur={handleBlur}
                        onMouseDown={(e) => !isLocked && e.stopPropagation()}
                        disabled={isLocked}
                        className={`${!isLocked ? 'nodrag bg-white/10' : 'bg-transparent pointer-events-none'} border-none focus:ring-0 font-bold text-lg w-full p-0 px-2 outline-none placeholder-white/50 rounded transition-colors disabled:text-white`}
                        placeholder={namePlaceholder}
                        spellCheck={false}
                    />
                    <div className={`flex items-center gap-1 ${isLocked ? 'pointer-events-none opacity-0 group-hover:opacity-100' : ''}`}>
                <div className="relative" ref={screenOptionsRef}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowScreenOptionsPanel((v) => !v);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="nodrag p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90 pointer-events-auto"
                        title="화면 옵션"
                    >
                        <SlidersHorizontal size={16} />
                    </button>
                    {showScreenOptionsPanel && (
                        <div
                            className="nodrag absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 z-[300] animate-in fade-in zoom-in-95 duration-150"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">용지 크기</div>
                            <div className="grid grid-cols-2 gap-1.5 mb-3">
                                {PAGE_SIZE_OPTIONS.map((s) => {
                                    const dim = PAGE_SIZE_DIMENSIONS_MM[s];
                                    const ori = (screen.pageOrientation || 'portrait') as 'portrait' | 'landscape';
                                    const labelW = ori === 'portrait' ? dim.w : dim.h;
                                    const labelH = ori === 'portrait' ? dim.h : dim.w;
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => {
                                                const { width, height } = getCanvasDimensions({ pageSize: s, pageOrientation: screen.pageOrientation || 'portrait' } as Screen);
                                                const u = { pageSize: s, imageWidth: width, imageHeight: height };
                                                update(u); syncUpdate(u);
                                            }}
                                            className={`nodrag w-full px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                                (screen.pageSize || 'A4') === s ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            <span className="block">{s}</span>
                                            <span className="block text-[8px] font-normal opacity-90">
                                                {labelW}×{labelH}mm
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase mb-2">방향</div>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const { width, height } = getCanvasDimensions({ pageSize: screen.pageSize || 'A4', pageOrientation: 'portrait' } as Screen);
                                        const u = { pageOrientation: 'portrait' as const, imageWidth: width, imageHeight: height };
                                        update(u); syncUpdate(u);
                                    }}
                                    className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                        (screen.pageOrientation || 'portrait') === 'portrait' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <RectangleVertical size={12} /> 세로
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const { width, height } = getCanvasDimensions({ pageSize: screen.pageSize || 'A4', pageOrientation: 'landscape' } as Screen);
                                        const u = { pageOrientation: 'landscape' as const, imageWidth: width, imageHeight: height };
                                        update(u); syncUpdate(u);
                                    }}
                                    className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                        screen.pageOrientation === 'landscape' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <RectangleHorizontal size={12} /> 가로
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                <button
                    onClick={onToggleLock}
                    onMouseDown={(e) => e.stopPropagation()}
                    disabled={isLockedByOther}
                    className={`nodrag p-1.5 rounded-md transition-colors pointer-events-auto ${
                        isLockedByOther ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 text-white/90'
                    }`}
                    title={isLockedByOther ? `${lockedBy}님이 수정 중` : isLocked ? '잠금 해제' : '잠금'}
                >
                    {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
                {!isLocked && (
                    <button
                        onClick={onDelete}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="nodrag opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-500 rounded-md text-white/90"
                        title="삭제"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
            )}
        </div>
    );
};
