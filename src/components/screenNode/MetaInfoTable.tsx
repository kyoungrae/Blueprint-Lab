import React from 'react';
import type { Screen } from '../../types/screenDesign';
import { SCREEN_TYPES } from '../../types/screenDesign';
import EditableCell from './EditableCell';

interface MetaInfoTableProps {
    screen: Screen;
    isLocked: boolean;
    update: (updates: Partial<Screen>) => void;
    syncUpdate: (updates: Partial<Screen>) => void;
}

// Label cell style: Navy(#2c3e7c) background, White text
const labelCell = "bg-[#2c3e7c] text-white text-[11px] font-bold px-3 py-2 border-r border-[#1e2d5e] select-none text-center align-middle whitespace-nowrap";
// Value cell style
const valueCell = "bg-white text-xs text-gray-800 px-2 py-1 border-r border-[#e2e8f0] align-middle";

const MetaInfoTable: React.FC<MetaInfoTableProps> = ({ screen, isLocked, update, syncUpdate }) => {
    return (
        <div className="border-b border-gray-200">
            <table className="nodrag w-full border-collapse">
                <tbody>
                    {/* Row 1 */}
                    <tr className="border-b border-[#e2e8f0]">
                        <td className={labelCell} style={{ width: 100 }}>시스템명</td>
                        <td className={valueCell} style={{ width: 180 }}>
                            <EditableCell value={screen.systemName} onChange={(v) => update({ systemName: v })} onBlur={(v) => syncUpdate({ systemName: v })} isLocked={isLocked} placeholder="시스템명" className="text-center font-bold" />
                        </td>
                        <td className={labelCell} style={{ width: 80 }}>작성자</td>
                        <td className={valueCell} style={{ width: 140 }}>
                            <EditableCell value={screen.author} onChange={(v) => update({ author: v })} onBlur={(v) => syncUpdate({ author: v })} isLocked={isLocked} placeholder="작성자" className="text-center" />
                        </td>
                        <td className={labelCell} style={{ width: 90 }}>작성일자</td>
                        <td className={`${valueCell} border-r-0`}>
                            <EditableCell value={screen.createdDate} onChange={(v) => update({ createdDate: v })} onBlur={(v) => syncUpdate({ createdDate: v })} isLocked={isLocked} placeholder="YYYY-MM-DD" mono className="text-center" />
                        </td>
                    </tr>

                    {/* Row 2 */}
                    <tr className="border-b border-[#e2e8f0]">
                        <td className={labelCell}>화면ID</td>
                        <td className={valueCell}>
                            <EditableCell value={screen.screenId} onChange={(v) => update({ screenId: v })} onBlur={(v) => syncUpdate({ screenId: v })} isLocked={isLocked} placeholder="화면ID" mono className="font-bold text-[#2c3e7c]" />
                        </td>
                        <td className={labelCell}>화면유형</td>
                        <td className={valueCell}>
                            <EditableCell value={screen.screenType} onChange={(v) => update({ screenType: v })} onBlur={(v) => syncUpdate({ screenType: v })} isLocked={isLocked} isSelect options={SCREEN_TYPES} className="text-center h-full" />
                        </td>
                        <td className={labelCell}>페이지</td>
                        <td className={`${valueCell} border-r-0`}>
                            <EditableCell value={screen.page} onChange={(v) => update({ page: v })} onBlur={(v) => syncUpdate({ page: v })} isLocked={isLocked} placeholder="1/1" mono className="text-center" />
                        </td>
                    </tr>

                    {/* Row 3 - Description */}
                    <tr>
                        <td className={labelCell}>화면설명</td>
                        <td className={`${valueCell} border-r-0`} colSpan={5}>
                            <EditableCell value={screen.screenDescription} onChange={(v) => update({ screenDescription: v })} onBlur={(v) => syncUpdate({ screenDescription: v })} isLocked={isLocked} placeholder="화면에 대한 구체적인 설명을 입력하세요" />
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default MetaInfoTable;
