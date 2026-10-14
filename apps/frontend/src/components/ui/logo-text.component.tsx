import React from 'react';

// Replace this wordmark when the official LRM Corporation logo is available.
export const LogoTextComponent = () => (
  <div
    className="flex items-center gap-[12px]"
    aria-label="LRM Corporation Social Studio"
  >
    <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] bg-[#612BD3] text-[13px] font-bold text-white">
      LRM
    </span>
    <span className="flex flex-col leading-tight">
      <span className="text-[17px] font-bold">LRM Corporation</span>
      <span className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
        Social Studio
      </span>
    </span>
  </div>
);
