import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Calculator,
  ChevronDown,
  Cloud,
  FileText,
  Info,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import helpKnowledge from '@/help/knowledge.json';

const sectionIcons = {
  dashboard: TrendingUp,
  'semesters-courses': CalendarDays,
  'course-detail': FileText,
  grading: Calculator,
  analytics: TrendingUp,
  simulator: SlidersHorizontal,
  vault: ShieldCheck,
  'profile-settings': UserRound,
  'sign-in-sync': Cloud,
  platforms: MonitorSmartphone,
  privacy: LockKeyhole,
} as const;

export function HelpPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2"><Info className="h-6 w-6" /></div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary-100">Help Center</p>
            <h1 className="mt-1 font-display text-3xl font-black">CGP guide</h1>
            <p className="mt-2 text-sm text-primary-100">How to use your academic workspace, understand its calculations, and protect your data.</p>
          </div>
        </div>
      </header>

      <section aria-label="CGP help topics" className="space-y-3">
        {helpKnowledge.sections.map((section) => {
          const Icon = sectionIcons[section.id as keyof typeof sectionIcons] ?? BookOpen;
          return (
            <details key={section.id} className="group rounded-2xl border border-ink-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
                <div className="rounded-xl bg-primary-50 p-2 text-primary-700"><Icon className="h-5 w-5" /></div>
                <span className="flex-1">
                  <span className="block text-lg font-bold text-ink-900">{section.title}</span>
                  <span className="mt-1 block text-sm font-normal leading-6 text-ink-600">{section.description}</span>
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
              </summary>

              <div className="space-y-5 border-t border-ink-100 px-5 pb-5 pt-4">
                <ol className="space-y-2">
                  {section.steps.map((step, index) => (
                    <li key={`${section.id}-step-${index}`} className="flex items-start gap-3 rounded-xl bg-ink-50 p-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">{index + 1}</span>
                      <span className="text-sm leading-6 text-ink-700">{step}</span>
                    </li>
                  ))}
                </ol>

                <div className="space-y-2">
                  <h2 className="font-semibold text-ink-900">Frequently asked questions</h2>
                  {section.faqs.map((faq) => (
                    <details key={faq.id} className="rounded-xl border border-ink-100 px-4 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-ink-800">{faq.question}</summary>
                      <p className="pt-3 text-sm leading-6 text-ink-600">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </section>

      <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm" aria-labelledby="privacy-title">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary-700" />
          <div>
            <h2 id="privacy-title" className="font-display text-lg font-bold text-ink-900">Privacy at a glance</h2>
            <p className="mt-2 text-sm leading-6 text-ink-700">
              Academic records are loaded from and saved to CGP&apos;s configured Supabase project while you are signed in and connected. The web app does not maintain an offline-first academic-data cache. Course documents and Vault contents are not part of academic-record sync. Use your own account, sign out on shared devices, and do not give anyone your password.
            </p>
            <p className="mt-3 text-xs text-ink-500">
              Help content verified against app version {helpKnowledge.lastVerifiedAppVersion}.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-ink-50 p-3">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
          <p className="text-sm leading-6 text-ink-700">
            Loading a share link and importing its template require an internet connection in the web app.
          </p>
        </div>
      </section>
    </div>
  );
}
