'use client';

import Image from 'next/image';

export const Logo = () => (
  <div
    className="lrm-brand-icon mt-[8px]"
    aria-label="Liando Reyfort Management"
  >
    <Image
      src="/branding/lrm-icon-192.png"
      alt="Liando Reyfort Management"
      width={60}
      height={60}
      unoptimized
    />
  </div>
);
