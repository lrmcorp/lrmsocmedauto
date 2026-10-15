import Image from 'next/image';

export const LogoTextComponent = () => (
  <div className="lrm-brand-wordmark">
    <Image
      src="/branding/lrm-logo.webp"
      alt="Liando Reyfort Management"
      width={320}
      height={91}
      priority
      unoptimized
    />
    <span className="lrm-brand-caption">
      Social Studio · Internal Workspace
    </span>
  </div>
);
