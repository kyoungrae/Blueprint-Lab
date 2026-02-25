import { createContext } from 'react';

/** When true, ScreenNode renders only the canvas area (no header, metadata, toolbar, right pane) */
export const CanvasOnlyModeContext = createContext(false);
