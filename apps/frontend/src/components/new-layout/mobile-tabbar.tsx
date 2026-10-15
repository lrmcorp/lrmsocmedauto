'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function MobileTabbar() {
  const pathname = usePathname();
  const t = useT();
  const tabs = [
    {
      href: '/launches',
      label: t('calendar', 'Calendar'),
      icon: (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" />
        </>
      ),
    },
    {
      href: '/media',
      label: t('media', 'Media'),
      icon: (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 17 5-5 4 4 3-3 6 6" />
        </>
      ),
    },
    {
      href: '/analytics',
      label: t('analytics', 'Analytics'),
      icon: (
        <>
          <path d="M4 3v17h17M9 15v-4m5 4V7m5 8V4" />
        </>
      ),
    },
    {
      href: '/settings',
      label: t('settings', 'Settings'),
      icon: (
        <>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="9" cy="18" r="2" />
        </>
      ),
    },
  ];
  return (
    <nav className="lrm-tabbar" aria-label="Main navigation">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname.startsWith(tab.href) ? 'page' : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            width="23"
            height="23"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {tab.icon}
          </svg>
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
