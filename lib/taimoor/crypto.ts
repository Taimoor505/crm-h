import crypto from 'node:crypto';

const DEFAULT_DEV_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function getEncryptionKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY || DEFAULT_DEV_KEY;
  const clean = hex.replace(/[^0-9a-fA-F]/g, '').padEnd(64, '0').slice(0, 64);
  return Buffer.from(clean, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc_v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== 'enc_v1') {
    throw new Error('Invalid encrypted secret format');
  }
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const data = Buffer.from(parts[3], 'hex');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function computeWhatsappSignature(rawBody: string, secret?: string): string {
  const appSecret = secret || process.env.WHATSAPP_APP_SECRET || 'taimoor_whatsapp_dev_secret';
  const digest = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

export function verifyWhatsappSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret?: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected = computeWhatsappSignature(rawBody, secret);
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
