import React, { memo } from 'react';
import type { DrawElement } from '../../types/screenDesign';
import { hexToRgba } from './types';
import DrawTextComponent from './DrawTextComponent';

interface ShapeElementProps {
    el: DrawElement;
    isSelected: boolean;
    isLocked: boolean;
    editingTextId: string | null;
    updateElement: (id: string, updates: any) => void;
    onSelectionChange: (rect: DOMRect | null) => void;
    autoResizeContainer?: boolean;
}

const ShapeElement: React.FC<ShapeElementProps> = memo(({
    el,
    isSelected,
    isLocked,
    editingTextId,
    updateElement,
    onSelectionChange,
    autoResizeContainer = false
}) => {
    const isCompact = (el.width ?? 0) < 48 && (el.height ?? 0) < 48;
    const isCircle = el.type === 'circle';

    const rectCornerRadiusCss = (): string => {
        const base = el.borderRadius ?? 0;
        const tl = el.borderRadiusTopLeft ?? base;
        const tr = el.borderRadiusTopRight ?? base;
        const br = el.borderRadiusBottomRight ?? base;
        const bl = el.borderRadiusBottomLeft ?? base;
        return `${tl}px ${tr}px ${br}px ${bl}px`;
    };

    const containerStyle: React.CSSProperties = {
        backgroundColor: hexToRgba(el.fill || '#ffffff', el.fillOpacity ?? 1),
        borderColor: hexToRgba(el.stroke || '#000000', el.strokeOpacity ?? 1),
        borderWidth: el.strokeWidth ?? 2,
        borderStyle: (el.strokeStyle as any) ?? 'solid',
        borderRadius: isCircle
            ? '50%'
            : el.type === 'rect'
                ? rectCornerRadiusCss()
                : el.borderRadius !== undefined
                    ? (typeof el.borderRadius === 'number' ? `${el.borderRadius}px` : el.borderRadius)
                    : '0px',
    };

    const alignmentClasses = `w-full h-full relative flex ${isCompact ? 'items-stretch' : (el.verticalAlign === 'top' ? 'items-start' : el.verticalAlign === 'bottom' ? 'items-end' : 'items-center')
        } ${el.textAlign === 'left' ? 'justify-start' : el.textAlign === 'right' ? 'justify-end' : 'justify-center'
        }`;

    return (
        <div className={alignmentClasses} style={containerStyle}>
            <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
                {(el.text || editingTextId === el.id) && (
                    <DrawTextComponent
                        element={el}
                        isLocked={isLocked}
                        isSelected={isSelected}
                        onUpdate={(updates) => updateElement(el.id, updates)}
                        onSelectionChange={onSelectionChange}
                        autoFocus={editingTextId === el.id}
                        className={isCompact ? 'px-0' : (isCircle ? 'px-4' : 'px-2')}
                        compact={isCompact}
                        autoResizeContainer={autoResizeContainer}
                    />
                )}
            </div>
        </div>
    );
});

export default ShapeElement;
