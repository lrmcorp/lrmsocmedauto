export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <MantineWrapper>
      <Toaster />
      <ReturnUrlComponent />
      <main className="lrm-auth lrm-auth-internal">
        <section className="lrm-auth-panel" aria-label="Account access">
          <LogoTextComponent />
          <div className="lrm-auth-form">{children}</div>
          <p className="lrm-auth-footer">LRM Corporation · Social Studio</p>
        </section>
      </main>
    </MantineWrapper>
  );
}
