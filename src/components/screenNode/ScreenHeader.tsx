import React, { useState, useEffect } from 'react';
import type { Screen } from '../../types/screenDesign';
import { PAGE_SIZE_OPTIONS, PAGE_SIZE_DIMENSIONS_MM, getCanvasDimensions } from '../../types/screenDesign';
import { Lock, Unlock, X, Monitor, SlidersHorizontal, RectangleVertical, RectangleHorizontal, MessageSquare } from 'lucide-react';
import PremiumTooltip from './PremiumTooltip';

interface ScreenHeaderProps {
    screen: Screen;
    isLocked: boolean;
    isLockedByOther: boolean;
    lockedBy: string | null | undefined;
    isSynced: boolean;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
    onToggleLock: (e?: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;

    showScreenOptionsPanel: boolean;
    setShowScreenOptionsPanel: (v: boolean | ((prev: boolean) => boolean)) => void;
    screenOptionsRef: React.RefObject<HTMLDivElement | null>;
    onToggleMemoPanel: (e: React.MouseEvent) => void;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = React.memo(({
    screen,
    isLocked,
    isLockedByOther,
    lockedBy,
    isSynced,
    update,
    syncUpdate,
    onToggleLock,
    onDelete,

    showScreenOptionsPanel,
    setShowScreenOptionsPanel,
    screenOptionsRef,
    onToggleMemoPanel,
}) => {
    // 1. composing 대신 localName과 isFocused 상태를 사용합니다.
    const [localName, setLocalName] = useState(screen.name || '');
    const [isFocused, setIsFocused] = useState(false);

    // 2. 내가 수정 중이 아닐 때만, 외부(전역 상태/다른 사용자)에서 변경된 이름을 동기화합니다.
    useEffect(() => {
        if (!isFocused) {
            setLocalName(screen.name || '');
        }
    }, [screen.name, isFocused]);
    const isComponent = screen.screenId?.startsWith('CMP-');
    const namePlaceholder = isComponent ? '컴포넌트명' : '화면명';

    // 3. onChange와 onBlur를 단순화합니다.
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setLocalName(v); // 로컬 상태 즉시 업데이트 (커서 위치 유지됨)
        update({ name: v }); // 상위 캔버스 상태에도 업데이트 알림
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setIsFocused(false);
        update({ name: v });
        syncUpdate({ name: v }); // 입력이 끝나면 서버와 동기화
    };

    // 컴포넌트: MetaInfoTable과 동일한 라벨-값 스타일 (시스템명|작성자|작성일자 레이아웃)
    const labelCell = "bg-[#2c3e7c] text-white text-[11px] font-bold px-3 py-2 border-r border-[#1e2d5e] select-none text-center align-middle whitespace-nowrap";
    const valueCell = "bg-white text-xs text-gray-800 px-2 py-1 border-r border-[#e2e8f0] align-middle";

    return (
        <div
            className="nodrag nopan border-b border-gray-200 rounded-t-[15px] overflow-visible"
            onMouseDown={(e) => e.stopPropagation()}
        >
            {isComponent ? (
                /* 컴포넌트: MetaInfoTable 스타일 1행 (컴포넌트명 | [input] | 생성자 | [author] | [버튼]) */
                <table className="nodrag w-full table-fixed border-separate border-spacing-0">
                    <tbody>
                        <tr>
                            <td className={`${labelCell} rounded-tl-[15px]`} style={{ width: '10%' }}>컴포넌트명</td>
                            <td className={valueCell} style={{ width: '35%' }}>
                                <input
                                    type="text"
                                    value={localName} // displayValue 대신 localName 사용
                                    onChange={handleChange}
                                    onFocus={handleFocus} // 추가
                                    onBlur={handleBlur}
                                    // onCompositionEnd 제거 (더 이상 필요 없음)
                                    onMouseDown={(e) => !isLocked && e.stopPropagation()}
                                    disabled={isLocked}
                                    className={`nodrag w-full border-none focus:ring-0 font-bold text-sm p-0 outline-none placeholder-gray-400 ${!isLocked ? 'bg-transparent' : 'bg-transparent pointer-events-none'}`}
                                    placeholder="컴포넌트명"
                                    spellCheck={false}
                                />
                            </td>
                            <td className={labelCell} style={{ width: '10%' }}>생성자</td>
                            <td className={`${valueCell} text-center font-medium`} style={{ width: '25%' }}>{screen.author || '-'}</td>
                            <td className="bg-[#2c3e7c] px-2 py-1 border-r-0 align-middle rounded-tr-[15px] whitespace-nowrap" style={{ width: '13%', minWidth: '120px' }}>
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
                                        disabled={!isSynced || isLockedByOther}
                                        className={`nodrag shrink-0 p-1.5 rounded-md transition-colors ${(!isSynced || isLockedByOther) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 text-white/90'}`}
                                        title={!isSynced ? '서버와 동기화 중에는 편집할 수 없습니다.' : isLockedByOther ? `${lockedBy}님이 수정 중` : isLocked ? '잠금 해제' : '잠금'}
                                    >
                                        {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                                    </button>
                                    <button
                                        onClick={onToggleMemoPanel}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="nodrag relative shrink-0 p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90"
                                        title="메모"
                                    >
                                        <MessageSquare size={16} />
                                        {(screen.memos?.length ?? 0) > 0 && (
                                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 border border-[#2c3e7c] font-black">
                                                {screen.memos?.length}
                                            </span>
                                        )}
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
                <div className="px-4 py-2 flex items-center gap-2 text-white bg-[#2c3e7c] border-b border-white rounded-t-[15px]">
                    <Monitor size={16} className="flex-shrink-0 text-white/90" />
                    <input
                        type="text"
                        value={localName} // displayValue 대신 localName 사용
                        onChange={handleChange}
                        onFocus={handleFocus} // 추가
                        onBlur={handleBlur}
                        // onCompositionEnd 제거
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
                                                    className={`nodrag w-full px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(screen.pageSize || 'A4') === s ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                                            className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(screen.pageOrientation || 'portrait') === 'portrait' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                                            className={`nodrag flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${screen.pageOrientation === 'landscape' ? 'bg-[#2c3e7c] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            <RectangleHorizontal size={12} /> 가로
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <PremiumTooltip label="메모" dotColor="#f6d100">
                            <button
                                onClick={onToggleMemoPanel}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="nodrag relative p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/90 pointer-events-auto"
                            >
                                <MessageSquare size={16} />
                                {(screen.memos?.length ?? 0) > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 border border-[#2c3e7c] font-black">
                                        {screen.memos?.length}
                                    </span>
                                )}
                            </button>
                        </PremiumTooltip>
                        <PremiumTooltip label="잠금설정" dotColor="#3b82f6">
                            <button
                                onClick={onToggleLock}
                                onMouseDown={(e) => e.stopPropagation()}
                                disabled={!isSynced || isLockedByOther}
                                className={`nodrag p-1.5 rounded-md transition-colors pointer-events-auto ${(!isSynced || isLockedByOther) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 text-white/90'
                                    }`}
                                title={!isSynced ? '서버와 동기화 중에는 편집할 수 없습니다.' : isLockedByOther ? `${lockedBy}님이 수정 중` : isLocked ? '잠금 해제' : '잠금'}
                            >
                                {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>
                        </PremiumTooltip>
                        {!isLocked && (
                            <PremiumTooltip label="화면 삭제" dotColor="#ef4444">
                                <button
                                    onClick={onDelete}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="nodrag opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-500 rounded-md text-white/90"
                                >
                                    <X size={16} />
                                </button>
                            </PremiumTooltip>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});
