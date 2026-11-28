import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/** Criptografia AES-256-GCM para segredos no banco (chaves de API). A chave vem de CREDENTIALS_KEY. */
let cached: { src: string; key: Buffer } | null = null;
function key(): Buffer {
  const src = process.env.CREDENTIALS_KEY;
  if (!src || src.length < 24) throw new Error('CREDENTIALS_KEY ausente ou curta demais (use: openssl rand -hex 32)');
  if (!cached || cached.src !== src) cached = { src, key: scryptSync(src, 'prophet-credentials-v1', 32) };
  return cached.key;
}

export const cryptoReady = () => { try { key(); return true; } catch { return false; } };

export function seal(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function open(sealed: string): string {
  const [v, iv, tag, ct] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('segredo em formato inválido');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
