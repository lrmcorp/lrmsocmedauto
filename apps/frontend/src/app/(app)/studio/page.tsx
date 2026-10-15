'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import styles from './studio.module.scss';
import {
  InstagramFormat,
  InstagramPreview,
  InstagramInbox,
} from './instagram-tools';

type Account = {
  id: string;
  name: string;
  customName?: string;
  providerIdentifier: string;
  refreshNeeded: boolean;
  disabled: boolean;
};
type Me = {
  username: string;
  name: string;
  owner: boolean;
  permissions: string[];
  accounts: Account[];
  aiConfigured: boolean;
};
type PostItem = {
  id: string;
  content: string;
  state: string;
  publishDate: string;
  integrationId: string;
  image: string;
  releaseURL?: string;
  settings?: string;
};
type Member = {
  userId: string;
  role: string;
  disabled: boolean;
  accounts: string[];
  permissions: string[];
  user: { name: string; username: string };
};
type Media = { id: string; path: string; name: string };
const permissions: Record<string, string> = {
  draft: 'Buat & edit draf',
  schedule: 'Jadwalkan konten',
  publish: 'Terbitkan sekarang',
  delete: 'Hapus / batalkan konten',
  analytics: 'Lihat analitik',
  ai: 'Gunakan AI pribadi',
  messages: 'Baca DM Instagram',
  reply: 'Balas DM Instagram',
};
const states: Record<string, string> = {
  DRAFT: 'Draf',
  QUEUE: 'Terjadwal',
  PUBLISHED: 'Terbit',
  ERROR: 'Perlu tindakan',
};
const tabs: Record<string, string> = {
  home: 'Beranda',
  inbox: 'Pesan Instagram',
  posts: 'Konten & Jadwal',
  compose: 'Buat Konten',
  accounts: 'Akun Sosial',
  members: 'Anggota & Akses',
  ai: 'Asisten AI',
};
const iconPaths: Record<string, string> = {
  inbox: 'M3 4h18v13H8l-5 4V4',
  home: 'm3 10 9-7 9 7v10H3V10m6 10v-7h6v7',
  posts: 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',
  compose: 'M12 5v14M5 12h14',
  accounts: 'M8 12a4 4 0 0 1 0-8h3m2 16h3a4 4 0 0 0 0-8M8 12h8',
  members:
    'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-4M13 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  ai: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3',
};
function Icon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name] || iconPaths.posts} />
    </svg>
  );
}
function plain(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}
function dateText(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export default function StudioPage() {
  const fetch = useFetch();
  const [me, setMe] = useState<Me>();
  const [tab, setTab] = useState('home');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [summary, setSummary] = useState<{
    accounts: number;
    needsReconnect: number;
    counts: Record<string, number>;
  }>({ accounts: 0, needsReconnect: 0, counts: {} });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [content, setContent] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [publishDate, setPublishDate] = useState('');
  const [editId, setEditId] = useState('');
  const [postType, setPostType] = useState('photo');
  const [filter, setFilter] = useState('');
  const [key, setKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aiType, setAiType] = useState('caption');
  const [aiText, setAiText] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [memberName, setMemberName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetId, setResetId] = useState('');
  const [memberAccounts, setMemberAccounts] = useState<string[]>([]);
  const [memberPermissions, setMemberPermissions] = useState<string[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [memberForm, setMemberForm] = useState(false);
  const [menu, setMenu] = useState(false);
  const api = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch('/studio' + path, {
        method,
        ...(body !== undefined
          ? { body: body instanceof FormData ? body : JSON.stringify(body) }
          : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          Array.isArray(result.message)
            ? result.message.join(', ')
            : result.message || 'Permintaan gagal. Silakan coba kembali.'
        );
      return result;
    },
    [fetch]
  );
  const refresh = useCallback(async () => {
    const current: Me = await api('/me');
    setMe(current);
    setSelectedAccount((previous) =>
      current.accounts.some((a) => a.id === previous)
        ? previous
        : current.accounts[0]?.id || ''
    );
    const [items, overview, images] = await Promise.all([
      api('/posts'),
      api('/summary'),
      api('/media'),
    ]);
    setPosts(items);
    setSummary(overview);
    setMedia(images);
    if (current.owner) setMembers(await api('/members'));
  }, [api]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };
  const allowed = (permission: string) =>
    !!me?.permissions.includes(permission);
  const navigate = (target: string) => {
    setTab(target);
    setMenu(false);
    setError('');
    setNotice('');
  };
  const clearComposer = () => {
    setContent('');
    setSelectedMedia([]);
    setEditId('');
    setPublishDate('');
    setPostType('photo');
  };
  const createPost = (action: string) =>
    run(async () => {
      if (
        action === 'now' &&
        !window.confirm('Terbitkan konten ini sekarang ke akun yang dipilih?')
      )
        return;
      // datetime-local is explicitly Jakarta time, independent of browser timezone.
      const date = publishDate
        ? new Date(publishDate + ':00+07:00').toISOString()
        : undefined;
      await api('/posts', 'POST', {
        integrationId: selectedAccount,
        content,
        mediaIds: selectedMedia,
        action,
        date,
        postType,
        ...(editId ? { postId: editId } : {}),
      });
      clearComposer();
      await refresh();
      setTab('posts');
      setNotice(
        action === 'draft'
          ? 'Draf tersimpan.'
          : action === 'schedule'
          ? 'Konten masuk jadwal. Worker memeriksa izin lagi sebelum menerbitkan.'
          : 'Konten dikirim ke antrean penerbitan. Periksa status akhirnya di daftar konten.'
      );
    });
  const openMember = (member?: Member) => {
    setEditing(member || null);
    setMemberName(member?.user.name || '');
    setUsername(member?.user.username || '');
    setPassword('');
    setMemberAccounts(member?.accounts || []);
    setMemberPermissions(member?.permissions || []);
    setDisabled(member?.disabled || false);
    setResetId('');
    setMemberForm(true);
  };
  const saveMember = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      const policy = {
        accounts: memberAccounts,
        permissions: memberPermissions,
        disabled,
      };
      await api(
        editing ? '/members/' + editing.userId : '/members',
        editing ? 'PATCH' : 'POST',
        editing ? policy : { ...policy, name: memberName, username, password }
      );
      setPassword('');
      setMemberForm(false);
      await refresh();
      setNotice('Pengaturan anggota tersimpan.');
    });
  };
  const toggle = (list: string[], value: string) =>
    list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  const visiblePosts = posts.filter((p) => !filter || p.state === filter);
  const accountName = (id: string) =>
    me?.accounts.find((a) => a.id === id)?.customName ||
    me?.accounts.find((a) => a.id === id)?.name ||
    'Akun';
  if (!me)
    return (
      <main className={styles.loading}>
        <img
          src="/branding/lrm-logo.webp"
          alt="Liando Reyfort Management"
          width="260"
        />
        <p>LRM Corporation Social Studio</p>
        <p role="status">{error || 'Menyiapkan studio Anda…'}</p>
        {error && (
          <>
            <button onClick={() => refresh().catch((e) => setError(e.message))}>
              Coba lagi
            </button>
            <Link href="/auth/logout">Masuk kembali</Link>
          </>
        )}
      </main>
    );
  const needsAction = (summary.counts.ERROR || 0) + summary.needsReconnect;

  return (
    <div className={styles.studio}>
      <aside className={`${styles.sidebar} ${menu ? styles.open : ''}`}>
        <Link href="/studio" className={styles.brand}>
          <img
            src="/branding/lrm-logo.webp"
            alt="Liando Reyfort Management"
            width="184"
          />
          <span>SOCIAL STUDIO</span>
        </Link>
        <div className={styles.menuLabel}>WORKSPACE INTERNAL</div>
        <nav aria-label="Navigasi studio">
          {Object.entries(tabs)
            .filter(([id]) => id !== 'members' || me.owner)
            .map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? styles.active : ''}
                onClick={() => navigate(id)}
                aria-current={tab === id ? 'page' : undefined}
              >
                <Icon name={id} />
                {title}
                {id === 'posts' && <small>{summary.counts.QUEUE || 0}</small>}
              </button>
            ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <span className={styles.avatar}>
            {me.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{me.name}</strong>
            <small>{me.owner ? 'Superowner' : 'Anggota tim'}</small>
          </div>
          <Link href="/auth/logout" aria-label="Keluar">
            ↗
          </Link>
        </div>
      </aside>
      {menu && (
        <button
          className={styles.scrim}
          onClick={() => setMenu(false)}
          aria-label="Tutup menu"
        />
      )}
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <button
            className={styles.menuButton}
            aria-label="Buka menu"
            onClick={() => setMenu(!menu)}
          >
            ☰
          </button>
          <span>
            LRM Corporation <b>/</b> <strong>{tabs[tab]}</strong>
          </span>
          <div>
            <span className={styles.zone}>● &nbsp; Asia/Jakarta (WIB)</span>
            <span className={styles.role}>
              {me.owner ? 'Superowner' : 'Internal'}
            </span>
          </div>
        </header>
        <main className={styles.main}>
          <section className={styles.heading}>
            <div>
              <div className={styles.date}>
                ▣ &nbsp;{' '}
                {new Intl.DateTimeFormat('id-ID', {
                  dateStyle: 'full',
                  timeZone: 'Asia/Jakarta',
                }).format(new Date())}
              </div>
              <h1>{tab === 'home' ? `Halo, ${me.name}` : tabs[tab]}</h1>
              <p>
                {tab === 'home'
                  ? 'Pusat kendali konten, akun sosial, dan aktivitas tim LRM.'
                  : 'Kelola pekerjaan Anda dalam satu workspace internal.'}
              </p>
            </div>
            <div className={styles.actions}>
              {me.owner && (
                <button
                  className={styles.secondary}
                  onClick={() => {
                    navigate('members');
                    openMember();
                  }}
                >
                  ＋ Tambah Anggota
                </button>
              )}
              {allowed('draft') && (
                <button
                  className={styles.primary}
                  onClick={() => {
                    clearComposer();
                    navigate('compose');
                  }}
                >
                  ＋ Buat Konten
                </button>
              )}
            </div>
          </section>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className={styles.success} role="status">
              {notice}
            </div>
          )}
          {tab === 'home' && (
            <>
              {needsAction > 0 && (
                <div className={styles.warning}>
                  <span className={styles.warningCount}>{needsAction}</span>
                  <div>
                    <strong>Aktivitas membutuhkan perhatian</strong>
                    <p>
                      {summary.counts.ERROR || 0} konten gagal dan{' '}
                      {summary.needsReconnect} akun perlu dihubungkan ulang.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFilter('ERROR');
                      navigate('posts');
                    }}
                  >
                    Tinjau sekarang →
                  </button>
                </div>
              )}
              <div className={styles.stats}>
                {[
                  [
                    'AKUN SOSIAL',
                    summary.accounts,
                    'accounts',
                    'Akun yang dapat Anda kelola',
                  ],
                  [
                    'KONTEN TERJADWAL',
                    summary.counts.QUEUE || 0,
                    'posts',
                    'Siap mengikuti jadwal penerbitan',
                  ],
                  [
                    'DRAF KONTEN',
                    summary.counts.DRAFT || 0,
                    'compose',
                    'Ide yang sedang disiapkan',
                  ],
                  [
                    'KONTEN TERBIT',
                    summary.counts.PUBLISHED || 0,
                    'posts',
                    'Berhasil dikirim ke platform',
                  ],
                ].map(([title, value, icon, detail]) => (
                  <button
                    className={styles.stat}
                    key={String(title)}
                    onClick={() => navigate(String(icon))}
                  >
                    <div>
                      <span>{title}</span>
                      <i>
                        <Icon name={String(icon)} />
                      </i>
                    </div>
                    <strong>{value}</strong>
                    <footer>
                      {detail}
                      <span>Kelola →</span>
                    </footer>
                  </button>
                ))}
              </div>
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h2>Pusat Tindakan Cepat</h2>
                    <p>
                      Jalan pintas untuk menyiapkan dan mengelola konten harian
                    </p>
                  </div>
                  <span className={styles.tag}>
                    {me.owner ? 'Superowner Mode' : 'Akses sesuai penugasan'}
                  </span>
                </div>
                <div className={styles.quick}>
                  {[
                    ['compose', 'Buat Konten', 'Caption & media'],
                    ['posts', 'Jadwal Konten', 'Draf & penerbitan'],
                    ['accounts', 'Akun Sosial', 'Instagram, TikTok, Threads'],
                    ...(me.owner
                      ? [['members', 'Kelola Anggota', 'Akun & izin akses']]
                      : []),
                    ['ai', 'Asisten AI', 'OpenAI pribadi'],
                  ]
                    .filter(([id]) => id !== 'compose' || allowed('draft'))
                    .map(([id, title, detail]) => (
                      <button key={id} onClick={() => navigate(id)}>
                        <i>
                          <Icon name={id} />
                        </i>
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </button>
                    ))}
                </div>
              </section>
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h2>Aktivitas Konten Terkini</h2>
                    <p>Status terbaru dari akun yang dapat Anda akses</p>
                  </div>
                  <button
                    className={styles.textButton}
                    onClick={() => navigate('posts')}
                  >
                    Lihat semua →
                  </button>
                </div>
                {posts.length ? (
                  posts.slice(0, 5).map((p) => (
                    <div className={styles.activity} key={p.id}>
                      <i>
                        <Icon name="posts" />
                      </i>
                      <div>
                        <strong>
                          {plain(p.content).slice(0, 90) || 'Konten media'}
                        </strong>
                        <small>
                          {accountName(p.integrationId)} ·{' '}
                          {dateText(p.publishDate)}
                        </small>
                      </div>
                      <span className={styles.tag}>
                        {states[p.state] || p.state}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className={styles.empty}>
                    <Icon name="posts" />
                    <h3>Ruang untuk ide berikutnya</h3>
                    <p>
                      Konten dari akun yang ditugaskan kepada Anda akan tampil
                      di sini.
                    </p>
                    {allowed('draft') && (
                      <button
                        className={styles.primary}
                        onClick={() => navigate('compose')}
                      >
                        Buat konten pertama
                      </button>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
          {tab === 'inbox' && (
            <InstagramInbox
              accounts={me.accounts}
              canRead={allowed('messages')}
              canReply={allowed('reply')}
              api={api}
            />
          )}
          {tab === 'posts' && (
            <section className={styles.card}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Konten & Jadwal</h2>
                  <p>
                    Menampilkan hingga 200 konten terbaru · Waktu Asia/Jakarta
                  </p>
                </div>
                <label>
                  Filter status
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">Semua status</option>
                    {Object.entries(states).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Konten</th>
                      <th>Akun</th>
                      <th>Waktu (WIB)</th>
                      <th>Status</th>
                      <th>Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePosts.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {plain(p.content).slice(0, 120) || 'Konten media'}
                        </td>
                        <td>{accountName(p.integrationId)}</td>
                        <td>{dateText(p.publishDate)}</td>
                        <td>
                          <span className={styles.tag}>
                            {states[p.state] || p.state}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actions}>
                            {p.state === 'DRAFT' && allowed('draft') && (
                              <button
                                onClick={() => {
                                  setEditId(p.id);
                                  setContent(plain(p.content));
                                  setSelectedAccount(p.integrationId);
                                  let images: { id: string; path: string }[] =
                                    [];
                                  let settings: { post_type?: string } = {};
                                  try {
                                    images = JSON.parse(p.image || '[]');
                                    settings = JSON.parse(p.settings || '{}');
                                  } catch {}
                                  setSelectedMedia(
                                    images
                                      .map((m) => m.id)
                                      .filter((id) =>
                                        media.some((m) => m.id === id)
                                      )
                                  );
                                  setPostType(
                                    settings.post_type === 'story'
                                      ? 'story'
                                      : images.length > 1
                                      ? 'carousel'
                                      : /\.(mp4|mov)(?:\?|$)/i.test(
                                          images[0]?.path || ''
                                        )
                                      ? 'reel'
                                      : 'photo'
                                  );
                                  setTab('compose');
                                  setNotice(
                                    'Draf dimuat. Periksa kembali media dan urutannya sebelum menyimpan.'
                                  );
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {allowed('delete') &&
                              ['DRAFT', 'QUEUE', 'ERROR'].includes(p.state) && (
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Hapus draf atau batalkan jadwal konten ini?'
                                      )
                                    )
                                      run(async () => {
                                        await api('/posts/' + p.id, 'DELETE');
                                        await refresh();
                                        setNotice(
                                          'Konten dihapus / jadwal dibatalkan.'
                                        );
                                      });
                                  }}
                                >
                                  Hapus
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visiblePosts.length && (
                  <p className={styles.empty}>
                    Belum ada konten untuk status ini.
                  </p>
                )}
              </div>
            </section>
          )}
          {tab === 'compose' && (
            <section className={styles.card}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>{editId ? 'Edit Draf' : 'Siapkan Konten Baru'}</h2>
                  <p>Instagram menjadi fokus utama. Jadwal menggunakan WIB.</p>
                </div>
                <span className={styles.tag}>Workspace internal</span>
              </div>
              {!allowed('draft') ? (
                <p>Izin membuat draf belum diberikan. Hubungi superowner.</p>
              ) : (
                <div
                  className={`${styles.formGrid} ${
                    me.accounts
                      .find((a) => a.id === selectedAccount)
                      ?.providerIdentifier.startsWith('instagram')
                      ? styles.composerLayout
                      : ''
                  }`}
                >
                  <div className={styles.form}>
                    <label>
                      Akun sosial
                      <select
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                      >
                        <option value="" disabled>
                          Pilih akun
                        </option>
                        {me.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.customName || a.name} · {a.providerIdentifier}
                          </option>
                        ))}
                      </select>
                    </label>
                    {me.accounts
                      .find((a) => a.id === selectedAccount)
                      ?.providerIdentifier.startsWith('instagram') && (
                      <InstagramFormat
                        value={postType}
                        onChange={setPostType}
                      />
                    )}
                    <label>
                      {me.accounts
                        .find((a) => a.id === selectedAccount)
                        ?.providerIdentifier.startsWith('instagram')
                        ? '3. Tulis caption'
                        : 'Caption'}
                      <textarea
                        data-sentry-block
                        rows={7}
                        maxLength={
                          me.accounts
                            .find((a) => a.id === selectedAccount)
                            ?.providerIdentifier.startsWith('instagram')
                            ? 2200
                            : 20000
                        }
                        value={content}
                        placeholder="Tulis cerita untuk audiens Anda…"
                        onChange={(e) => setContent(e.target.value)}
                      />
                    </label>
                    {me.accounts
                      .find((a) => a.id === selectedAccount)
                      ?.providerIdentifier.startsWith('instagram') && (
                      <small className={styles.muted}>
                        {content.length}/2.200 karakter
                      </small>
                    )}
                    <label>
                      Unggah gambar / video (maks. 15 MB)
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                        disabled={busy}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []).slice(
                            0,
                            Math.max(0, 10 - selectedMedia.length)
                          );
                          if (files.length)
                            run(async () => {
                              let uploaded = 0;
                              for (const file of files) {
                                if (file.size > 15 * 1024 * 1024)
                                  throw new Error(
                                    'Setiap berkas maksimal 15 MB.'
                                  );
                                const data = new FormData();
                                data.append('file', file);
                                const item = await api('/media', 'POST', data);
                                setSelectedMedia((previous) =>
                                  [...previous, item.id].slice(0, 10)
                                );
                                uploaded++;
                              }
                              await refresh();
                              setNotice(
                                `${uploaded} media berhasil diunggah. Urutkan media pada pratinjau carousel.`
                              );
                            });
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <label>
                      Jadwal penerbitan · Asia/Jakarta (WIB)
                      <input
                        type="datetime-local"
                        value={publishDate}
                        onChange={(e) => setPublishDate(e.target.value)}
                      />
                    </label>
                    <div className={styles.actions}>
                      <button
                        className={styles.secondary}
                        disabled={busy || !selectedAccount}
                        onClick={() => createPost('draft')}
                      >
                        Simpan Draf
                      </button>
                      {allowed('schedule') && (
                        <button
                          className={styles.primary}
                          disabled={busy || !selectedAccount || !publishDate}
                          onClick={() => createPost('schedule')}
                        >
                          Jadwalkan
                        </button>
                      )}
                      {allowed('publish') && (
                        <button
                          className={styles.secondary}
                          disabled={busy || !selectedAccount}
                          onClick={() => createPost('now')}
                        >
                          Terbitkan Sekarang
                        </button>
                      )}
                    </div>
                    {busy && <p role="status">Memproses…</p>}
                  </div>
                  <aside>
                    {me.accounts
                      .find((a) => a.id === selectedAccount)
                      ?.providerIdentifier.startsWith('instagram') && (
                      <InstagramPreview
                        format={postType}
                        selected={selectedMedia}
                        media={media}
                        caption={content}
                        account={accountName(selectedAccount)}
                        onChange={setSelectedMedia}
                      />
                    )}
                    <h3>Media Anda</h3>
                    <p className={styles.muted}>
                      Pilih maksimal 10 media. Berkas ini dapat diakses melalui
                      URL publik untuk penerbitan sosial.
                    </p>
                    <div className={styles.mediaGrid}>
                      {media.map((m) => (
                        <button
                          key={m.id}
                          className={
                            selectedMedia.includes(m.id)
                              ? styles.selectedMedia
                              : ''
                          }
                          onClick={() =>
                            setSelectedMedia((previous) =>
                              toggle(previous, m.id).slice(0, 10)
                            )
                          }
                          aria-pressed={selectedMedia.includes(m.id)}
                        >
                          {/\.(mp4|mov)$/i.test(m.path) ? (
                            <video src={m.path} preload="metadata" muted />
                          ) : (
                            <img src={m.path} alt={m.name} />
                          )}
                          <span>
                            {selectedMedia.includes(m.id)
                              ? '✓ Dipilih'
                              : 'Pilih'}
                          </span>
                        </button>
                      ))}
                    </div>
                    {!media.length && (
                      <div className={styles.empty}>
                        Unggah media atau buat gambar melalui Asisten AI.
                      </div>
                    )}
                    {me.accounts
                      .find((a) => a.id === selectedAccount)
                      ?.providerIdentifier.startsWith('tiktok') && (
                      <p className={styles.muted}>
                        TikTok menggunakan privasi SELF_ONLY pada studio ini.
                        Superowner dapat memakai editor lanjutan untuk
                        pengaturan platform lainnya.
                      </p>
                    )}
                  </aside>
                </div>
              )}
            </section>
          )}
          {tab === 'accounts' && (
            <section className={styles.card}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Akun Sosial Anda</h2>
                  <p>
                    {me.owner
                      ? 'Hubungkan akun, kemudian pilih akses setiap anggota.'
                      : 'Hanya akun yang ditugaskan superowner ditampilkan.'}
                  </p>
                </div>
                {me.owner && (
                  <Link className={styles.primary} href="/launches">
                    Kelola Koneksi →
                  </Link>
                )}
              </div>
              <div className={styles.accountGrid}>
                {me.accounts.map((a) => (
                  <article key={a.id}>
                    <i>
                      <Icon name="accounts" />
                    </i>
                    <h3>{a.customName || a.name}</h3>
                    <p>{a.providerIdentifier}</p>
                    <span
                      className={
                        a.refreshNeeded || a.disabled
                          ? styles.badTag
                          : styles.tag
                      }
                    >
                      {a.refreshNeeded
                        ? 'Perlu koneksi ulang'
                        : a.disabled
                        ? 'Nonaktif'
                        : 'Terhubung'}
                    </span>
                    {allowed('analytics') && (
                      <button
                        className={styles.textButton}
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const result = await api('/analytics/' + a.id);
                            setNotice(
                              result
                                .map(
                                  (r: { state: string; _count: number }) =>
                                    `${states[r.state] || r.state}: ${r._count}`
                                )
                                .join(' · ') || 'Belum ada data konten.'
                            );
                          })
                        }
                      >
                        Ringkasan publikasi →
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {!me.accounts.length && (
                <div className={styles.empty}>
                  Belum ada akun yang dapat diakses.{' '}
                  {me.owner
                    ? 'Hubungkan akun sosial melalui Kelola Koneksi.'
                    : 'Minta superowner menugaskan akun kepada Anda.'}
                </div>
              )}
            </section>
          )}
          {tab === 'members' && me.owner && (
            <>
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h2>Anggota & Hak Akses</h2>
                    <p>
                      Akun internal dengan username dan password. Tidak ada
                      signup publik.
                    </p>
                  </div>
                  <button
                    className={styles.primary}
                    onClick={() => openMember()}
                  >
                    ＋ Tambah Anggota
                  </button>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Nama / Username</th>
                        <th>Akun ditugaskan</th>
                        <th>Hak akses</th>
                        <th>Status</th>
                        <th>Tindakan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.userId}>
                          <td>
                            <strong>{m.user.name || m.user.username}</strong>
                            <small>@{m.user.username || 'belum diatur'}</small>
                          </td>
                          <td>
                            {m.role === 'SUPERADMIN'
                              ? 'Semua akun'
                              : m.accounts.map(accountName).join(', ') ||
                                'Belum ada'}
                          </td>
                          <td>
                            {m.role === 'SUPERADMIN'
                              ? 'Akses penuh'
                              : m.permissions
                                  .map((p) => permissions[p])
                                  .join(', ') || 'Belum ada'}
                          </td>
                          <td>
                            <span
                              className={
                                m.disabled ? styles.badTag : styles.tag
                              }
                            >
                              {m.disabled ? 'Nonaktif' : 'Aktif'}
                            </span>
                          </td>
                          <td>
                            {m.role === 'SUPERADMIN' ? (
                              <span className={styles.muted}>
                                Pemilik dilindungi
                              </span>
                            ) : (
                              <div className={styles.actions}>
                                <button onClick={() => openMember(m)}>
                                  Atur Akses
                                </button>
                                <button
                                  onClick={() => {
                                    setResetId(m.userId);
                                    setPassword('');
                                    setMemberForm(false);
                                  }}
                                >
                                  Reset Password
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {memberForm && (
                <section className={styles.card}>
                  <h2>
                    {editing
                      ? `Akses @${editing.user.username}`
                      : 'Tambah Anggota'}
                  </h2>
                  <form className={styles.form} onSubmit={saveMember}>
                    {!editing && (
                      <>
                        <label>
                          Nama
                          <input
                            required
                            maxLength={80}
                            value={memberName}
                            onChange={(e) => setMemberName(e.target.value)}
                          />
                        </label>
                        <label>
                          Username
                          <input
                            required
                            minLength={3}
                            maxLength={32}
                            pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}"
                            autoComplete="off"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                          />
                        </label>
                        <label>
                          Password awal (minimal 12 karakter)
                          <input
                            required
                            type="password"
                            minLength={12}
                            maxLength={72}
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                    <fieldset>
                      <legend>Akun yang dapat dikelola</legend>
                      {me.accounts.map((a) => (
                        <label className={styles.check} key={a.id}>
                          <input
                            type="checkbox"
                            checked={memberAccounts.includes(a.id)}
                            onChange={() =>
                              setMemberAccounts(toggle(memberAccounts, a.id))
                            }
                          />
                          {a.customName || a.name}{' '}
                          <small>{a.providerIdentifier}</small>
                        </label>
                      ))}
                      {!me.accounts.length && (
                        <p>Hubungkan akun sosial terlebih dahulu.</p>
                      )}
                    </fieldset>
                    <fieldset>
                      <legend>Hak akses anggota</legend>
                      {Object.entries(permissions).map(([id, label]) => (
                        <label key={id} className={styles.check}>
                          <input
                            type="checkbox"
                            checked={memberPermissions.includes(id)}
                            onChange={() =>
                              setMemberPermissions(
                                toggle(memberPermissions, id)
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={disabled}
                        onChange={(e) => setDisabled(e.target.checked)}
                      />
                      Nonaktifkan anggota
                    </label>
                    <p className={styles.muted}>
                      Pencabutan akses juga diperiksa sebelum worker menerbitkan
                      jadwal berikutnya. Koneksi akun dan pengelolaan anggota
                      khusus superowner.
                    </p>
                    <div className={styles.actions}>
                      <button
                        className={styles.primary}
                        disabled={busy}
                        type="submit"
                      >
                        Simpan Anggota
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMemberForm(false);
                          setPassword('');
                        }}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                </section>
              )}
              {resetId && (
                <section className={styles.card}>
                  <h2>Reset Password Anggota</h2>
                  <form
                    className={styles.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        await api('/members/' + resetId + '/password', 'PUT', {
                          password,
                        });
                        setPassword('');
                        setResetId('');
                        setNotice(
                          'Password diperbarui. Untuk mencabut akses sesi, nonaktifkan anggota.'
                        );
                      });
                    }}
                  >
                    <label>
                      Password baru
                      <input
                        required
                        type="password"
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <div className={styles.actions}>
                      <button className={styles.primary} disabled={busy}>
                        Simpan Password
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetId('');
                          setPassword('');
                        }}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
          {tab === 'ai' && (
            <div className={styles.formGrid}>
              <section className={styles.card}>
                <h2>OpenAI Pribadi</h2>
                <p className={styles.muted}>
                  Setiap anggota memakai API key sendiri. Biaya API terpisah
                  dari langganan ChatGPT. Gambar di ChatGPT Projects dapat
                  diunduh lalu diunggah ke studio.
                </p>
                <span className={styles.tag}>
                  {me.aiConfigured
                    ? 'Key tersimpan · belum membuktikan validitas'
                    : 'Belum terhubung'}
                </span>
                {allowed('ai') ? (
                  <form
                    className={styles.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        await api('/openai', 'PUT', { key });
                        setKey('');
                        await refresh();
                        setNotice(
                          'API key disimpan terenkripsi untuk akun Anda.'
                        );
                      });
                    }}
                  >
                    <label>
                      API key OpenAI
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={key}
                        placeholder="sk-…"
                        onChange={(e) => setKey(e.target.value)}
                      />
                    </label>
                    <button className={styles.primary} disabled={busy}>
                      {me.aiConfigured ? 'Ganti API Key' : 'Simpan API Key'}
                    </button>
                  </form>
                ) : (
                  <p>Izin AI belum diberikan oleh superowner.</p>
                )}
                {me.aiConfigured && (
                  <button
                    className={styles.textButton}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Hapus API key pribadi Anda?'))
                        run(async () => {
                          await api('/openai', 'DELETE');
                          await refresh();
                          setNotice('API key dihapus.');
                        });
                    }}
                  >
                    Hapus API key
                  </button>
                )}
              </section>
              <section className={styles.card}>
                <h2>Asisten Konten</h2>
                <form
                  className={styles.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const result = await api('/ai', 'POST', {
                        type: aiType,
                        prompt,
                      });
                      if (result.text) setAiText(result.text);
                      if (result.media) {
                        await refresh();
                        setNotice(
                          'Gambar tersimpan di Media Anda. Pilih melalui Buat Konten.'
                        );
                      }
                    });
                  }}
                >
                  <label>
                    Bantuan yang dibutuhkan
                    <select
                      value={aiType}
                      onChange={(e) => setAiType(e.target.value)}
                    >
                      <option value="caption">Buat caption</option>
                      <option value="image">Buat gambar</option>
                    </select>
                  </label>
                  <label>
                    Arahan
                    <textarea
                      rows={5}
                      required
                      minLength={3}
                      maxLength={4000}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Ceritakan produk, gaya, dan tujuan konten Anda…"
                    />
                  </label>
                  <button
                    className={styles.primary}
                    disabled={busy || !me.aiConfigured || !allowed('ai')}
                  >
                    {busy ? 'Memproses…' : 'Buat dengan OpenAI'}
                  </button>
                </form>
                {aiText && (
                  <div className={styles.aiResult}>
                    <p>{aiText}</p>
                    <button
                      className={styles.secondary}
                      onClick={() => {
                        clearComposer();
                        setContent(aiText);
                        navigate('compose');
                      }}
                    >
                      Gunakan sebagai caption →
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
          <footer className={styles.footer}>
            Liando Reyfort Management{' '}
            <span>Internal Social Studio · Instagram · TikTok · Threads</span>
            {me.owner && <Link href="/launches">Editor lanjutan ↗</Link>}
          </footer>
        </main>
      </div>
    </div>
  );
}
