import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ASSIGNEE_PALETTE } from './WbsMenuTree';

interface WbsDevDetailFilterBarProps {
    allAssignees: string[];
    assigneeColorIdx: Map<string, number>;
    activeAssignees: Set<string>;
    onToggleAssignee: (name: string) => void;
    onClearAssignees: () => void;
    menuSearch: string;
    onMenuSearchChange: (value: string) => void;
    /** 검색창을 세로 배치할지 (엑셀형태 전체 너비용) */
    layout?: 'stacked' | 'inline';
}

/**
 * 상위의 행 필터링이 갱신되는 동안에도 검색 input 자체는 재마운트되지 않게 분리한다.
 * 한글 IME 조합은 완료된 시점에만 부모 필터에 전달해 조합 중 커서/글자 유실을 막는다.
 */
const MenuSearchInput = React.memo(({
    value,
    onValueChange,
    inline,
}: {
    value: string;
    onValueChange: (value: string) => void;
    inline: boolean;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const composingRef = useRef(false);
    const lastPublishedRef = useRef(value);
    const [draft, setDraft] = useState(value);

    const publish = useCallback((nextValue: string) => {
        if (lastPublishedRef.current === nextValue) return;
        lastPublishedRef.current = nextValue;
        onValueChange(nextValue);
    }, [onValueChange]);

    // 다른 화면에서 검색어가 바뀐 경우에는 반영하되, 현재 입력 중인 값은 덮어쓰지 않는다.
    useEffect(() => {
        if (composingRef.current || document.activeElement === inputRef.current) return;
        lastPublishedRef.current = value;
        setDraft(value);
    }, [value]);

    const clear = useCallback(() => {
        setDraft('');
        publish('');
        inputRef.current?.focus();
    }, [publish]);

    return (
        <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
                ref={inputRef}
                type="search"
                value={draft}
                onCompositionStart={() => {
                    composingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                    composingRef.current = false;
                    const nextValue = event.currentTarget.value;
                    setDraft(nextValue);
                    publish(nextValue);
                }}
                onChange={(event) => {
                    const nextValue = event.target.value;
                    setDraft(nextValue);
                    if (composingRef.current || (event.nativeEvent as InputEvent).isComposing) return;
                    publish(nextValue);
                }}
                placeholder="메뉴명 · PID · 메뉴코드 검색"
                className={`w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-gray-400 ${inline ? '' : 'mx-0'}`}
            />
            {draft && (
                <button
                    type="button"
                    onClick={clear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    title="검색 초기화"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
});

MenuSearchInput.displayName = 'MenuSearchInput';

const WbsDevDetailFilterBar: React.FC<WbsDevDetailFilterBarProps> = ({
    allAssignees,
    assigneeColorIdx,
    activeAssignees,
    onToggleAssignee,
    onClearAssignees,
    menuSearch,
    onMenuSearchChange,
    layout = 'stacked',
}) => (
    <div className={layout === 'inline' ? 'flex flex-col gap-2' : 'flex flex-col gap-0'}>
        {allAssignees.length > 0 && (
            <div className={layout === 'inline' ? '' : 'px-3 pt-3 pb-2 border-b border-gray-100'}>
                <nav className="flex flex-wrap items-center gap-1 bg-gray-100 rounded-xl p-1">
                    <button
                        type="button"
                        onClick={onClearAssignees}
                        className={`flex items-center px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            activeAssignees.size === 0
                                ? 'bg-white text-gray-800 shadow-sm'
                                : 'text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        ALL
                    </button>
                    {allAssignees.map((a) => {
                        const idx = (assigneeColorIdx.get(a) ?? 0) % ASSIGNEE_PALETTE.length;
                        const dotColor = ASSIGNEE_PALETTE[idx].active.split(' ')[0];
                        const isActive = activeAssignees.has(a);
                        return (
                            <button
                                key={a}
                                type="button"
                                onClick={() => onToggleAssignee(a)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    isActive
                                        ? 'bg-white text-gray-800 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-800'
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                                {a}
                            </button>
                        );
                    })}
                </nav>
            </div>
        )}
        <div className={layout === 'inline' ? '' : 'px-3 pb-2 pt-2 border-b border-gray-100'}>
            <MenuSearchInput
                value={menuSearch}
                onValueChange={onMenuSearchChange}
                inline={layout === 'inline'}
            />
        </div>
    </div>
);

export default WbsDevDetailFilterBar;
