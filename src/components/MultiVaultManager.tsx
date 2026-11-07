import { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  WalletCards,
  FileText,
  CalendarClock,
  KeyRound,
  Landmark,
  Plane,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/lib/supabase';
import {
  decryptVaultBackup,
  encryptVaultBackup,
  isEncryptedVaultBackup,
  type EncryptedVaultBackup,
  type VaultBackupData,
} from '@/lib/vaultBackup';

type CategoryKey =
  | 'government_ids'
  | 'payment_cards'
  | 'travel_docs'
  | 'schedules'
  | 'app_environments'
  | 'custom_secrets';

type VaultEntry = Record<string, unknown> & {
  id?: string | number;
  title?: string;
  name?: string;
  key?: string;
};

type VaultData = {
  vault: Record<CategoryKey, VaultEntry[]>;
  pin?: string;
};

type FormField = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'date' | 'datetime-local' | 'textarea';
  sensitive?: boolean;
};

const EMPTY_VAULT: VaultData = {
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
const MAX_BACKUP_PASSPHRASE_LENGTH = 1024;
interface RemoteVaultBackup {
  encryptedPayload: EncryptedVaultBackup;
  updatedAt: string;
}

async function loadRemoteVaultBackup(userId: string): Promise<RemoteVaultBackup | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vault_backups')
    .select('encrypted_payload, updated_at')
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (!isEncryptedVaultBackup(data.encrypted_payload) || typeof data.updated_at !== 'string') {
    throw new Error('The saved Vault backup has an unsupported format.');
  }
  return { encryptedPayload: data.encrypted_payload, updatedAt: data.updated_at };
}

async function uploadVaultBackup(
  userId: string,
  encryptedPayload: EncryptedVaultBackup,
  expectedUpdatedAt: string | null,
): Promise<RemoteVaultBackup> {
  if (!supabase) throw new Error('Vault backup is not configured in this build.');
  if (expectedUpdatedAt === null) {
    const { data, error } = await supabase.from('vault_backups')
      .insert({ owner_id: userId, encrypted_payload: encryptedPayload })
      .select('encrypted_payload, updated_at')
      .single();
    if (error) throw error;
    if (!data || !isEncryptedVaultBackup(data.encrypted_payload) || typeof data.updated_at !== 'string') {
      throw new Error('The server returned an invalid Vault backup record.');
    }
    return { encryptedPayload: data.encrypted_payload, updatedAt: data.updated_at };
  }

  const updatedAt = new Date(Math.max(Date.now(), Date.parse(expectedUpdatedAt) + 1)).toISOString();
  const { data, error } = await supabase.from('vault_backups')
    .update({ encrypted_payload: encryptedPayload, updated_at: updatedAt })
    .eq('owner_id', userId)
    .eq('updated_at', expectedUpdatedAt)
    .select('encrypted_payload, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('A newer cloud Vault backup exists. Sync was paused to protect both copies.');
  if (!isEncryptedVaultBackup(data.encrypted_payload) || typeof data.updated_at !== 'string') {
    throw new Error('The server returned an invalid Vault backup record.');
  }
  return { encryptedPayload: data.encrypted_payload, updatedAt: data.updated_at };
}

const CATEGORY_META: Record<
  CategoryKey,
  { label: string; icon: typeof WalletCards; fields: FormField[] }
> = {
  payment_cards: {
    label: '💳 Payment Cards',
    icon: WalletCards,
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'cardholder_name', label: 'Cardholder name' },
      { key: 'card_number', label: 'Card number', type: 'password', sensitive: true },
      { key: 'expiry_month', label: 'Expiry month' },
      { key: 'expiry_year', label: 'Expiry year' },
      { key: 'cvv', label: 'CVV', type: 'password', sensitive: true },
      { key: 'pin', label: 'PIN', type: 'password', sensitive: true },
      { key: 'type', label: 'Card type' },
    ],
  },
  government_ids: {
    label: '🪪 Gov Identifiers (NIN/TIN)',
    icon: Landmark,
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'number', label: 'Identifier number', type: 'password', sensitive: true },
      { key: 'expiry', label: 'Expiry date', type: 'date' },
      { key: 'country', label: 'Country' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  travel_docs: {
    label: '✈️ Visas & Passports',
    icon: Plane,
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'doc_number', label: 'Document number', type: 'password', sensitive: true },
      { key: 'country', label: 'Country' },
      { key: 'expiry_date', label: 'Expiry date', type: 'date' },
    ],
  },
  app_environments: {
    label: '⚙️ App Envs (.env)',
    icon: KeyRound,
    fields: [
      { key: 'app', label: 'App / Service' },
      { key: 'key', label: 'Key name', type: 'password', sensitive: true },
      { key: 'value', label: 'Value', type: 'password', sensitive: true },
    ],
  },
  schedules: {
    label: '📅 Schedules',
    icon: CalendarClock,
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'date', label: 'Date & time', type: 'datetime-local' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  custom_secrets: {
    label: '🔑 Custom Secrets',
    icon: FileText,
    fields: [
      { key: 'title', label: 'Title' },
      { key: 'key', label: 'Key', type: 'password', sensitive: true },
      { key: 'value', label: 'Value', type: 'password', sensitive: true },
    ],
  },
};

