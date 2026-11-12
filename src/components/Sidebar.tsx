import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { APP_VERSION } from '@/lib/appVersion';
import { useAuth } from '@/contexts/useAuth';
import { targetSummary } from '@/lib/gradingConfig';

const MIN_SIDEBAR_WIDTH = 224;
const MAX_SIDEBAR_WIDTH = 360;
const RELEASE_API_URL = 'https://api.github.com/repos/trustjonathan/CGP/releases/latest';

const primaryItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/semesters', label: 'Semesters & Courses', icon: BookOpen },
  { to: '/analytics', label: 'Analytics', icon: TrendingUp },
  { to: '/simulator', label: 'What-If Simulator', icon: SlidersHorizontal },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
];

const moreItems = [
  { to: '/documents', label: 'Rules & Documents', icon: FileText },
  { to: '/vault', label: 'Vault', icon: ShieldCheck },
  { to: '/setups', label: 'Setups', icon: Share2 },
  { to: '/settings/sync', label: 'Sync & storage', icon: RefreshCw },
  { to: '/help', label: 'Help & Privacy', icon: CircleHelp },
];

function isNewerVersion(candidate: string, current: string) {
  const candidateParts = candidate.replace(/^v/, '').split('.').map(Number);
  const currentParts = current.replace(/^v/, '').split('.').map(Number);
  if (candidateParts.length !== 3 || currentParts.length !== 3
    || [...candidateParts, ...currentParts].some((part) => !Number.isInteger(part))) return false;
  for (let index = 0; index < 3; index += 1) {
    if (candidateParts[index] !== currentParts[index]) return candidateParts[index] > currentParts[index];
  }
  return false;
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
  collapsed = false,
  onClick,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={({ isActive }) => `flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
        collapsed ? 'justify-center px-2' : 'gap-3 px-3'
      } ${isActive ? 'bg-primary-50 text-primary-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const resizing = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [university, setUniversity] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const { data, updateSettings, syncing, lastSyncedAt, syncError } = useAppData();
  const { user, signOut } = useAuth();
  const profileLabel = data.settings.profileName || 'Your profile';
  const targetLabel = targetSummary(data.settings);
  const moreIsActive = [...moreItems, ...primaryItems.slice(4)].some(({ to }) => location.pathname.startsWith(to))
    || location.pathname.startsWith('/share-setup')
    || location.pathname.startsWith('/import');
  const syncLabel = syncError
    ? 'Needs attention'
    : syncing
      ? 'Syncing now'
      : lastSyncedAt
        ? `Last synced ${new Date(lastSyncedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}`
        : 'Not synced yet';

  useEffect(() => {
    const resize = (event: PointerEvent) => {
      if (resizing.current) {
        setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, event.clientX)));
      }
    };
    const stopResizing = () => { resizing.current = false; };
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    return () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const checkForUpdates = async () => {
      try {
        const response = await fetch(RELEASE_API_URL, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 404) {
          setUpdateAvailable(false);
          return;
        }
        if (!response.ok) throw new Error(`Release check failed (HTTP ${response.status}).`);
        const release: unknown = await response.json();
        if (!release || typeof release !== 'object' || !('tag_name' in release)
          || typeof release.tag_name !== 'string'
          || !/^v?\d+\.\d+\.\d+$/.test(release.tag_name)) {
          throw new Error('GitHub returned an invalid latest release version.');
        }
        setUpdateAvailable(isNewerVersion(release.tag_name, APP_VERSION));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Unable to check for CGP app updates.', error);
      }
    };
    void checkForUpdates();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setMobileMoreOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

  const openProfileEditor = () => {
    setProfileName(data.settings.profileName || '');
    setUniversity(data.settings.university || '');
    setProfileMenuOpen(false);
    setProfileEditOpen(true);
  };

  const saveProfile = () => {
    updateSettings({ profileName: profileName.trim(), university: university.trim() });
    setProfileEditOpen(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError('');
    try {
      const error = await signOut();
      if (error) setSignOutError(error);
    } catch (error) {
      console.error('Unable to sign out.', error);
      setSignOutError('Sign out failed. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const changePicture = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateSettings({ profilePicture: String(reader.result) });
    reader.onerror = () => console.error('Unable to read the selected profile picture.', reader.error);
    reader.readAsDataURL(file);
  };

  const openProfileMenu = () => setProfileMenuOpen(true);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-ink-200 bg-white px-4 lg:hidden">
        <Link to="/dashboard" className="flex items-center gap-2" aria-label="CGP dashboard">
          <img src="/cgp-mark.svg" alt="" className="h-8 w-8 rounded-lg shadow-sm" />
          <span className="font-display font-bold tracking-tight text-ink-900">CGP</span>
        </Link>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800"
          aria-label={`Edit target: ${targetLabel}`}
        >
          Target: {targetLabel}
        </button>
      </header>

      <aside
        style={{ '--sidebar-width': `${collapsed ? 72 : sidebarWidth}px` } as CSSProperties}
        className="fixed left-0 top-0 z-40 hidden h-screen flex-col overflow-hidden border-r border-ink-200 bg-white lg:flex lg:w-[var(--sidebar-width)]"
      >
        <div className={`flex h-16 shrink-0 items-center gap-3 border-b border-ink-100 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
          <img src="/cgp-mark.svg" alt="" className="h-9 w-9 rounded-xl shadow-sm" />
          {!collapsed && <div className="min-w-0 flex-1">
            <div className="font-display text-base font-bold leading-tight tracking-tight text-ink-900">CGP</div>
            <div className="text-[10px] font-semibold tracking-[0.14em] text-ink-400">ACADEMIC SUITE</div>
          </div>}
          <button
            type="button"
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className={`mx-3 mt-3 flex shrink-0 items-center rounded-xl bg-primary-50 text-primary-800 hover:bg-primary-100 ${collapsed ? 'justify-center p-3' : 'gap-2 px-3 py-2'}`}
          title={`Target: ${targetLabel}`}
          aria-label={`Edit target: ${targetLabel}`}
        >
          <Target className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate text-sm font-semibold">Target: {targetLabel}</span>}
        </button>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          {primaryItems.map((item) => <SidebarLink key={item.to} {...item} collapsed={collapsed} />)}
          <button
            type="button"
            onClick={() => setMoreExpanded((value) => !value)}
            className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            } ${moreIsActive ? 'bg-primary-50 text-primary-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}`}
            aria-expanded={moreExpanded}
            aria-controls="sidebar-more-links"
            title={collapsed ? 'More' : undefined}
          >
            <MoreHorizontal className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {!collapsed && <><span className="flex-1 text-left">More</span><ChevronRight className={`h-4 w-4 transition-transform ${moreExpanded ? 'rotate-90' : ''}`} aria-hidden="true" /></>}
          </button>
          {moreExpanded && <div id="sidebar-more-links" className={collapsed ? 'space-y-1' : 'ml-3 space-y-1 border-l border-ink-200 pl-3'}>
            {moreItems.map((item) => <SidebarLink key={item.to} {...item} collapsed={collapsed} />)}
          </div>}
        </nav>

        <div className={`shrink-0 space-y-2 border-t border-ink-100 p-3 ${collapsed ? 'px-2' : ''}`}>
          {signOutError && !collapsed && <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700">{signOutError}</p>}
          <button
            type="button"
            onClick={openProfileMenu}
            className={`flex w-full items-center rounded-xl border border-ink-200 p-2.5 text-left transition-colors hover:bg-ink-50 ${
              collapsed ? 'justify-center' : 'gap-3'
            }`}
            aria-label="Open profile menu"
          >
            {data.settings.profilePicture
              ? <img src={data.settings.profilePicture} alt="" className="h-9 w-9 rounded-full object-cover" />
              : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700"><UserRound className="h-5 w-5" aria-hidden="true" /></span>}
            {!collapsed && <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">{profileLabel}</span>
              <span className="block truncate text-xs text-ink-400">{data.settings.university || 'Add university'}</span>
            </span>}
          </button>
        </div>
        <div
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={collapsed ? -1 : 0}
          onPointerDown={(event) => {
            if (event.button !== 0 || collapsed) return;
            resizing.current = true;
            event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              setSidebarWidth((value) => Math.max(MIN_SIDEBAR_WIDTH, value - 16));
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              setSidebarWidth((value) => Math.min(MAX_SIDEBAR_WIDTH, value + 16));
            }
          }}
          className="absolute right-0 top-0 hidden h-full w-1 cursor-col-resize touch-none hover:bg-primary-300 focus-visible:bg-primary-500 lg:block"
        />
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        <nav className="grid h-16 grid-cols-5" aria-label="Mobile navigation">
          {primaryItems.slice(0, 4).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              aria-label={label}
              className={({ isActive }) => `flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${
                isActive ? 'text-primary-700' : 'text-ink-500'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label === 'Semesters & Courses' ? 'Courses' : label === 'What-If Simulator' ? 'Simulator' : label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMobileMoreOpen((value) => !value)}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${
              mobileMoreOpen || moreIsActive ? 'text-primary-700' : 'text-ink-500'
            }`}
            aria-expanded={mobileMoreOpen}
            aria-controls="mobile-more-menu"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            More
          </button>
        </nav>
      </div>

      {mobileMoreOpen && (
        <div id="mobile-more-menu" className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-3 shadow-xl lg:hidden">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="font-display font-semibold text-ink-900">More</h2>
            <button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Close More menu" className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"><X className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={() => { setMobileMoreOpen(false); navigate('/settings'); }} className="mb-2 flex w-full items-center gap-3 rounded-lg bg-primary-50 px-3 py-2.5 text-left text-sm font-semibold text-primary-800">
            <Target className="h-[18px] w-[18px]" aria-hidden="true" /> Target: {targetLabel}
          </button>
          <nav className="space-y-1" aria-label="More navigation">
            {primaryItems.slice(4).map((item) => <SidebarLink key={item.to} {...item} onClick={() => setMobileMoreOpen(false)} />)}
            {moreItems.map((item) => <SidebarLink key={item.to} {...item} onClick={() => setMobileMoreOpen(false)} />)}
          </nav>
          <button type="button" onClick={openProfileMenu} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-ink-200 p-2.5 text-left">
            {data.settings.profilePicture
              ? <img src={data.settings.profilePicture} alt="" className="h-9 w-9 rounded-full object-cover" />
              : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700"><UserRound className="h-5 w-5" aria-hidden="true" /></span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">{profileLabel}</span>
              <span className="block truncate text-xs text-ink-400">{data.settings.university || 'Add university'}</span>
            </span>
          </button>
        </div>
      )}

      {profileMenuOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/40 p-4" onClick={() => setProfileMenuOpen(false)}>
          <section className="w-full max-w-sm rounded-2xl border border-ink-200 bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="profile-menu-title" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="profile-menu-title" className="font-display font-semibold text-ink-900">{profileLabel}</h2>
                <p className="truncate text-sm text-ink-500">{user?.email}</p>
              </div>
              <button type="button" onClick={() => setProfileMenuOpen(false)} aria-label="Close profile menu" className="rounded-lg p-1 text-ink-400 hover:bg-ink-100"><X className="h-5 w-5" /></button>
            </div>
            {signOutError && <p role="alert" className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700">{signOutError}</p>}
            <div className="space-y-1">
              <button type="button" onClick={openProfileEditor} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50"><Pencil className="h-4 w-4" /> Edit profile</button>
              <Link to="/releases" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
                <Download className="h-4 w-4" /> App updates
                {updateAvailable && <span className="h-2 w-2 rounded-full bg-primary-600" aria-label="Update available" />}
              </Link>
              <Link to="/settings/sync" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-700 hover:bg-ink-50">
                <RefreshCw className="h-4 w-4" />
                <span className="min-w-0 flex-1">Sync status</span>
                <span className={`max-w-40 truncate text-xs ${syncError ? 'text-error-700' : 'text-ink-500'}`}>{syncLabel}</span>
              </Link>
              <button type="button" onClick={() => navigate('/settings')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50"><Settings className="h-4 w-4" /> Settings</button>
              <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-error-700 hover:bg-error-50 disabled:opacity-50">
                <LogOut className="h-4 w-4" /> {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </section>
        </div>
      )}

      {profileEditOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-950/40 p-4" onClick={() => setProfileEditOpen(false)}>
          <section className="w-full max-w-sm rounded-xl border border-ink-200 bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 id="profile-edit-title" className="font-display font-semibold text-ink-900">Edit profile</h2>
              <button type="button" onClick={() => setProfileEditOpen(false)} aria-label="Close profile editor" className="rounded-lg p-1 text-ink-400 hover:bg-ink-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="btn-secondary cursor-pointer text-sm"><UserRound className="h-4 w-4" /> Choose picture<input type="file" accept="image/*" className="sr-only" onChange={(event) => changePicture(event.target.files?.[0])} /></label>
                {data.settings.profilePicture && <img src={data.settings.profilePicture} alt="Profile preview" className="h-12 w-12 rounded-full object-cover" />}
              </div>
              <div><label className="label" htmlFor="profile-name">Your name</label><input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} className="input" placeholder="e.g. Alex" /></div>
              <div><label className="label" htmlFor="profile-university">University</label><input id="profile-university" value={university} onChange={(event) => setUniversity(event.target.value)} className="input" placeholder="e.g. Makerere University" /></div>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setProfileEditOpen(false)} className="btn-secondary">Cancel</button><button type="button" onClick={saveProfile} className="btn-primary">Save profile</button></div>
            </div>
          </section>
        </div>
      )}

      <div className="hidden shrink-0 lg:block" style={{ width: collapsed ? 72 : sidebarWidth }} />
    </>
  );
}
