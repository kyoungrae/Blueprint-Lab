import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, PencilLine, Save, X } from 'lucide-react';
import type { Screen } from '../types/screenDesign';
import { SCREEN_TYPES } from '../types/screenDesign';
import { useProjectStore } from '../store/projectStore';
import { useScreenDesignStore } from '../store/screenDesignStore';
import { useYjsStore } from '../store/yjsStore';

const EDITABLE_KEYS = [
    'systemName',
    'author',
    'createdDate',
    'screenId',
    'screenType',
    'page',
    'screenDescription',
] as const;

type EditableScreenKey = (typeof EDITABLE_KEYS)[number];
type CellKind = 'text' | 'select' | 'textarea';
type SortDirection = 'asc' | 'desc';
type PendingEdits = Record<string, Partial<Record<EditableScreenKey, string>>>;

interface GridColumn {
    key: EditableScreenKey;
    label: string;
    width: number;
    kind: CellKind;
    mono?: boolean;
}

const GRID_COLUMNS: readonly GridColumn[] = [
    { key: 'systemName', label: '시스템명', width: 180, kind: 'text' },
    { key: 'author', label: '작성자', width: 140, kind: 'text' },
    { key: 'createdDate', label: '작성일자', width: 130, kind: 'text', mono: true },
    { key: 'screenId', label: '화면 ID', width: 160, kind: 'text', mono: true },
    { key: 'screenType', label: '화면유형', width: 130, kind: 'select' },
    { key: 'page', label: '페이지', width: 110, kind: 'text', mono: true },
    { key: 'screenDescription', label: '화면설명', width: 420, kind: 'textarea' },
];

interface GridCellRef {
    screenId: string;
    key: EditableScreenKey;
}

interface ScreenProjectEditGridProps {
    isOpen: boolean;
    onClose: () => void;
    screens: Screen[];
    currentProjectId: string | null;
    yjsIsSynced: boolean;
}

const sameCell = (cell: GridCellRef | null, screenId: string, key: EditableScreenKey) =>
    Boolean(cell && cell.screenId === screenId && cell.key === key);

const getOriginalCellValue = (screen: Screen | undefined, key: EditableScreenKey) =>
    String(screen?.[key] ?? '');

const cellDomKey = (screenId: string, key: EditableScreenKey) => `${screenId}:${key}`;

const isArrowKey = (key: string) =>
    key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';