const categoryOrder: CategoryKey[] = [
  'payment_cards',
  'government_ids',
  'travel_docs',
  'app_environments',
  'schedules',
  'custom_secrets',
];

const isVaultEmpty = (value: VaultData) => categoryOrder.every((category) => value.vault[category].length === 0);

const normalizeVaultData = (value: unknown): VaultData => {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const source = payload.vault && typeof payload.vault === 'object' ? payload.vault as Record<string, unknown> : payload;

  if (!source || typeof source !== 'object') {
    return EMPTY_VAULT;
  }

  return {
    vault: {
      government_ids: Array.isArray(source.government_ids) ? source.government_ids as VaultEntry[] : [],
      payment_cards: Array.isArray(source.payment_cards) ? source.payment_cards as VaultEntry[] : [],
      travel_docs: Array.isArray(source.travel_docs) ? source.travel_docs as VaultEntry[] : [],
      schedules: Array.isArray(source.schedules) ? source.schedules as VaultEntry[] : [],
      app_environments: Array.isArray(source.app_environments) ? source.app_environments as VaultEntry[] : [],
      custom_secrets: Array.isArray(source.custom_secrets) ? source.custom_secrets as VaultEntry[] : [],
    },
    pin: /^(?:\d{4})$/.test(String(payload.pin ?? payload.otp ?? source.pin ?? source.otp ?? ''))
      ? String(payload.pin ?? payload.otp ?? source.pin ?? source.otp)
      : undefined,
  };
};

const makeEmptyFormForCategory = (category: CategoryKey): Record<string, string> =>
  CATEGORY_META[category].fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.key] = '';
    return acc;
  }, {});

const getCategoryEntries = (vault: VaultData, category: CategoryKey) => vault.vault[category] ?? [];

const maskedValue = (value: unknown, showValue: boolean) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (showValue) return text;
  if (text.length <= 4) return '•'.repeat(Math.max(4, text.length));
  return '•'.repeat(Math.max(4, text.length - 4)) + text.slice(-4);
};

const getEntryId = (item: VaultEntry, fallback: string) => {
  if (typeof item.id === 'string' || typeof item.id === 'number') {
    return String(item.id);
  }
  return fallback;
};

