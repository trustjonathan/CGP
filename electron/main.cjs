const { app, BrowserWindow, session, ipcMain, shell, clipboard, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { spawn } = require('node:child_process');

const isDevelopment = process.argv.includes('--dev');

app.setPath('userData', path.join(app.getPath('appData'), 'vite-react-typescript-starter'));

function documentsDirectory() {
  return path.join(app.getPath('userData'), 'course-documents');
}

function defaultMultiVaultState() {
  return {
    vault: {
      government_ids: [],
      payment_cards: [],
      travel_docs: [],
      schedules: [],
      app_environments: [],
      custom_secrets: [],
    },
    pin: undefined,
  };
}

function multiVaultFilePath() {
  return path.join(app.getPath('userData'), 'secure_multi_vault.enc');
}

function vaultBackupSecretFilePath() {
  return path.join(app.getPath('userData'), 'vault_backup_secret.enc');
}

function normalizeMultiVaultState(value) {
  const payload = value && typeof value === 'object' ? value : {};
  const source = 'vault' in payload ? payload.vault : payload;
  if (!source || typeof source !== 'object') {
    return defaultMultiVaultState();
  }

  return {
    vault: {
      government_ids: Array.isArray(source.government_ids) ? source.government_ids : [],
      payment_cards: Array.isArray(source.payment_cards) ? source.payment_cards : [],
      travel_docs: Array.isArray(source.travel_docs) ? source.travel_docs : [],
      schedules: Array.isArray(source.schedules) ? source.schedules : [],
      app_environments: Array.isArray(source.app_environments) ? source.app_environments : [],
      custom_secrets: Array.isArray(source.custom_secrets) ? source.custom_secrets : [],
    },
    pin: /^\d{4}$/.test(String(payload.pin ?? payload.otp ?? source.pin ?? source.otp ?? ''))
      ? String(payload.pin ?? payload.otp ?? source.pin ?? source.otp)
      : undefined,
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f7f8fa',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.removeMenu();

  if (isDevelopment) {
    window.loadURL('http://localhost:5173');
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function launchSetup() {
  const candidates = [
    path.join(path.dirname(process.execPath), 'CGPA Tracker Setup 0.0.0.exe'),
    path.join(path.dirname(process.execPath), '..', 'CGPA Tracker Setup 0.0.0.exe'),
    path.join(process.cwd(), 'release', 'CGPA Tracker Setup 0.0.0.exe'),
    path.join(process.cwd(), 'CGPA Tracker Setup 0.0.0.exe'),
  ];
  const installer = candidates.find((candidate) => fs.existsSync(candidate));
  if (!installer) return false;

  const child = spawn(installer, [], { detached: true, stdio: 'ignore' });
  child.unref();
  return true;
}

ipcMain.handle('refresh-app', () => ({ installerLaunched: launchSetup() }));

ipcMain.handle('vault:save-multi', async (_event, data) => {
  const payload = data && typeof data === 'object' ? normalizeMultiVaultState(data) : defaultMultiVaultState();
  const encrypted = safeStorage.encryptString(JSON.stringify(payload, null, 2));
  const target = multiVaultFilePath();
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, encrypted);
  return true;
});

ipcMain.handle('vault:load-multi', async () => {
  const target = multiVaultFilePath();

  if (!fs.existsSync(target)) {
    return defaultMultiVaultState();
  }

  try {
    const encrypted = await fsp.readFile(target);
    const jsonString = safeStorage.decryptString(encrypted);
    return normalizeMultiVaultState(JSON.parse(jsonString));
  } catch {
    return defaultMultiVaultState();
  }
});

async function loadVaultBackupSecrets() {
  const target = vaultBackupSecretFilePath();
  if (!fs.existsSync(target)) return {};
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable on this device.');
  }
  const encrypted = await fsp.readFile(target);
  const stored = JSON.parse(safeStorage.decryptString(encrypted));
  return stored && stored.version === 1 && stored.secrets && typeof stored.secrets === 'object'
    ? stored.secrets
    : {};
}

async function saveVaultBackupSecrets(secrets) {
  const target = vaultBackupSecretFilePath();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable on this device.');
  }
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, safeStorage.encryptString(JSON.stringify({ version: 1, secrets })));
}

ipcMain.handle('vault:save-backup-secret', async (_event, userId, secret) => {
  if (typeof userId !== 'string' || !userId || userId.length > 128) {
    throw new Error('The Vault backup account is invalid.');
  }
  if (typeof secret !== 'string' || secret.trim().length < 16 || secret.length > 1024) {
    throw new Error('The Vault recovery passphrase is invalid.');
  }
  const secrets = await loadVaultBackupSecrets();
  secrets[userId] = secret;
  await saveVaultBackupSecrets(secrets);
  return true;
});

ipcMain.handle('vault:load-backup-secret', async (_event, userId) => {
  if (typeof userId !== 'string' || !userId || userId.length > 128) return null;
  const secrets = await loadVaultBackupSecrets();
  return typeof secrets[userId] === 'string' ? secrets[userId] : null;
});

ipcMain.handle('vault:clear-backup-secret', async (_event, userId) => {
  if (typeof userId !== 'string' || !userId || userId.length > 128) return false;
  const secrets = await loadVaultBackupSecrets();
  delete secrets[userId];
  if (Object.keys(secrets).length === 0) {
    await fsp.rm(vaultBackupSecretFilePath(), { force: true });
  } else {
    await saveVaultBackupSecrets(secrets);
  }
  return true;
});

ipcMain.handle('vault:copy-sensitive', async (_event, text, autoClearSeconds = 30) => {
  const value = typeof text === 'string' ? text : String(text ?? '');
  clipboard.writeText(value);
  const delayMs = Math.max(0, Number(autoClearSeconds ?? 30) * 1000);
  setTimeout(() => {
    try {
      clipboard.clear();
    } catch {
      // ignore clipboard errors
    }
  }, delayMs);
  return true;
});

ipcMain.handle('save-course-document', async (_event, fileName, data) => {
  const directory = documentsDirectory();
  await fsp.mkdir(directory, { recursive: true });
  const safeName = `${Date.now()}-${path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(directory, safeName);
  await fsp.writeFile(filePath, Buffer.from(data));
  return filePath;
});

ipcMain.handle('open-course-document', async (_event, filePath) => shell.openPath(filePath));
ipcMain.handle('delete-course-document', async (_event, filePath) => {
  if (filePath.startsWith(documentsDirectory())) await fsp.rm(filePath, { force: true });
});

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const isLocalRequest = details.url.startsWith('http://localhost:5173');
      callback({ cancel: !isDevelopment && !isLocalRequest });
    }
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});