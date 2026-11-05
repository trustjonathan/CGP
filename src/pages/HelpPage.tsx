import { ShieldCheck, Copy, Lock, FileText, ScrollText, BookOpen, Info, ArrowRight, ChevronDown } from 'lucide-react';

const sections = [
  {
    title: 'How this app works',
    icon: BookOpen,
    body:
      'This application helps you track semesters, course units, assessments, and CGPA targets. You can add semesters, enter course details, record assessment results, compare grade targets, and use the simulator to test different academic outcomes before final results are submitted.',
  },
  {
    title: 'Safe copying and sharing',
    icon: Copy,
    body:
      'To share this app safely, distribute the packaged desktop installer or copy the app folder without personal records. The app is designed to start blank on a new computer, so it does not carry over the previous user’s saved academic data. Before sending a copy, always confirm that no personal grade history or local files are attached to the installation.',
  },
  {
    title: 'Privacy policy',
    icon: Lock,
    body:
      'This app stores data locally on the device in browser local storage. It does not upload your personal academic records to a remote server by default. It is intended to keep each user’s records private and separate from other users. Don’t share your copy with someone else if it contains your personal course data.',
  },
  {
    title: 'Copyright and copy rights',
    icon: ScrollText,
    body:
      'The app design, code, branding, and package content are protected by copyright unless otherwise stated. You may install and use the app for personal academic planning, but you should not redistribute the original source code or packaged app as if it were your own work without permission. User-entered data belongs to the user who creates it and is not treated as a shared public dataset.',
  },
];

const checklist = [
  'Use the packaged installer instead of copying a previous user profile folder.',
  'Start the app on a new computer and confirm it opens with a blank dashboard.',
  'Do not copy user-specific local data, browser profile folders, or saved app storage files.',
  'Only share the app with its default blank state when you want a fresh setup.',
  'Keep your academic records private and back them up only on your own device or secure storage.',
];

export function HelpPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-primary-600 to-primary-800 p-6 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2">
            <Info className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary-100">Help Center</p>
            <h1 className="mt-1 text-3xl font-display font-black">How the app works</h1>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        {sections.map(({ title, icon: Icon, body }) => (
          <details key={title} className="group rounded-2xl border border-ink-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
              <div className="rounded-xl bg-primary-50 p-2 text-primary-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="flex-1 text-lg font-bold text-ink-900">{title}</h2>
              <ChevronDown className="h-5 w-5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
            </summary>
            <p className="border-t border-ink-100 px-5 pb-5 pt-4 text-sm leading-7 text-ink-700">{body}</p>
          </details>
        ))}
      </section>

      <details className="group rounded-2xl border border-ink-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="flex-1 text-xl font-bold text-ink-900">Safe copy checklist</h2>
          <ChevronDown className="h-5 w-5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-3 border-t border-ink-100 p-5">
          {checklist.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-xl bg-ink-50 p-3">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
              <p className="text-sm leading-6 text-ink-700">{item}</p>
            </div>
          ))}
        </div>
      </details>

      <details className="group rounded-2xl border border-ink-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
            <FileText className="h-5 w-5" />
          </div>
          <h2 className="flex-1 text-xl font-bold text-ink-900">User privacy and rights summary</h2>
          <ChevronDown className="h-5 w-5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-4 border-t border-ink-100 p-5 text-sm leading-7 text-ink-700">
          <p>
            The app is intended to protect user privacy by keeping academic data on the user’s own device. It is designed to open in a clean state when copied to another device, so no previous user’s records are loaded automatically.
          </p>
          <p>
            User-generated information, including semester data, course results, and performance targets, remains the property of the person who inputs it. The app does not claim ownership of personal academic records entered by a user.
          </p>
          <p>
            The application’s code, user interface, and packaging are intellectual property and are protected by copyright. You may share the installed app in a clean, blank form for personal or educational use, but you should not claim authorship or redistribute the original code as your own project.
          </p>
        </div>
      </details>
    </div>
  );
}
