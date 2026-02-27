import React from 'react';
import type { DrawElement } from '../../types/screenDesign';
import { getImageDisplayUrl } from '../../utils/imageUrl';
import { getV2Cells } from './types';

const hexToRgba = (hex: string, alpha: number) => {
    if (!hex || hex === 'transparent') return `rgba(255,255,255,${alpha})`;
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return hex;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${alpha})`;
};

interface DrawElementsPreviewProps {
    elements: DrawElement[];
    width: number;
    height: number;
    className?: string;
    /** 캔버스 전체 크기 (지정 시 캔버스 전체를 축소하여 표시) */
    canvasWidth?: number;
    canvasHeight?: number;
}

/** 컴포넌트 drawElements를 축소 미리보기로 렌더링 */
const DrawElementsPreview: React.FC<DrawElementsPreviewProps> = ({
    elements,
    width,
    height,
    className = '',
    canvasWidth,
    canvasHeight,
}) => {
    if (!elements?.length) return null;

    const sorted = [...elements].sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
    const minX = Math.min(...sorted.map((e) => e.x));
    const minY = Math.min(...sorted.map((e) => e.y));
    const maxX = Math.max(...sorted.map((e) => e.x + e.width));
    const maxY = Math.max(...sorted.map((e) => e.y + e.height));
    const elemBoundsW = Math.max(1, maxX - minX);
    const elemBoundsH = Math.max(1, maxY - minY);
    // canvasWidth/Height가 있으면 캔버스 전체 기준, 없으면 요소 bounds 기준
    const boundsW = canvasWidth ?? elemBoundsW;
    const boundsH = canvasHeight ?? elemBoundsH;
    const offsetX = canvasWidth != null ? 0 : minX;
    const offsetY = canvasHeight != null ? 0 : minY;
    // 전체가 보이도록 축소 (stroke 등으로 인한 클리핑 방지)
    const scale = Math.min(width / boundsW, height / boundsH) * 0.95;

    return (
        <div
            className={`relative overflow-hidden bg-white ${className}`}
            style={{ width, height }}
        >
            {sorted.map((el) => {
                const left = (el.x - offsetX) * scale;
                const top = (el.y - offsetY) * scale;
                const w = el.width * scale;
                const h = el.height * scale;
                const baseStyle: React.CSSProperties = {
                    position: 'absolute',
                    left,
                    top,
                    width: w,
                    height: h,
                    backgroundColor: hexToRgba(el.fill || '#ffffff', el.fillOpacity ?? 1),
                    borderColor: hexToRgba(el.stroke || '#e2e8f0', el.strokeOpacity ?? 1),
                    borderWidth: Math.max(0.5, (el.strokeWidth ?? 1) * scale),
                    borderStyle: el.strokeStyle || 'solid',
                    borderRadius: (el.borderRadius ?? 0) * scale,
                    fontSize: Math.max(6, (el.fontSize ?? 12) * scale),
                    color: el.color || '#374151',
                    fontWeight: el.fontWeight || 'normal',
                    display: 'flex',
                    alignItems: el.verticalAlign === 'top' ? 'flex-start' : el.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                    justifyContent: el.textAlign === 'left' ? 'flex-start' : el.textAlign === 'right' ? 'flex-end' : 'center',
                    overflow: 'hidden',
                    opacity: el.opacity ?? 1,
                };

                if (el.type === 'circle') {
                    return (
                        <div
                            key={el.id}
                            style={{
                                ...baseStyle,
                                borderRadius: '50%',
                            }}
                        >
                            {el.text && (
                                <span className="truncate px-1" style={{ fontSize: baseStyle.fontSize }}>
                                    {el.text}
                                </span>
                            )}
                        </div>
                    );
                }

                if (el.type === 'image' && el.imageUrl) {
                    return (
                        <div key={el.id} style={baseStyle}>
                            <img
                                src={getImageDisplayUrl(el.imageUrl)}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        </div>
                    );
                }

                if (el.type === 'table') {
                    const rows = el.tableRows ?? 3;
                    const cols = el.tableCols ?? 3;
                    const v2Cells = getV2Cells(el);
                    const totalCells = rows * cols;
                    return (
                        <div
                            key={el.id}
                            style={{
                                ...baseStyle,
                                display: 'grid',
                                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                gridTemplateRows: `repeat(${rows}, 1fr)`,
                            }}
                        >
                            {Array.from({ length: totalCells }).map((_, i) => {
                                const cellContent = v2Cells[i]?.content ?? el.tableCellData?.[i] ?? '';
                                return (
                                    <div
                                        key={i}
                                        className="border border-gray-200 flex items-center justify-center"
                                        style={{
                                            fontSize: Math.max(5, (baseStyle.fontSize as number) * 0.6),
                                            backgroundColor: el.tableCellColors?.[i] || 'transparent',
                                        }}
                                    >
                                        {cellContent}
                                    </div>
                                );
                            })}
                        </div>
                    );
                }

                if (el.type === 'func-no') {
                    return (
                        <div key={el.id} style={baseStyle}>
                            <span className="font-bold">{el.text || '①'}</span>
                        </div>
                    );
                }

                return (
                    <div key={el.id} style={baseStyle}>
                        {(el.text || el.type === 'text') && (
                            <span className="truncate px-0.5" style={{ fontSize: baseStyle.fontSize }}>
                                {el.text || ''}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default DrawElementsPreview;
