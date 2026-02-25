import React from 'react';
import type { AlignmentGuides } from './smartGuides';

interface AlignmentGuidesOverlayProps {
    guides: AlignmentGuides;
}

/** Smart Guides - 드래그 중 정렬 시 표시되는 가이드라인 */
export const AlignmentGuidesOverlay: React.FC<AlignmentGuidesOverlayProps> = ({ guides }) => (
    <div
        className="pointer-events-none"
        style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10000,
        }}
    >
        {guides.vertical.map((vx) => (
            <div
                key={`v-${vx}`}
                style={{
                    position: 'absolute',
                    left: vx,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: '#3b82f6',
                    opacity: 0.8,
                }}
            />
        ))}
        {guides.horizontal.map((vy) => (
            <div
                key={`h-${vy}`}
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: vy,
                    height: 1,
                    backgroundColor: '#3b82f6',
                    opacity: 0.8,
                }}
            />
        ))}
    </div>
);
