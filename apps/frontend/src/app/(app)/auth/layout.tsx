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
      <main className="lrm-auth">
        <section className="lrm-auth-panel" aria-label="Account access">
          <LogoTextComponent />
          <div className="lrm-auth-form">{children}</div>
          <p className="lrm-auth-footer">LRM Corporation · Social Studio</p>
        </section>
        <aside className="lrm-auth-story" aria-label="Your social workspace">
          <span className="lrm-eyebrow">YOUR SOCIAL WORKSPACE</span>
          <h2>
            More accounts.
            <br />
            <span>One clear view.</span>
          </h2>
          <p>A simpler place to plan, organize, and publish your content.</p>
          <div className="lrm-network-pills" aria-label="Supported networks">
            <span>Instagram</span>
            <span>TikTok</span>
            <span>Threads</span>
          </div>
          <div className="lrm-feature-list">
            <div>
              <span>01</span>
              <section>
                <h3>Plan your next post</h3>
                <p>Keep your content calendar in one place.</p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>Keep accounts organized</h3>
                <p>Switch between the brands you manage.</p>
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>Publish on your schedule</h3>
                <p>Prepare content when it works for you.</p>
              </section>
            </div>
          </div>
        </aside>
      </main>
    </MantineWrapper>
  );
}
