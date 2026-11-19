import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function encryptionKey() {
  const raw = process.env.SMTP_ENCRYPTION_KEY ?? ''
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error('SMTP_ENCRYPTION_KEY doit contenir exactement 64 caractères hexadécimaux.')
  }
  return Buffer.from(raw, 'hex')
}

export function encryptSmtpPassword(password: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64')).join('.')
}

export function decryptSmtpPassword(value: string) {
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('Mot de passe SMTP chiffré invalide.')
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivText, 'base64'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
