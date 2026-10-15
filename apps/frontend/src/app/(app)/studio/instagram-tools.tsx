'use client';
import React, { useEffect, useState } from 'react';
import styles from './studio.module.scss';

type Media = { id: string; path: string; name: string };
const video = (path: string) => /\.(mp4|mov)(?:\?|$)/i.test(path);
export const instagramFormats = [
  { id: 'photo', icon: '▧', title: 'Foto', detail: '1 gambar di feed' },
  { id: 'carousel', icon: '▣', title: 'Carousel', detail: '2–10 foto / video' },
  { id: 'reel', icon: '▷', title: 'Reel', detail: '1 video vertikal' },
  { id: 'story', icon: '◉', title: 'Story', detail: '1 foto / video' },
];
export function InstagramFormat({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className={styles.formatPicker}>
      <legend>1. Pilih format Instagram</legend>
      <div>
        {instagramFormats.map((f) => (
          <button
            type="button"
            key={f.id}
            className={value === f.id ? styles.chosenFormat : ''}
            aria-pressed={value === f.id}
            onClick={() => onChange(f.id)}
          >
            <b aria-hidden="true">{f.icon}</b>
            <strong>{f.title}</strong>
            <small>{f.detail}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function InstagramPreview({
  format,
  selected,
  media,
  caption,
  account,
  onChange,
}: {
  format: string;
  selected: string[];
  media: Media[];
  caption: string;
  account: string;
  onChange: (ids: string[]) => void;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
  }, [selected.join(','), format]);
  const ordered = selected
    .map((id) => media.find((m) => m.id === id))
    .filter(Boolean) as Media[];
  const current = ordered[index];
  const warning =
    format === 'carousel'
      ? ordered.length < 2
        ? 'Pilih minimal 2 media untuk carousel.'
        : ''
      : ordered.length > 1
      ? 'Format ini menggunakan tepat satu media.'
      : current && format === 'reel' && !video(current.path)
      ? 'Reel memerlukan video.'
      : current && format === 'photo' && video(current.path)
      ? 'Gunakan format Reel untuk video tunggal.'
      : '';
  const move = (from: number, to: number) => {
    const ids = [...selected];
    [ids[from], ids[to]] = [ids[to], ids[from]];
    onChange(ids);
  };
  return (
    <div className={styles.instagramPreview}>
      <header>
        <span className={styles.avatar}>
          {account.slice(0, 1).toUpperCase() || '◎'}
        </span>
        <strong>{account || 'Pilih akun Instagram'}</strong>
        <span>•••</span>
      </header>
      <div
        className={`${styles.previewCanvas} ${
          ['reel', 'story'].includes(format) ? styles.verticalPreview : ''
        }`}
      >
        {current ? (
          video(current.path) ? (
            <video src={current.path} controls playsInline />
          ) : (
            <img src={current.path} alt={`Pratinjau media ${index + 1}`} />
          )
        ) : (
          <div>
            <b>＋</b>
            <strong>Pilih foto atau video Anda</strong>
            <p>Unggah media, lalu pilih dari pustaka di bawah.</p>
          </div>
        )}
        {ordered.length > 1 && (
          <>
            <button
              className={styles.previewPrevious}
              aria-label="Media sebelumnya"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              ‹
            </button>
            <button
              className={styles.previewNext}
              aria-label="Media berikutnya"
              disabled={index === ordered.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              ›
            </button>
            <span className={styles.previewCount}>
              {index + 1}/{ordered.length}
            </span>
          </>
        )}
      </div>
      <div className={styles.previewCaption}>
        <span aria-hidden="true">♡ &nbsp; ◯ &nbsp; ➤</span>
        <small>
          Pratinjau{' '}
          {instagramFormats.find((f) => f.id === format)?.title || 'Feed'}
        </small>
        <p>
          <strong>{account || 'instagram'}</strong>{' '}
          {caption.slice(0, 200) || 'Caption Anda akan tampil di sini…'}
        </p>
        {ordered.length > 1 && (
          <div className={styles.previewDots}>
            {ordered.map((_, n) => (
              <button
                key={n}
                aria-label={`Lihat media ${n + 1}`}
                aria-pressed={index === n}
                onClick={() => setIndex(n)}
              >
                {index === n ? '●' : '○'}
              </button>
            ))}
          </div>
        )}
      </div>
      {warning && (
        <p className={styles.error} role="status">
          {warning}
        </p>
      )}
      {ordered.length > 0 && (
        <section className={styles.mediaOrder}>
          <h3>2. Urutan media</h3>
          {ordered.map((m, n) => (
            <div key={m.id}>
              <span>
                {n + 1}. {video(m.path) ? 'Video' : 'Foto'}
              </span>
              <button
                disabled={n === 0}
                onClick={() => move(n, n - 1)}
                aria-label={`Geser media ${n + 1} ke kiri`}
              >
                ←
              </button>
              <button
                disabled={n === ordered.length - 1}
                onClick={() => move(n, n + 1)}
                aria-label={`Geser media ${n + 1} ke kanan`}
              >
                →
              </button>
              <button
                onClick={() => onChange(selected.filter((id) => id !== m.id))}
                aria-label={`Hapus media ${n + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </section>
      )}
      <p className={styles.muted}>
        Pratinjau mempertahankan media asli. Carousel maksimal 10 media melalui
        API; Reel dan Story sebaiknya 9:16. Musik/stiker Instagram tidak
        ditambahkan oleh pratinjau ini.
      </p>
    </div>
  );
}

type Thread = { id: string; name: string; handle: string; updatedAt: string };
type Message = {
  id: string;
  text: string;
  incoming: boolean;
  createdAt: string;
};
export function InstagramInbox({
  accounts,
  canRead,
  canReply,
  api,
}: {
  accounts: { id: string; name: string; providerIdentifier: string }[];
  canRead: boolean;
  canReply: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
}) {
  const choices = accounts.filter(
    (a) => a.providerIdentifier === 'instagram-standalone'
  );
  const [account, setAccount] = useState(choices[0]?.id || '');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [thread, setThread] = useState<Thread>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [eligible, setEligible] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [after, setAfter] = useState<string | null>(null);
  const [older, setOlder] = useState<string | null>(null);
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pesan tidak dapat dimuat.');
    } finally {
      setBusy(false);
    }
  };
  const load = (more = false) =>
    action(async () => {
      const result = await api(
        '/inbox/' +
          account +
          (more && after ? '?after=' + encodeURIComponent(after) : '')
      );
      setThreads((previous) =>
        more ? [...previous, ...result.threads] : result.threads
      );
      setAfter(result.after);
      setLoaded(true);
      if (!more) {
        setThread(undefined);
        setMessages([]);
      }
    });
  const open = (item: Thread, more = false) =>
    action(async () => {
      const result = await api('/inbox/thread', 'POST', {
        accountId: account,
        handle: item.handle,
        ...(more && older ? { after: older } : {}),
      });
      setThread(item);
      setMessages((previous) =>
        more ? [...previous, ...result.messages] : result.messages
      );
      if (!more) setEligible(result.canReply);
      setOlder(result.after);
      setText('');
    });
  if (!canRead)
    return (
      <section className={styles.card}>
        <h2>Pesan Instagram</h2>
        <p>
          Izin membaca pesan belum diberikan. Minta superowner mengaktifkan izin
          Baca DM Instagram untuk akun tugas Anda.
        </p>
      </section>
    );
  return (
    <section className={styles.card}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>Pesan Instagram</h2>
          <p>
            Instagram Standalone · balasan teks · muat ulang untuk pesan terbaru
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <label>
          Akun Instagram
          <select
            disabled={busy}
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setThreads([]);
              setMessages([]);
              setThread(undefined);
              setLoaded(false);
              setAfter(null);
            }}
          >
            <option value="" disabled>
              Pilih akun
            </option>
            {choices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className={styles.primary}
          disabled={busy || !account}
          onClick={() => load()}
        >
          Muat Inbox
        </button>
      </div>
      {!choices.length && (
        <p className={styles.muted}>
          Hubungkan Instagram Standalone atau minta superowner menugaskan akun
          tersebut.
        </p>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <p className={styles.muted}>
        Jika izin pesan belum diberikan, superowner perlu menghubungkan ulang
        akun dan menyetujui akses pesan. Di Instagram, izinkan akses pesan untuk
        aplikasi/alat terhubung.
      </p>
      <div className={styles.inboxGrid}>
        <nav aria-label="Percakapan Instagram">
          {threads.map((t) => (
            <button
              key={t.id}
              className={thread?.id === t.id ? styles.selectedThread : ''}
              disabled={busy}
              onClick={() => open(t)}
            >
              <span className={styles.avatar}>{t.name.slice(0, 1)}</span>
              <strong>{t.name}</strong>
            </button>
          ))}
          {loaded && !threads.length && (
            <p>Belum ada percakapan yang dikembalikan Instagram.</p>
          )}
          {after && (
            <button disabled={busy} onClick={() => load(true)}>
              Muat percakapan lainnya
            </button>
          )}
        </nav>
        <div className={styles.conversation}>
          {thread ? (
            <>
              <header>
                <strong>{thread.name}</strong>
                <button disabled={busy} onClick={() => open(thread)}>
                  Muat ulang
                </button>
              </header>
              <div className={styles.messageList}>
                {[...messages]
                  .sort(
                    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
                  )
                  .map((m) => (
                    <article
                      key={m.id}
                      className={
                        m.incoming
                          ? styles.incomingMessage
                          : styles.outgoingMessage
                      }
                    >
                      <p>{m.text || '[Lampiran atau pesan nonteks]'}</p>
                      <small>
                        {new Date(m.createdAt).toLocaleString('id-ID', {
                          timeZone: 'Asia/Jakarta',
                        })}
                      </small>
                    </article>
                  ))}
                {older && (
                  <button disabled={busy} onClick={() => open(thread, true)}>
                    Muat pesan sebelumnya
                  </button>
                )}
              </div>
              <form
                className={styles.replyForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  action(async () => {
                    await api('/inbox/reply', 'POST', {
                      accountId: account,
                      handle: thread.handle,
                      text,
                    });
                    setText('');
                    const result = await api('/inbox/thread', 'POST', {
                      accountId: account,
                      handle: thread.handle,
                    });
                    setMessages(result.messages);
                    setEligible(result.canReply);
                  });
                }}
              >
                <label>
                  Balasan
                  <textarea
                    data-sentry-block
                    required
                    maxLength={1000}
                    value={text}
                    disabled={!canReply || !eligible || busy}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      !canReply
                        ? 'Izin membalas belum diberikan'
                        : !eligible
                        ? 'Tidak ada pesan masuk dalam jendela balasan 24 jam'
                        : 'Tulis balasan Anda…'
                    }
                  />
                </label>
                <button
                  className={styles.primary}
                  disabled={busy || !text.trim() || !canReply || !eligible}
                >
                  Kirim Balasan
                </button>
              </form>
              <p className={styles.muted}>
                Balasan mengikuti jendela 24 jam dan ketentuan Meta. Tidak ada
                pesan yang dikirim otomatis.
              </p>
            </>
          ) : (
            <div className={styles.empty}>
              {busy ? 'Memuat pesan…' : 'Muat inbox, lalu pilih percakapan.'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
