const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.LRM_STUDIO_UI_URL || 'http://127.0.0.1:4300';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const accounts = [
  {
    id: 'ig-1',
    name: 'hannabeauty.kr',
    providerIdentifier: 'instagram-standalone',
  },
  {
    id: 'ig-2',
    name: 'thecave_id',
    providerIdentifier: 'instagram-standalone',
  },
  { id: 'threads-1', name: 'LRM Corporation', providerIdentifier: 'threads' },
];
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addCookies([
      { name: 'auth', value: 'ui-fixture-not-a-real-session', url: base },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let owner = true;
    const requests = [];
    await page.route('**/studio/**', (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.slice(url.pathname.indexOf('/studio') + 7);
      requests.push({ path, method: route.request().method() });
      const data =
        path === '/me'
          ? {
              name: 'Liando',
              username: 'owner',
              owner,
              permissions: [
                'draft',
                'schedule',
                'publish',
                'delete',
                'analytics',
                'ai',
                'messages',
                'reply',
              ],
              accounts: owner ? accounts : accounts.slice(0, 1),
              aiConfigured: false,
            }
          : path === '/summary'
          ? {
              accounts: owner ? 3 : 1,
              needsReconnect: 0,
              counts: { QUEUE: 12, DRAFT: 8, PUBLISHED: 43 },
            }
          : path === '/posts'
          ? [
              {
                id: 'post-1',
                content:
                  'Koleksi terbaru Hanna Beauty. Cerita baru untuk hari yang istimewa.',
                state: 'QUEUE',
                publishDate: '2026-10-16T03:00:00Z',
                integrationId: 'ig-1',
              },
            ]
          : path === '/media'
          ? [
              {
                id: 'image1',
                name: 'Sample one',
                path: base + '/branding/lrm-icon-192.png',
              },
              {
                id: 'image2',
                name: 'Sample two',
                path: base + '/branding/lrm-icon-512.png',
              },
            ]
          : path === '/inbox/ig-1'
          ? {
              threads: [
                {
                  id: 'thread1',
                  name: 'Pelanggan Hanna',
                  handle: 'fixture-thread-handle',
                },
              ],
              after: null,
            }
          : path === '/inbox/thread'
          ? {
              messages: [
                {
                  id: 'message1',
                  text: 'Halo, produk ini masih tersedia?',
                  incoming: true,
                  createdAt: new Date().toISOString(),
                },
              ],
              canReply: true,
              after: null,
            }
          : path === '/members'
          ? [
              {
                userId: 'owner',
                role: 'SUPERADMIN',
                disabled: false,
                accounts: [],
                permissions: [],
                user: { name: 'Liando', username: 'owner' },
              },
            ]
          : [];
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data),
      });
    });
    await page.goto(base + '/studio');
    await page.getByRole('heading', { name: 'Halo, Liando' }).waitFor();
    const output = process.env.LRM_STUDIO_UI_OUTPUT || '/tmp/lrm-studio-review';
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: output + '/desktop.png', fullPage: true });
    await page
      .getByRole('button', { name: 'Anggota & Akses', exact: true })
      .click();
    await page
      .getByRole('button', { name: '＋ Tambah Anggota' })
      .last()
      .click();
    await page.getByLabel('Username', { exact: true }).fill('editor.hanna');
    await page.getByLabel('Buat & edit draf').check();
    await page.getByLabel('Jadwalkan konten').check();
    assert.equal(
      await page.getByLabel('Terbitkan sekarang', { exact: true }).isChecked(),
      false
    );
    await page.screenshot({ path: output + '/members.png', fullPage: true });
    await page.getByRole('button', { name: 'Asisten AI', exact: true }).click();
    assert.equal(
      await page.getByLabel('API key OpenAI').getAttribute('type'),
      'password'
    );
    await page.getByRole('button', { name: 'Beranda', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/mobile.png', fullPage: true });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      ),
      'No horizontal page overflow on mobile'
    );
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page
      .getByRole('button', { name: 'Buat Konten', exact: true })
      .click();
    await page
      .getByLabel(/Tulis caption|Caption/)
      .fill('Konten baru untuk Hanna Beauty');
    assert.ok(
      await page.getByRole('button', { name: 'Simpan Draf' }).isVisible()
    );
    for (const name of ['Foto', 'Carousel', 'Reel', 'Story']) {
      const format = page.getByRole('button', { name: new RegExp(name + ' ') });
      await format.click();
      assert.equal(await format.getAttribute('aria-pressed'), 'true');
    }
    await page.getByRole('button', { name: /Carousel / }).click();
    await page
      .getByRole('img', { name: 'Sample one', exact: true })
      .locator('..')
      .click();
    await page
      .getByRole('img', { name: 'Sample two', exact: true })
      .locator('..')
      .click();
    await page.getByRole('button', { name: 'Geser media 2 ke kiri' }).click();
    assert.ok(
      (
        await page
          .getByRole('img', { name: 'Pratinjau media 1' })
          .getAttribute('src')
      ).includes('512')
    );
    await page
      .getByRole('button', { name: 'Media berikutnya', exact: true })
      .click();
    assert.ok(
      (
        await page
          .getByRole('img', { name: 'Pratinjau media 2' })
          .getAttribute('src')
      ).includes('192')
    );
    await page.screenshot({
      path: output + '/instagram-composer.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Buka menu' }).click();
    await page
      .getByRole('button', { name: 'Pesan Instagram', exact: true })
      .click();
    await page.getByRole('button', { name: 'Muat Inbox', exact: true }).click();
    await page.getByRole('button', { name: /Pelanggan Hanna/ }).click();
    await page
      .getByText('Halo, produk ini masih tersedia?', { exact: true })
      .waitFor({ state: 'visible' });
    assert.equal(
      await page.getByLabel('Balasan', { exact: true }).isDisabled(),
      false
    );
    await page.screenshot({
      path: output + '/instagram-inbox.png',
      fullPage: true,
    });
    owner = false;
    await page.reload();
    await page.getByRole('heading', { name: 'Halo, Liando' }).waitFor();
    await page.getByRole('button', { name: 'Buka menu' }).click();
    assert.equal(
      await page
        .getByRole('button', { name: 'Anggota & Akses', exact: true })
        .count(),
      0
    );
    await page
      .getByRole('button', { name: 'Akun Sosial', exact: true })
      .click();
    assert.equal(
      await page.getByText('thecave_id', { exact: true }).count(),
      0
    );
    assert.equal(
      await page.getByRole('link', { name: 'Kelola Koneksi →' }).count(),
      0
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: [
          'desktop HRD-style dashboard',
          'member account and action selectors',
          'password-masked AI key input',
          '390px mobile navigation without overflow',
          'member UI hides owner tools and unassigned accounts',
          'Instagram photo/carousel/reel/story choices and carousel ordering',
          'Instagram inbox conversation view and reply permission UI (mock API, no actual send)',
        ],
        screenshots: output,
      })
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
