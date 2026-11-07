const VAULT_CATEGORIES = [
  'government_ids',
  'payment_cards',
  'travel_docs',
  'schedules',
  'app_environments',
  'custom_secrets',
] as const;

export type VaultBackupData = {
  vault: Record<(typeof VAULT_CATEGORIES)[number], Array<Record<string, unknown>>>;
};

export interface EncryptedVaultBackup {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

export function isEncryptedVaultBackup(value: unknown): value is EncryptedVaultBackup {
  return isObject(value)
    && value.version === 1
    && typeof value.salt === 'string'
    && typeof value.iv === 'string'
    && typeof value.ciphertext === 'string';
}

const PBKDF2_ITERATIONS = 600_000;
const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function backupKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    asArrayBuffer(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  ).then((passwordKey) => crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: asArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  ));
}

function associatedData(userId: string): Uint8Array {
  return new TextEncoder().encode(`cgp-vault-backup:${userId}:v1`);
}

function normalizeBackupData(value: unknown): VaultBackupData {
  if (!isObject(value) || !isObject(value.vault)) {
    throw new Error('The decrypted Vault backup has an invalid shape.');
  }
  const vault = {} as VaultBackupData['vault'];
  for (const category of VAULT_CATEGORIES) {
    const entries = value.vault[category];
    if (!Array.isArray(entries) || entries.some((entry) => !isObject(entry))) {
      throw new Error('The decrypted Vault backup has invalid entries.');
    }
    vault[category] = entries;
  }
  return { vault };
}

export async function encryptVaultBackup(
  value: unknown,
  passphrase: string,
  userId: string,
): Promise<EncryptedVaultBackup> {
  if (passphrase.trim().length < 16) {
    throw new Error('Use a recovery passphrase with at least 16 characters.');
  }
  if (!userId) throw new Error('Sign in before enabling Vault backup.');

  const normalized = normalizeBackupData(value);
  const plaintext = new TextEncoder().encode(JSON.stringify(normalized));
  if (plaintext.byteLength > MAX_BACKUP_BYTES) {
    throw new Error('The Vault backup is too large to sync.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(associatedData(userId)),
    },
    key,
    asArrayBuffer(plaintext),
  );
  return {
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptVaultBackup(
  value: unknown,
  passphrase: string,
  userId: string,
): Promise<VaultBackupData> {
  if (!isEncryptedVaultBackup(value)) {
    throw new Error('The cloud Vault backup is invalid or unsupported.');
  }
  if (passphrase.trim().length < 16) {
    throw new Error('Use the recovery passphrase that is at least 16 characters long.');
  }
  if (!userId) throw new Error('Sign in before restoring the Vault backup.');

  const salt = fromBase64(value.salt);
  const iv = fromBase64(value.iv);
  const ciphertext = fromBase64(value.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length > MAX_BACKUP_BYTES + 32) {
    throw new Error('The cloud Vault backup is invalid or too large.');
  }
  const key = await backupKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(associatedData(userId)),
    },
    key,
    asArrayBuffer(ciphertext),
  );
  return normalizeBackupData(JSON.parse(new TextDecoder().decode(plaintext)));
}
