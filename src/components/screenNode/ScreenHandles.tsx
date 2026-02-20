import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const ScreenHandles = memo(() => (
    <>
        <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ top: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ bottom: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ left: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
        <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-none !w-4 !h-4 flex items-center justify-center !cursor-pointer group/handle z-[150]" style={{ right: -6 }}>
            <div className="w-2 h-2 bg-[#2c3e7c] border-white border-[1.5px] rounded-full transition-all duration-200 shadow-sm pointer-events-none group-hover/handle:bg-green-500 group-hover/handle:w-3 group-hover/handle:h-3" />
        </Handle>
    </>
));

export default ScreenHandles;
