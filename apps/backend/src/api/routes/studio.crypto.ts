import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';

function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('Server encryption configuration unavailable');
  return Buffer.from(
    hkdfSync(
      'sha256',
      secret,
      'lrm-studio-v1',
      'personal-openai-credentials',
      32
    )
  );
}
export function encryptStudioKey(value: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}
export function decryptStudioKey(value: string, userId: string) {
  const [version, iv, tag, encrypted] = value.split('.');
  if (version !== 'v1') throw new Error('Unsupported credential format');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv, 'base64')
  );
  cipher.setAAD(Buffer.from(userId));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    cipher.update(Buffer.from(encrypted, 'base64')),
    cipher.final(),
  ]).toString('utf8');
}