export function MultiVaultManager() {
  const { user } = useAuth();
  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT);
  const [remoteBackup, setRemoteBackup] = useState<RemoteVaultBackup | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupPassphraseConfirmation, setBackupPassphraseConfirmation] = useState('');
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupConflict, setBackupConflict] = useState(false);
  const [canReplaceLockedBackup, setCanReplaceLockedBackup] = useState(false);
  const [cloudCandidate, setCloudCandidate] = useState<VaultBackupData | null>(null);
  const [backupStatus, setBackupStatus] = useState('');
  const [backupError, setBackupError] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [rememberBackupSecret, setRememberBackupSecret] = useState(true);
  const [onlineRevision, setOnlineRevision] = useState(0);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('payment_cards');
  const [formValues, setFormValues] = useState<Record<string, string>>(() => makeEmptyFormForCategory('payment_cards'));
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [showPinError, setShowPinError] = useState(false);

  useEffect(() => {
    let active = true;
    const loadVault = async () => {
      let localLoaded = false;
      setIsReady(false);
      setIsAuthenticated(false);
      setRemoteBackup(null);
      setBackupEnabled(false);
      setBackupConflict(false);
      setCanReplaceLockedBackup(false);
      setCloudCandidate(null);
      setBackupPassphrase('');
      setBackupPassphraseConfirmation('');
      setBackupStatus('');
      setBackupError('');
      if (!window.multiVaultAPI) {
        setIsSettingPin(true);
        setIsReady(true);
        return;
      }

      try {
        const savedVault = await window.multiVaultAPI.loadVault();
        const normalizedVault = normalizeVaultData(savedVault);
        localLoaded = true;
        let nextVault = normalizedVault;
        setVault(normalizedVault);
        setIsSettingPin(!normalizedVault.pin);

        if (user?.id && supabase && navigator.onLine) {
          const remote = await loadRemoteVaultBackup(user.id);
          if (!active) return;
          setRemoteBackup(remote);
          const rememberedSecret = await window.multiVaultAPI.loadBackupSecret(user.id);
          if (remote && rememberedSecret) {
            try {
              const cloudData = await decryptVaultBackup(remote.encryptedPayload, rememberedSecret, user.id);
              setBackupPassphrase(rememberedSecret);
              if (isVaultEmpty(normalizedVault)) {
                nextVault = { ...normalizeVaultData(cloudData), pin: normalizedVault.pin };
                setVault(nextVault);
                setIsSettingPin(!nextVault.pin);
                setBackupEnabled(true);
                setBackupStatus('Your encrypted Vault backup was restored on this device.');
              } else if (JSON.stringify(cloudData.vault) === JSON.stringify(normalizedVault.vault)) {
                setBackupEnabled(true);
              } else {
                setBackupConflict(true);
                setCloudCandidate(cloudData);
                setBackupStatus('A different encrypted cloud copy exists. Choose which copy to keep before syncing.');
              }
            } catch (error) {
              console.error('Unable to unlock the saved encrypted Vault backup.', error);
              setBackupError('The remembered recovery passphrase could not unlock the cloud backup. Enter it again to recover.');
            }
          }
        }
      } catch (error) {
        if (active && !localLoaded) {
          console.error('Unable to load the local Vault.', error);
          setVault(EMPTY_VAULT);
          setIsSettingPin(true);
        } else if (active && navigator.onLine) {
          console.error('Unable to load the encrypted Vault backup.', error);
          setBackupError('The local Vault is available, but its cloud backup could not be checked.');
        } else if (active) {
          setBackupStatus('Vault backup will check for updates when this device is online.');
        }
      } finally {
        if (active) setIsReady(true);
      }
    };

    void loadVault();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!isReady || !window.multiVaultAPI) return;

    const timeoutId = window.setTimeout(() => {
      void window.multiVaultAPI!.saveVault(vault).catch(() => undefined);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [vault, isReady]);

  useEffect(() => {
    const handleOnline = () => setOnlineRevision((revision) => revision + 1);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    if (!onlineRevision || !user?.id || !supabase || !window.multiVaultAPI) return;
    let active = true;
    void (async () => {
      try {
        const remote = await loadRemoteVaultBackup(user.id);
        if (!active) return;
        setRemoteBackup(remote);
        if (!remote) return;
        const rememberedSecret = await window.multiVaultAPI!.loadBackupSecret(user.id);
        if (!rememberedSecret) return;
        const cloudData = await decryptVaultBackup(remote.encryptedPayload, rememberedSecret, user.id);
        if (!active) return;
        setBackupPassphrase(rememberedSecret);
        if (isVaultEmpty(vault)) {
          setVault({ ...normalizeVaultData(cloudData), pin: vault.pin });
          setIsSettingPin(!vault.pin);
          setBackupEnabled(true);
          setBackupStatus('Your encrypted Vault backup was restored on this device.');
        } else if (JSON.stringify(cloudData.vault) === JSON.stringify(vault.vault)) {
          setBackupEnabled(true);
        } else {
          setCloudCandidate(cloudData);
          setBackupConflict(true);
          setBackupStatus('Another saved Vault copy is available. Choose which copy to keep before syncing.');
        }
      } catch (error) {
        if (!active) return;
        console.error('Unable to refresh the encrypted Vault backup after reconnecting.', error);
        setBackupError('The local Vault is available, but its cloud backup could not be checked.');
      }
    })();
    return () => { active = false; };
  }, [onlineRevision, user?.id, vault]);

  useEffect(() => {
    if (!isReady || !isAuthenticated || !backupEnabled || backupConflict
      || !backupPassphrase || !user?.id || !supabase || !window.multiVaultAPI || !navigator.onLine) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const encrypted = await encryptVaultBackup(vault, backupPassphrase, user.id);
          const uploaded = await uploadVaultBackup(user.id, encrypted, remoteBackup?.updatedAt ?? null);
          setRemoteBackup(uploaded);
          setBackupStatus('Encrypted Vault backup is up to date.');
          setBackupError('');
        } catch (error) {
          console.error('Unable to sync the encrypted Vault backup.', error);
          const isConcurrentWrite = (error instanceof Error
            && error.message.includes('A newer cloud Vault backup exists.'))
            || Boolean(error && typeof error === 'object'
              && 'code' in error && error.code === '23505');
          if (isConcurrentWrite) {
            try {
              const latest = await loadRemoteVaultBackup(user.id);
              if (latest) {
                const cloudData = await decryptVaultBackup(latest.encryptedPayload, backupPassphrase, user.id);
                setRemoteBackup(latest);
                setCloudCandidate(cloudData);
                setBackupConflict(true);
                setBackupEnabled(false);
                setBackupStatus('Another device saved changes. Sync paused so you can choose which Vault copy to keep.');
                setBackupError('');
                return;
              }
            } catch (refreshError) {
              console.error('Unable to load the newer encrypted Vault backup.', refreshError);
            }
          }
          setBackupError(navigator.onLine
            ? 'The encrypted Vault backup could not be saved. It remains on this device; retry when ready.'
            : '');
        }
      })();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [vault, isReady, isAuthenticated, backupEnabled, backupConflict, backupPassphrase, remoteBackup, user?.id, onlineRevision]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const activeMeta = CATEGORY_META[activeCategory];
 const categories = useMemo(
   () =>
     categoryOrder.map((key) => ({
       key,
       label: CATEGORY_META[key].label,
       count: getCategoryEntries(vault, key).length,
       Icon: CATEGORY_META[key].icon,
     })),
   [vault]
 );

  const updateFormField = (fieldKey: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const handleCategoryChange = (category: CategoryKey) => {
    setActiveCategory(category);
    setFormValues(makeEmptyFormForCategory(category));
  };

  const addEntry = () => {
    const nextItem = { id: crypto.randomUUID(), ...Object.fromEntries(Object.entries(formValues).map(([key, value]) => [key, value.trim()])) };

    setVault((prev) => ({
      ...prev,
      vault: {
        ...prev.vault,
        [activeCategory]: [...(prev.vault[activeCategory] ?? []), nextItem],
      },
    }));
    setFormValues(makeEmptyFormForCategory(activeCategory));
  };

  const removeEntry = (category: CategoryKey, itemId: string) => {
    setVault((prev) => ({
      ...prev,
      vault: {
        ...prev.vault,
        [category]: (prev.vault[category] ?? []).filter((item) => getEntryId(item, '') !== itemId),
      },
    }));
  };

  const copySensitiveValue = async (value: string) => {
    if (!value || !window.multiVaultAPI) return;

    try {
      await window.multiVaultAPI.copyToClipboard(value, 30);
      setToast('Copied! Will clear in 30s');
    } catch {
      setToast('Copy failed');
    }
  };

  const toggleVisibility = (key: string) => {
    setShowSensitive((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSetPin = () => {
    if (!/^\d{4}$/.test(pinInput)) {
      setShowPinError(true);
      return;
    }
    const nextVault = { ...vault, pin: pinInput };
    setVault(nextVault);
    setPinInput('');
    setIsSettingPin(false);
    setIsAuthenticated(true);
    setShowPinError(false);
    setToast('PIN set successfully!');
  };

  const handleVerifyPin = () => {
    if (!vault.pin) return;
    if (pinInput === vault.pin) {
      setIsAuthenticated(true);
      setPinInput('');
      setShowPinError(false);
      setToast('Authenticated!');
    } else {
      setShowPinError(true);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPinInput('');
    setShowPinError(false);
  };

  const renderFormField = (field: FormField) => {
    const commonClasses = 'w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

    if (field.type === 'textarea') {
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="label">{field.label}</label>
          <textarea
            value={formValues[field.key] ?? ''}
            onChange={(event) => updateFormField(field.key, event.target.value)}
            className={`${commonClasses} min-h-[80px] resize-y`}
            placeholder={field.label}
          />
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-1.5">
        <label className="label">{field.label}</label>
        <input
          type={field.type ?? 'text'}
          value={formValues[field.key] ?? ''}
          onChange={(event) => updateFormField(field.key, event.target.value)}
          className={commonClasses}
          placeholder={field.label}
        />
      </div>
    );
  };

  const rememberPassphrase = async (passphrase: string) => {
    if (!window.multiVaultAPI || !user?.id) return;
    if (rememberBackupSecret) {
      await window.multiVaultAPI.saveBackupSecret(user.id, passphrase);
    } else {
      await window.multiVaultAPI.clearBackupSecret(user.id);
    }
  };

  const handleEnableVaultBackup = async () => {
    setBackupError('');
    setBackupStatus('');
    if (!user?.id || !supabase) {
      setBackupError('Sign in and configure Supabase before enabling encrypted Vault backup.');
      return;
    }
    if (!window.multiVaultAPI) {
      setBackupError('Encrypted Vault backup is currently supported in the desktop app only.');
      return;
    }
    if (backupPassphrase.trim().length < 16 || backupPassphrase.length > MAX_BACKUP_PASSPHRASE_LENGTH) {
      setBackupError('Use a recovery passphrase between 16 and 1024 characters.');
      return;
    }

    setBackupBusy(true);
    try {
      const remote = await loadRemoteVaultBackup(user.id);
      setRemoteBackup(remote);
      if (remote) {
        let cloudData: VaultBackupData;
        try {
          cloudData = await decryptVaultBackup(remote.encryptedPayload, backupPassphrase, user.id);
        } catch (error) {
          setCanReplaceLockedBackup(!isVaultEmpty(vault));
          throw error;
        }
        setCanReplaceLockedBackup(false);
        if (isVaultEmpty(vault)) {
          setVault({ ...normalizeVaultData(cloudData), pin: vault.pin });
          setIsSettingPin(!vault.pin);
          setIsAuthenticated(Boolean(vault.pin));
          await rememberPassphrase(backupPassphrase);
          setBackupEnabled(true);
          setBackupConflict(false);
          setCloudCandidate(null);
          setBackupStatus(vault.pin
            ? 'The encrypted cloud Vault was restored. Your existing local PIN is unchanged.'
            : 'Vault records restored. Set a new local PIN to protect this device.');
        } else if (JSON.stringify(cloudData.vault) === JSON.stringify(vault.vault)) {
          await rememberPassphrase(backupPassphrase);
          setBackupEnabled(true);
          setBackupConflict(false);
          setBackupStatus('This desktop matches the encrypted cloud copy. Silent backup is enabled.');
        } else {
          setCloudCandidate(cloudData);
          setBackupConflict(true);
          setBackupStatus('This desktop and the cloud backup differ. Choose which copy to keep before syncing.');
        }
      } else {
        if (backupPassphrase !== backupPassphraseConfirmation) {
          setBackupError('The recovery passphrases do not match.');
          return;
        }
        await rememberPassphrase(backupPassphrase);
        setBackupEnabled(true);
        setBackupConflict(false);
        setBackupStatus('Encrypted backup enabled. This desktop’s existing Vault records will be uploaded.');
      }
    } catch (error) {
      console.error('Unable to enable the encrypted Vault backup.', error);
      setBackupError(error instanceof Error && /decrypt|passphrase|invalid|unsupported/i.test(error.message)
        ? 'That recovery passphrase could not unlock the cloud backup. Check it and try again.'
        : 'Encrypted backup could not be enabled. Check your connection and secure storage, then try again.');
    } finally {
      setBackupBusy(false);
    }
  };

  const resolveVaultConflict = async (choice: 'restore-cloud' | 'replace-cloud') => {
    if (!user?.id || !cloudCandidate) return;
    setBackupBusy(true);
    setBackupError('');
    try {
      if (choice === 'restore-cloud') {
        setVault({ ...normalizeVaultData(cloudCandidate), pin: vault.pin });
        setIsSettingPin(!vault.pin);
        setIsAuthenticated(Boolean(vault.pin));
        setBackupStatus(vault.pin
          ? 'Cloud Vault restored. Your existing local PIN is unchanged.'
          : 'Cloud Vault restored. Set a local PIN to protect this device.');
      } else {
        setBackupStatus('The current desktop Vault will replace the cloud copy.');
      }
      await rememberPassphrase(backupPassphrase);
      setCloudCandidate(null);
      setBackupConflict(false);
      setBackupEnabled(true);
    } catch (error) {
      console.error('Unable to save the Vault recovery passphrase securely.', error);
      setBackupError('The recovery passphrase could not be remembered securely on this device. Choose not to remember it or try again.');
    } finally {
      setBackupBusy(false);
    }
  };

  const replaceLockedCloudBackup = async () => {
    if (!isAuthenticated || !user?.id || !remoteBackup || isVaultEmpty(vault)
      || backupPassphrase.trim().length < 16) return;
    if (backupPassphrase !== backupPassphraseConfirmation) {
      setBackupError('The recovery passphrases do not match.');
      return;
    }
    setBackupBusy(true);
    setBackupError('');
    try {
      await rememberPassphrase(backupPassphrase);
      setCanReplaceLockedBackup(false);
      setBackupEnabled(true);
      setBackupStatus('The current desktop Vault will replace the inaccessible cloud backup.');
    } catch (error) {
      console.error('Unable to save the Vault recovery passphrase securely.', error);
      setBackupError('The recovery passphrase could not be remembered securely on this device. Choose not to remember it or try again.');
    } finally {
      setBackupBusy(false);
    }
  };

  const backupControls = (
    <section className="card space-y-3 p-4" aria-labelledby="vault-backup-title">
      <div>
        <h2 id="vault-backup-title" className="font-semibold text-ink-900">Encrypted online backup</h2>
        <p className="mt-1 text-sm leading-5 text-ink-600">
          Your existing 4-digit PIN stays as this desktop’s local lock. A separate recovery passphrase encrypts the backup before upload; CGP never stores that passphrase or uploads your PIN.
        </p>
        <p className="mt-1 text-xs leading-5 text-ink-600">
          Use at least 16 characters and keep the recovery passphrase safe. If it is lost, the cloud copy cannot be decrypted.
        </p>
      </div>
      <label className="block">
        <span className="label">Recovery passphrase</span>
        <input
          type="password"
          className="input"
          autoComplete="new-password"
          value={backupPassphrase}
          maxLength={MAX_BACKUP_PASSPHRASE_LENGTH}
          onChange={(event) => setBackupPassphrase(event.target.value)}
          aria-describedby="vault-backup-passphrase-help"
        />
      </label>
      {(!remoteBackup || canReplaceLockedBackup) && (
        <label className="block">
          <span className="label">Confirm recovery passphrase</span>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={backupPassphraseConfirmation}
            maxLength={MAX_BACKUP_PASSPHRASE_LENGTH}
            onChange={(event) => setBackupPassphraseConfirmation(event.target.value)}
          />
        </label>
      )}
      <p id="vault-backup-passphrase-help" className="text-xs text-ink-600">
        Enter the same passphrase on another desktop to restore this Vault.
      </p>
      <label className="flex items-start gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={rememberBackupSecret}
          onChange={(event) => setRememberBackupSecret(event.target.checked)}
        />
        Remember on this desktop using OS secure storage for silent backup
      </label>
      <button
        type="button"
        className="btn-secondary"
        disabled={backupBusy || !backupPassphrase}
        onClick={() => void handleEnableVaultBackup()}
      >
        {backupBusy ? 'Checking backup…' : remoteBackup ? 'Unlock or compare cloud backup' : 'Enable encrypted backup'}
      </button>
      {backupStatus && <p role="status" className="text-sm text-ink-700">{backupStatus}</p>}
      {backupError && <p role="alert" className="text-sm text-error-700">{backupError}</p>}
      {canReplaceLockedBackup && !backupConflict && (
        <button
          type="button"
          className="btn-secondary"
          disabled={!isAuthenticated || backupBusy || backupPassphrase.trim().length < 16}
          onClick={() => void replaceLockedCloudBackup()}
        >
          Replace inaccessible cloud copy with this desktop’s Vault
        </button>
      )}
      {backupConflict && cloudCandidate && (
        <div className="space-y-2 rounded-lg border border-warning-300 bg-warning-50 p-3">
          <p className="text-sm font-medium text-warning-900">The current desktop and cloud copies contain different records. Select one to keep; no copy has been overwritten.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={backupBusy} onClick={() => void resolveVaultConflict('restore-cloud')}>Restore cloud copy to this desktop</button>
            <button type="button" className="btn-secondary" disabled={backupBusy} onClick={() => void resolveVaultConflict('replace-cloud')}>Replace cloud copy with this desktop</button>
          </div>
        </div>
      )}
    </section>
  );

  if (!isAuthenticated && vault.pin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 p-4">
        <div className="w-full max-w-sm">
          <div className="card p-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-primary-600"><Lock className="h-8 w-8" /></div>
            <h1 className="text-2xl font-display font-black text-ink-900">Vault Locked</h1>
            <p className="mt-2 text-sm text-ink-600">Enter your 4-digit PIN to access the vault</p>
            <div className="mt-6 space-y-4">
              <input type="password" value={pinInput} onChange={(event) => { setPinInput(event.target.value.replace(/\D/g, '').slice(0, 4)); setShowPinError(false); }} onKeyDown={(event) => event.key === 'Enter' && handleVerifyPin()} placeholder="Enter PIN" inputMode="numeric" maxLength={4} autoFocus className={`w-full rounded-lg border px-4 py-3 text-center text-lg tracking-widest font-mono focus:outline-none focus:ring-2 ${showPinError ? 'border-error-500 focus:ring-error-500/20 bg-error-50' : 'border-ink-200 focus:ring-primary-500/20 focus:border-primary-500'}`} />
              {showPinError && <p className="text-sm text-error-600 font-medium">Incorrect PIN</p>}
              <button onClick={handleVerifyPin} className="btn-primary w-full">Unlock</button>
            </div>
          </div>
          {remoteBackup && <div className="mt-4">{backupControls}</div>}
        </div>
      </div>
    );
  }

  if (!vault.pin && isSettingPin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 p-4">
        <div className="w-full max-w-sm">
          <div className="card p-8">
            <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-primary-100 p-2 text-primary-600"><ShieldCheck className="h-6 w-6" /></div><div><p className="text-xs uppercase tracking-[0.2em] text-primary-600 font-bold">First time setup</p><h1 className="text-xl font-display font-black text-ink-900">Set Your 4-Digit PIN</h1></div></div>
            <p className="text-sm text-ink-600 mb-6">Create a permanent 4-digit PIN to protect your vault. You will need it every time you unlock the vault.</p>
            <div className="space-y-4">
              <input type="password" value={pinInput} onChange={(event) => { setPinInput(event.target.value.replace(/\D/g, '').slice(0, 4)); setShowPinError(false); }} onKeyDown={(event) => event.key === 'Enter' && handleSetPin()} placeholder="Create 4-digit PIN" inputMode="numeric" maxLength={4} autoFocus className={`w-full rounded-lg border px-4 py-3 focus:outline-none focus:ring-2 ${showPinError ? 'border-error-500 focus:ring-error-500/20 bg-error-50' : 'border-ink-200 focus:ring-primary-500/20 focus:border-primary-500'}`} />
              {showPinError && <p className="text-sm text-error-600 font-medium">PIN must contain exactly 4 digits</p>}
              <button onClick={handleSetPin} className="btn-primary w-full">Set PIN</button>
            </div>
          </div>
          {remoteBackup && <div className="mt-4">{backupControls}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-xl bg-white/10 p-2">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex items-center gap-2">
            {vault.pin && <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm"><Lock className="h-4 w-4 text-primary-200" /><span className="text-primary-100">PIN Protected</span></div>}
            <button onClick={handleLogout} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20 transition text-sm"><LogOut className="h-4 w-4" /><span>Logout</span></button>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary-100">Encrypted vault</p>
            <h1 className="mt-1 text-3xl font-display font-black">Secure storage manager</h1>
          </div>
        </div>
      </header>

      {window.multiVaultAPI && backupControls}

      <div className="card p-3">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          {categories.map(({ key, label, count, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleCategoryChange(key)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                activeCategory === key
                  ? 'border-primary-600 bg-primary-50 text-primary-700 shadow-sm'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
              <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">{count}</span>
            </button>
          ))}
          {!vault.pin && <button onClick={() => setIsSettingPin(true)} className="btn-secondary text-xs"><Lock className="h-3 w-3" />Set PIN Protection</button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-ink-500">New item</p>
              <h2 className="mt-1 text-xl font-display font-bold text-ink-900">{activeMeta.label}</h2>
            </div>
            <div className="rounded-xl bg-primary-50 p-2 text-primary-700">
              <Lock className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-4">{activeMeta.fields.map((field) => renderFormField(field))}</div>

          <button type="button" onClick={addEntry} className="btn-primary mt-5 w-full">
            <Plus className="h-4 w-4" />
            Add entry
          </button>
        </section>

        <section className="space-y-4">
          {getCategoryEntries(vault, activeCategory).length === 0 ? (
            <div className="card flex min-h-[220px] items-center justify-center p-10 text-center">
              <div>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-bold text-ink-900">No saved entries yet</h3>
                <p className="mt-2 text-sm text-ink-500">Add a new record to store it securely in your local vault.</p>
              </div>
            </div>
          ) : (
            getCategoryEntries(vault, activeCategory).map((item, index) => {
              const entryId = getEntryId(item, `${activeCategory}-${index}`);
              const itemKey = `${activeCategory}-${entryId}`;
              const titleText = typeof item.title === 'string'
                ? item.title
                : typeof item.name === 'string'
                  ? item.name
                  : typeof item.key === 'string'
                    ? item.key
                    : 'Untitled item';

              return (
                <div key={entryId} className="card p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.16em] text-ink-500">Saved entry</div>
                      <h3 className="mt-1 text-lg font-display font-bold text-ink-900">
                        {titleText}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEntry(activeCategory, entryId)}
                      className="btn-ghost text-error-600 hover:bg-error-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {activeMeta.fields.map((field) => {
                      const rawValue = item[field.key];
                      const fieldKey = `${itemKey}-${field.key}`;
                      const shouldMask = Boolean(field.sensitive) && rawValue !== undefined && rawValue !== '';
                      const displayValue = shouldMask ? maskedValue(rawValue, Boolean(showSensitive[fieldKey])) : String(rawValue ?? '');

                      if (field.type === 'textarea') {
                        return (
                          <div key={field.key} className="md:col-span-2 space-y-1.5">
                            <label className="label">{field.label}</label>
                            <div className="flex items-start gap-2">
                              <div className="flex-1 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-800">
                                {displayValue || '—'}
                              </div>
                              {shouldMask && (
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => toggleVisibility(fieldKey)} className="btn-secondary px-2 py-2">
                                    {showSensitive[fieldKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                  <button type="button" onClick={() => copySensitiveValue(String(rawValue))} className="btn-secondary px-2 py-2">
                                    <Copy className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={field.key} className="space-y-1.5">
                          <label className="label">{field.label}</label>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-800">
                              {displayValue || '—'}
                            </div>
                            {shouldMask && (
                              <>
                                <button type="button" onClick={() => toggleVisibility(fieldKey)} className="btn-secondary px-2 py-2">
                                  {showSensitive[fieldKey] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                                <button type="button" onClick={() => copySensitiveValue(String(rawValue))} className="btn-secondary px-2 py-2">
                                  <Copy className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
