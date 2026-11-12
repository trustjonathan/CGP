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
  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT);
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
      setIsReady(false);
      setIsAuthenticated(false);
      if (!window.multiVaultAPI) {
        setIsSettingPin(true);
        setIsReady(true);
        return;
      }

      try {
        const savedVault = await window.multiVaultAPI.loadVault();
        const normalizedVault = normalizeVaultData(savedVault);
        if (!active) return;
        setVault(normalizedVault);
        setIsSettingPin(!normalizedVault.pin);
      } catch (error) {
        if (active) {
          console.error('Unable to load the local Vault.', error);
          setVault(EMPTY_VAULT);
          setIsSettingPin(true);
        }
      } finally {
        if (active) setIsReady(true);
      }
    };

    void loadVault();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isReady || !window.multiVaultAPI) return;

    const timeoutId = window.setTimeout(() => {
      void window.multiVaultAPI!.saveVault(vault).catch(() => undefined);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [vault, isReady]);

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