const ScreenProjectEditGrid: React.FC<ScreenProjectEditGridProps> = ({
    isOpen,
    onClose,
    screens,
    currentProjectId,
    yjsIsSynced,
}) => {
    const isLocalProject = Boolean(currentProjectId?.startsWith('local_'));
    const canEdit = isLocalProject || yjsIsSynced;
    const [isEditMode, setIsEditMode] = useState(false);
    const [pendingEdits, setPendingEdits] = useState<PendingEdits>({});
    const [selectedCell, setSelectedCell] = useState<GridCellRef | null>(null);
    const [editingCell, setEditingCell] = useState<GridCellRef | null>(null);
    const [draftValue, setDraftValue] = useState('');
    const [sortState, setSortState] = useState<{ key: EditableScreenKey; direction: SortDirection } | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);
    const cellButtonRefs = useRef(new Map<string, HTMLButtonElement>());
    const composingRef = useRef(false);
    const lastCaretIndexRef = useRef(0);
    const nextEditorCaretIndexRef = useRef<number | null>(null);

    const screensById = useMemo(() => new Map(screens.map((screen) => [screen.id, screen])), [screens]);

    const screenTypeOptions = useMemo(() => {
        const extras = screens
            .map((screen) => screen.screenType)
            .filter((value): value is string => Boolean(value))
            .filter((value) => !SCREEN_TYPES.includes(value as (typeof SCREEN_TYPES)[number]));
        return [...SCREEN_TYPES, ...Array.from(new Set(extras))];
    }, [screens]);

    const getDisplayCellValue = useCallback(
        (screen: Screen, key: EditableScreenKey) => pendingEdits[screen.id]?.[key] ?? getOriginalCellValue(screen, key),
        [pendingEdits]
    );

    const isDirtyCell = useCallback(
        (screen: Screen, key: EditableScreenKey) =>
            pendingEdits[screen.id]?.[key] !== undefined &&
            pendingEdits[screen.id]?.[key] !== getOriginalCellValue(screen, key),
        [pendingEdits]
    );

    const dirtyCellCount = useMemo(() => {
        let count = 0;
        for (const screen of screens) {
            for (const key of EDITABLE_KEYS) {
                if (isDirtyCell(screen, key)) count += 1;
            }
        }
        return count;
    }, [isDirtyCell, screens]);

    const sortedScreens = useMemo(() => {
        if (!sortState) return screens;
        const directionMultiplier = sortState.direction === 'asc' ? 1 : -1;
        return [...screens].sort((a, b) => {
            const aValue = getDisplayCellValue(a, sortState.key);
            const bValue = getDisplayCellValue(b, sortState.key);
            const result = aValue.localeCompare(bValue, 'ko', {
                numeric: true,
                sensitivity: 'base',
            });
            return result * directionMultiplier;
        });
    }, [getDisplayCellValue, screens, sortState]);

    const focusCellButton = useCallback((cell: GridCellRef) => {
        const node = cellButtonRefs.current.get(cellDomKey(cell.screenId, cell.key));
        if (!node) return;
        node.focus({ preventScroll: true });
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, []);

    const readEditorCaret = useCallback(() => {
        const node = editorRef.current;
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
            lastCaretIndexRef.current = node.selectionStart ?? 0;
        }
        return lastCaretIndexRef.current;
    }, []);

    const stopEditing = useCallback(() => {
        readEditorCaret();
        setEditingCell(null);
        setDraftValue('');
        composingRef.current = false;
        nextEditorCaretIndexRef.current = null;
    }, [readEditorCaret]);

    const startEditing = useCallback(
        (
            screen: Screen,
            key: EditableScreenKey,
            options?: { initialValue?: string; caretIndex?: number; selectAll?: boolean },
        ) => {
            if (!isEditMode || !canEdit) return;
            const value = options?.initialValue ?? getDisplayCellValue(screen, key);
            setSelectedCell({ screenId: screen.id, key });
            setEditingCell({ screenId: screen.id, key });
            setDraftValue(value);
            nextEditorCaretIndexRef.current =
                options?.selectAll === false ? Math.max(0, Math.min(options?.caretIndex ?? lastCaretIndexRef.current, value.length)) : null;
        },
        [canEdit, getDisplayCellValue, isEditMode]
    );

    const updatePendingCell = useCallback(
        (screenId: string, key: EditableScreenKey, value: string) => {
            const original = getOriginalCellValue(screensById.get(screenId), key);
            setPendingEdits((prev) => {
                const currentScreenEdits = prev[screenId] ?? {};
                const nextScreenEdits = { ...currentScreenEdits };
                if (value === original) {
                    delete nextScreenEdits[key];
                } else {
                    nextScreenEdits[key] = value;
                }

                const next = { ...prev };
                if (Object.keys(nextScreenEdits).length === 0) {
                    delete next[screenId];
                } else {
                    next[screenId] = nextScreenEdits;
                }
                return next;
            });
        },
        [screensById]
    );

    const handleEditorChange = useCallback(
        (screenId: string, key: EditableScreenKey, value: string) => {
            setDraftValue(value);
            if (!composingRef.current) {
                updatePendingCell(screenId, key, value);
            }
        },
        [updatePendingCell]
    );

    const moveFromCell = useCallback(
        (from: GridCellRef, directionKey: string) => {
            const rowIndex = sortedScreens.findIndex((screen) => screen.id === from.screenId);
            const columnIndex = GRID_COLUMNS.findIndex((column) => column.key === from.key);
            if (rowIndex < 0 || columnIndex < 0) return;

            let nextRowIndex = rowIndex;
            let nextColumnIndex = columnIndex;
            if (directionKey === 'ArrowUp') nextRowIndex -= 1;
            if (directionKey === 'ArrowDown') nextRowIndex += 1;
            if (directionKey === 'ArrowLeft') nextColumnIndex -= 1;
            if (directionKey === 'ArrowRight') nextColumnIndex += 1;

            nextRowIndex = Math.max(0, Math.min(sortedScreens.length - 1, nextRowIndex));
            nextColumnIndex = Math.max(0, Math.min(GRID_COLUMNS.length - 1, nextColumnIndex));

            const nextScreen = sortedScreens[nextRowIndex];
            const nextColumn = GRID_COLUMNS[nextColumnIndex];
            if (!nextScreen || !nextColumn) return;

            const nextCell = { screenId: nextScreen.id, key: nextColumn.key };
            setSelectedCell(nextCell);
            stopEditing();
            requestAnimationFrame(() => focusCellButton(nextCell));
        },
        [focusCellButton, sortedScreens, stopEditing]
    );

    const handleSortClick = useCallback((key: EditableScreenKey) => {
        stopEditing();
        setSortState((prev) => {
            if (!prev || prev.key !== key) return { key, direction: 'asc' };
            return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        });
    }, [stopEditing]);

    const persistLocalProject = useCallback(() => {
        if (!currentProjectId || !currentProjectId.startsWith('local_')) return;
        const state = useScreenDesignStore.getState();
        useProjectStore.getState().updateProjectData(currentProjectId, {
            screens: state.screens,
            flows: state.flows,
            sections: state.sections,
        });
    }, [currentProjectId]);

    const saveChanges = useCallback(() => {
        stopEditing();
        if (dirtyCellCount === 0) {
            setIsEditMode(false);
            return;
        }

        const yjs = useYjsStore.getState();
        const canWriteYjs = Boolean(yjs.ydoc && yjs.isSynced);
        if (!canWriteYjs && !isLocalProject) {
            alert('동기화가 완료된 뒤 저장할 수 있습니다.');
            return;
        }

        const latestScreensById = new Map(useScreenDesignStore.getState().screens.map((screen) => [screen.id, screen]));
        for (const [screenId, edits] of Object.entries(pendingEdits)) {
            const latestScreen = latestScreensById.get(screenId);
            if (!latestScreen) continue;
            const patch: Partial<Pick<Screen, EditableScreenKey>> = {};
            for (const key of EDITABLE_KEYS) {
                const value = edits[key];
                if (value === undefined) continue;
                if (value !== getOriginalCellValue(latestScreen, key)) {
                    patch[key] = value;
                }
            }
            if (Object.keys(patch).length === 0) continue;
            useScreenDesignStore.getState().updateScreen(screenId, patch);
            if (canWriteYjs) {
                yjs.updateScreen(screenId, patch);
            }
        }

        if (isLocalProject) {
            persistLocalProject();
        }
        setPendingEdits({});
        setIsEditMode(false);
        setLastSavedAt(Date.now());
    }, [dirtyCellCount, isLocalProject, pendingEdits, persistLocalProject, stopEditing]);

    const discardPendingChanges = useCallback(() => {
        setPendingEdits({});
        setIsEditMode(false);
        stopEditing();
    }, [stopEditing]);

    const requestClose = useCallback(() => {
        if (dirtyCellCount > 0 && !window.confirm('저장하지 않은 수정 내용이 있습니다. 닫으면서 수정 내용을 버릴까요?')) {
            return;
        }
        discardPendingChanges();
        onClose();
    }, [dirtyCellCount, discardPendingChanges, onClose]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedCell(null);
            setEditingCell(null);
            setDraftValue('');
            setPendingEdits({});
            setIsEditMode(false);
            setSortState(null);
            return;
        }
        if (selectedCell && !screensById.has(selectedCell.screenId)) {
            setSelectedCell(null);
        }
        if (editingCell && !screensById.has(editingCell.screenId)) {
            setEditingCell(null);
        }
    }, [editingCell, isOpen, screensById, selectedCell]);

    useEffect(() => {
        if (!editingCell) return;
        const frame = requestAnimationFrame(() => {
            const node = editorRef.current;
            node?.focus();
            if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
                const caretIndex = nextEditorCaretIndexRef.current;
                if (caretIndex == null) {
                    node.select();
                    lastCaretIndexRef.current = 0;
                } else {
                    const clamped = Math.max(0, Math.min(caretIndex, node.value.length));
                    node.setSelectionRange(clamped, clamped);
                    lastCaretIndexRef.current = clamped;
                }
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [editingCell]);

    useEffect(() => {
        if (!selectedCell || editingCell) return;
        const frame = requestAnimationFrame(() => focusCellButton(selectedCell));
        return () => cancelAnimationFrame(frame);
    }, [editingCell, focusCellButton, selectedCell]);

    useEffect(() => {
        if (!lastSavedAt) return;
        const timer = window.setTimeout(() => setLastSavedAt(null), 1200);
        return () => window.clearTimeout(timer);
    }, [lastSavedAt]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (editingCell) {
                event.preventDefault();
                stopEditing();
                return;
            }
            requestClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [editingCell, isOpen, requestClose, stopEditing]);

    const renderEditor = (screen: Screen, column: GridColumn) => {
        const cellIsDirty = isDirtyCell(screen, column.key);
        const editorClassName = `h-full min-h-[38px] w-full border-0 bg-white px-2.5 py-2 text-xs text-gray-900 outline-none ring-2 ${
            cellIsDirty ? 'ring-emerald-500' : 'ring-blue-500'
        } ${column.mono ? 'font-mono font-semibold' : 'font-medium'}`;

        const commonKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                stopEditing();
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                stopEditing();
            }
        };

        if (column.kind === 'select') {
            return (
                <select
                    ref={(node) => {
                        editorRef.current = node;
                    }}
                    value={draftValue}
                    onChange={(event) => handleEditorChange(screen.id, column.key, event.target.value)}
                    onBlur={stopEditing}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={commonKeyDown}
                    className={`${editorClassName} font-semibold`}
                >
                    {screenTypeOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            );
        }

        if (column.kind === 'textarea') {
            return (
                <textarea
                    ref={(node) => {
                        editorRef.current = node;
                    }}
                    value={draftValue}
                    onChange={(event) => handleEditorChange(screen.id, column.key, event.target.value)}
                    onSelect={readEditorCaret}
                    onKeyUp={readEditorCaret}
                    onMouseUp={readEditorCaret}
                    onCompositionStart={() => {
                        composingRef.current = true;
                    }}
                    onCompositionEnd={(event) => {
                        composingRef.current = false;
                        handleEditorChange(screen.id, column.key, event.currentTarget.value);
                    }}
                    onBlur={stopEditing}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={commonKeyDown}
                    className={`${editorClassName} block min-h-[74px] resize-y leading-relaxed`}
                    spellCheck={false}
                />
            );
        }

        return (
            <input
                ref={(node) => {
                    editorRef.current = node;
                }}
                type="text"
                value={draftValue}
                onChange={(event) => handleEditorChange(screen.id, column.key, event.target.value)}
                onSelect={readEditorCaret}
                onKeyUp={readEditorCaret}
                onMouseUp={readEditorCaret}
                onCompositionStart={() => {
                    composingRef.current = true;
                }}
                onCompositionEnd={(event) => {
                    composingRef.current = false;
                    handleEditorChange(screen.id, column.key, event.currentTarget.value);
                }}
                onBlur={stopEditing}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={commonKeyDown}
                className={editorClassName}
                spellCheck={false}
            />
        );
    };

    if (!isOpen) return null;

    return (
        <div
            className="absolute inset-0 z-[10000] bg-gray-50/95 backdrop-blur-sm px-4 pb-4 pt-20"
            onMouseDown={(event) => event.stopPropagation()}
        >
            <div className="nodrag nopan no-pan-scroll flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
                <div className="flex min-h-12 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="text-sm font-black text-gray-900">화면 편집 모드</div>
                        <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-bold text-gray-600">
                            {screens.length.toLocaleString()}개
                        </div>
                        {isEditMode && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                                수정 중 {dirtyCellCount > 0 ? `${dirtyCellCount}셀` : ''}
                            </div>
                        )}
                        {!canEdit && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                                동기화 대기
                            </div>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {lastSavedAt && (
                            <div className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                                <CheckCircle2 size={13} />
                                저장됨
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                if (isEditMode) {
                                    saveChanges();
                                } else if (canEdit) {
                                    setIsEditMode(true);
                                }
                            }}
                            disabled={!canEdit}
                            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-black transition-colors ${
                                isEditMode
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-gray-900 text-white hover:bg-gray-800'
                            } disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400`}
                            title={isEditMode ? '수정 내용 저장' : '수정 시작'}
                        >
                            {isEditMode ? <Save size={15} /> : <PencilLine size={15} />}
                            {isEditMode ? '저장' : '수정'}
                        </button>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            title="닫기"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-white">
                    <table className="w-full min-w-[1280px] border-collapse text-left">
                        <colgroup>
                            <col style={{ width: 64 }} />
                            {GRID_COLUMNS.map((column) => (
                                <col key={column.key} style={{ width: column.width }} />
                            ))}
                        </colgroup>
                        <thead className="sticky top-0 z-20 bg-[#2c3e7c] text-white shadow-sm">
                            <tr>
                                <th className="sticky left-0 z-30 border-r border-[#1e2d5e] bg-[#243567] px-3 py-2 text-center text-[11px] font-black">
                                    No
                                </th>
                                {GRID_COLUMNS.map((column) => {
                                    const isSorted = sortState?.key === column.key;
                                    return (
                                        <th
                                            key={column.key}
                                            className="border-r border-[#1e2d5e] p-0 text-center text-[11px] font-black last:border-r-0"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => handleSortClick(column.key)}
                                                className="flex h-full min-h-[34px] w-full items-center justify-center gap-1 px-3 py-2 text-white transition-colors hover:bg-white/10"
                                                title={`${column.label} 정렬`}
                                            >
                                                <span>{column.label}</span>
                                                {isSorted ? (
                                                    sortState.direction === 'asc' ? (
                                                        <ChevronUp size={13} />
                                                    ) : (
                                                        <ChevronDown size={13} />
                                                    )
                                                ) : (
                                                    <span className="h-[13px] w-[13px]" />
                                                )}
                                            </button>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedScreens.map((screen, rowIndex) => (
                                <tr key={screen.id} className="group border-b border-gray-200 odd:bg-white even:bg-gray-50/70 hover:bg-emerald-50/40">
                                    <td className="sticky left-0 z-10 border-r border-gray-200 bg-inherit px-3 py-2 text-center text-[11px] font-mono font-bold text-gray-500">
                                        {rowIndex + 1}
                                    </td>
                                    {GRID_COLUMNS.map((column) => {
                                        const value = getDisplayCellValue(screen, column.key);
                                        const isSelected = sameCell(selectedCell, screen.id, column.key);
                                        const isEditing = sameCell(editingCell, screen.id, column.key);
                                        const cellIsDirty = isDirtyCell(screen, column.key);
                                        return (
                                            <td key={column.key} className="h-[39px] border-r border-gray-200 p-0 align-top last:border-r-0">
                                                {isEditing ? (
                                                    renderEditor(screen, column)
                                                ) : (
                                                    <button
                                                        ref={(node) => {
                                                            const key = cellDomKey(screen.id, column.key);
                                                            if (node) cellButtonRefs.current.set(key, node);
                                                            else cellButtonRefs.current.delete(key);
                                                        }}
                                                        type="button"
                                                        onClick={() => setSelectedCell({ screenId: screen.id, key: column.key })}
                                                        onDoubleClick={() => startEditing(screen, column.key)}
                                                        onKeyDown={(event) => {
                                                            if (isArrowKey(event.key)) {
                                                                event.preventDefault();
                                                                moveFromCell({ screenId: screen.id, key: column.key }, event.key);
                                                                return;
                                                            }
                                                            if ((event.key === 'Enter' || event.key === 'F2') && isEditMode && canEdit) {
                                                                event.preventDefault();
                                                                startEditing(screen, column.key, {
                                                                    caretIndex: lastCaretIndexRef.current,
                                                                    selectAll: false,
                                                                });
                                                            }
                                                        }}
                                                        className={`block h-full min-h-[38px] w-full overflow-hidden px-2.5 py-2 text-left text-xs transition-colors ${
                                                            column.mono ? 'font-mono font-semibold' : 'font-medium'
                                                        } ${
                                                            isEditMode && canEdit
                                                                ? 'cursor-text text-gray-800 hover:bg-emerald-50'
                                                                : 'cursor-default text-gray-700'
                                                        } ${
                                                            isSelected
                                                                ? 'bg-blue-50 outline outline-2 -outline-offset-2 outline-blue-500'
                                                                : ''
                                                        } ${cellIsDirty ? 'bg-emerald-50 shadow-[inset_0_0_0_2px_#10b981]' : ''}`}
                                                        title={value}
                                                    >
                                                        <span className="block truncate">
                                                            {value || '\u00a0'}
                                                        </span>
                                                    </button>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ScreenProjectEditGrid;
