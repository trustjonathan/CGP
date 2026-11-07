import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const output = join(tmpdir(), 'cgp-vault-backup-tests.mjs');
await build({
  entryPoints: ['src/lib/vaultBackup.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: output,
});
const backup = await import(pathToFileURL(output).href);
await unlink(output);

const original = {
  vault: {
    government_ids: [{ id: 'id-1', number: 'private-id' }],
    payment_cards: [{ id: 'card-1', card_number: '4111111111111111' }],
    travel_docs: [],
    schedules: [],
    app_environments: [],
    custom_secrets: [],
  },
  pin: '1234',
};

test('vault backup encrypts data, excludes the local PIN, and restores exactly', async () => {
  const encrypted = await backup.encryptVaultBackup(original, 'a strong recovery passphrase', 'user-1');
  assert.equal(backup.isEncryptedVaultBackup(encrypted), true);
  assert.equal(JSON.stringify(encrypted).includes('4111111111111111'), false);
  assert.equal(JSON.stringify(encrypted).includes('1234'), false);
  assert.deepEqual(
    await backup.decryptVaultBackup(encrypted, 'a strong recovery passphrase', 'user-1'),
    { vault: original.vault },
  );
});

test('vault backup rejects the wrong recovery passphrase and user account', async () => {
  const encrypted = await backup.encryptVaultBackup(original, 'a strong recovery passphrase', 'user-1');
  await assert.rejects(backup.decryptVaultBackup(encrypted, 'another strong passphrase', 'user-1'));
  await assert.rejects(backup.decryptVaultBackup(encrypted, 'a strong recovery passphrase', 'user-2'));
});

test('vault backup requires a strong recovery passphrase and valid backup shape', async () => {
  await assert.rejects(backup.encryptVaultBackup(original, '1234', 'user-1'), /16 characters/);
  await assert.rejects(backup.encryptVaultBackup({ vault: { payment_cards: [] } }, 'a strong recovery passphrase', 'user-1'), /invalid entries/);
});
