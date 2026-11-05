import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  TrendingUp,
  SlidersHorizontal,
  Menu,
  X,
  Target,
  CircleHelp,
  UserRound,
  Clock3,
  Pencil,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { useAuth } from '@/contexts/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/semesters', label: 'Semesters & Courses', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: TrendingUp },
  { to: '/simulator', label: 'What-If Simulator', icon: SlidersHorizontal },
  { to: '/vault', label: 'Vault', icon: ShieldCheck },
  { to: '/help', label: 'Help & Privacy', icon: CircleHelp },
];

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const { data, updateSettings } = useAppData();
  const [profileName, setProfileName] = useState(data.settings.profileName || '');
  const [university, setUniversity] = useState(data.settings.university || '');
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const { user, signOut } = useAuth();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const saveProfile = () => {
    updateSettings({ profileName: profileName.trim(), university: university.trim() });
    setProfileOpen(false);
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
    reader.readAsDataURL(file);
  };

  const profileLabel = data.settings.profileName || 'Personalize profile';
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b border-ink-200 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/cgp-mark.svg" alt="" className="w-8 h-8 rounded-lg shadow-sm" />
          <span className="font-display font-bold tracking-tight text-ink-900">CGP</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-ink-600 hover:bg-ink-100"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-ink-950/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 overflow-y-auto overscroll-contain bg-white border-r border-ink-200 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 shrink-0 flex items-center gap-3 px-5 border-b border-ink-100">
          <img src="/cgp-mark.svg" alt="" className="w-9 h-9 rounded-xl shadow-sm" />
          <div className="min-w-0">
            <div className="font-display font-bold tracking-tight text-ink-900 text-base leading-tight">
              CGP
            </div>
            <div className="text-[10px] font-semibold tracking-[0.14em] text-ink-400">ACADEMIC SUITE</div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto lg:hidden p-1.5 rounded-lg text-ink-400 hover:bg-ink-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-3 pb-4 space-y-3">
          {signOutError && <p role="alert" className="rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700">{signOutError}</p>}
          <div className="flex items-center gap-2 px-1">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-400">Signed in</span>
              <span className="block truncate text-xs text-ink-600">{user?.email}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span>{signingOut ? 'Signing out' : 'Sign out'}</span>
            </button>
          </div>
          <button onClick={() => setProfileOpen(true)} className="w-full flex items-center gap-3 rounded-xl border border-ink-200 p-3 text-left hover:bg-ink-50 transition-colors">
            {data.settings.profilePicture ? <img src={data.settings.profilePicture} alt="Profile" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center"><UserRound className="w-5 h-5" /></div>}
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink-900 truncate">{profileLabel}</span><span className="block text-xs text-ink-400 truncate">{data.settings.university || 'Add university'}</span></span>
            <Pencil className="w-4 h-4 text-ink-400" />
          </button>
          <div className="rounded-xl bg-ink-50 border border-ink-100 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-700"><Clock3 className="w-3.5 h-3.5 text-primary-600" />{now.toLocaleDateString(undefined, { weekday: 'long' })}</div>
            <div className="font-display font-bold text-lg text-ink-900 mt-1">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-xs text-ink-500">{now.toLocaleDateString()}</div>
          </div>
          <div className="rounded-xl border border-ink-200 p-3">
            <div className="flex items-center justify-between mb-2"><span className="text-xs font-semibold text-ink-700">{monthLabel}</span><CalendarDays className="w-3.5 h-3.5 text-primary-600" /></div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-ink-400 mb-1">{['S','M','T','W','T','F','S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px]">{Array.from({ length: firstDay }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: monthDays }, (_, index) => { const day = index + 1; return <span key={day} className={`py-0.5 rounded ${day === now.getDate() ? 'bg-primary-600 text-white font-bold' : 'text-ink-600'}`}>{day}</span>; })}</div>
          </div>
        </div>

        {/* Target widget */}
        <div className="px-3 pb-4">
          <div className="rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide opacity-90">
                Target CGPA
              </span>
            </div>
            <div className="font-display font-bold text-3xl">5.00</div>
            <div className="text-xs opacity-80 mt-1">On a 5.0 grading scale</div>
          </div>
        </div>
      </aside>

      {profileOpen && (
        <div className="fixed inset-0 z-[60] bg-ink-950/40 flex items-center justify-center p-4" onClick={() => setProfileOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white border border-ink-200 shadow-xl p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h2 className="font-display font-semibold text-ink-900">Personalize your profile</h2><button onClick={() => setProfileOpen(false)} className="p-1 text-ink-400 hover:text-ink-700"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div className="flex items-center gap-3"><label className="btn-secondary text-sm cursor-pointer"><UserRound className="w-4 h-4" /> Choose picture<input type="file" accept="image/*" className="sr-only" onChange={(event) => changePicture(event.target.files?.[0])} /></label>{data.settings.profilePicture && <img src={data.settings.profilePicture} alt="Profile preview" className="w-12 h-12 rounded-full object-cover" />}</div>
              <div><label className="label">Your name</label><input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="input" placeholder="e.g. Alex" /></div>
              <div><label className="label">University</label><input value={university} onChange={(event) => setUniversity(event.target.value)} className="input" placeholder="e.g. Makerere University" /></div>
              <div className="flex justify-end gap-2"><button onClick={() => setProfileOpen(false)} className="btn-secondary">Cancel</button><button onClick={saveProfile} className="btn-primary">Save Profile</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Spacer for desktop */}
      <div className="hidden lg:block w-64 flex-shrink-0" />
    </>
  );
}
