import React, { createContext } from 'react';

export type TooltipPortalContainerRef = React.RefObject<HTMLDivElement | null>;

/** When set, PremiumTooltip portals into this container (e.g. ScreenNode) so tooltips aren't clipped by overflow-hidden and still scale with the node. */
export const TooltipPortalContext = createContext<TooltipPortalContainerRef | null>(null);
