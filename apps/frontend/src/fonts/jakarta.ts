import localFont from 'next/font/local';

export const jakartaSans = localFont({
  src: [
    { path: './PlusJakartaSans-Variable.ttf', weight: '200 800', style: 'normal' },
    { path: './PlusJakartaSans-Italic-Variable.ttf', weight: '200 800', style: 'italic' },
  ],
  display: 'swap',
});
