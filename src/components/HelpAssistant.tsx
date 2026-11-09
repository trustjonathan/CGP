import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, CircleHelp, ExternalLink, MessageCircleQuestion, Search, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAppData } from '@/lib/useAppData';
import { platformAdapter } from '@/lib/platformAdapter';
import { supabase } from '@/lib/supabase';
import helpKnowledge from '@/help/knowledge.json';

interface HelpFaq {
  id: string;
  question: string;
  answer: string;
  routes: string[];
}

const faqs = helpKnowledge.sections.flatMap((section) => section.faqs) as HelpFaq[];
const HELP_WIDGET_POSITION_KEY = 'cgp-help-widget-position-v1';

interface HelpWidgetPosition {
  left: number;
  top: number;
}

interface HelpWidgetDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  moved: boolean;
}

function clampHelpWidgetPosition(position: HelpWidgetPosition, element: HTMLElement): HelpWidgetPosition {
  const maxLeft = Math.max(8, window.innerWidth - element.offsetWidth - 8);
  const maxTop = Math.max(8, window.innerHeight - element.offsetHeight - 8);
  return {
    left: Math.max(8, Math.min(maxLeft, position.left)),
    top: Math.max(8, Math.min(maxTop, position.top)),
  };
}

function saveHelpWidgetPosition(position: HelpWidgetPosition) {
  try {
    window.localStorage.setItem(HELP_WIDGET_POSITION_KEY, JSON.stringify(position));
  } catch (error) {
    console.error('Unable to save the CGP Help button position.', error);
  }
}

function routeMatches(route: string, pathname: string) {
  if (route === '/') return pathname === '/';
  if (route.includes(':id')) return pathname.startsWith(route.slice(0, route.indexOf(':id')));
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function HelpAssistant() {
  const { pathname } = useLocation();
  const { data, loadError, loading } = useAppData();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [question, setQuestion] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [answer, setAnswer] = useState('');
  const [answerId, setAnswerId] = useState('');
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [widgetPosition, setWidgetPosition] = useState<HelpWidgetPosition | null>(null);
  const [draggingWidget, setDraggingWidget] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const widgetPositionRef = useRef<HelpWidgetPosition | null>(null);
  const widgetDragRef = useRef<HelpWidgetDrag | null>(null);
  const suppressWidgetClickRef = useRef(false);
  const updateWidgetPosition = useCallback((position: HelpWidgetPosition | null) => {
    widgetPositionRef.current = position;
    setWidgetPosition(position);
  }, []);

  const suggestions = useMemo(() => {
    const matches = faqs.filter((faq) => faq.routes.some((route) => routeMatches(route, pathname)));
    return (matches.length ? matches : faqs).slice(0, 3);
  }, [pathname]);

  const filteredFaqs = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? faqs.filter((faq) => `${faq.question} ${faq.answer}`.toLocaleLowerCase().includes(search)) : faqs;
  }, [query]);

  const courseForAssessment = data.courses.find((course) => !(course.assessments ?? []).length) ?? data.courses[0];
  const checklist = [
    { title: 'Create a semester', done: data.semesters.length > 0, to: '/semesters' },
    { title: 'Add a course unit', done: data.courses.length > 0, to: '/semesters' },
    { title: 'Add course topics', done: data.courses.some((course) => (course.topics ?? []).length > 0), to: '/semesters' },
    {
      title: 'Add an assessment',
      done: data.courses.some((course) => (course.assessments ?? []).length > 0),
      to: courseForAssessment ? `/course/${courseForAssessment.id}` : '/semesters',
    },
  ];

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HELP_WIDGET_POSITION_KEY);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object') throw new Error('Saved position has an invalid format.');
      const candidate = parsed as Record<string, unknown>;
      if (typeof candidate.left !== 'number' || !Number.isFinite(candidate.left)
        || typeof candidate.top !== 'number' || !Number.isFinite(candidate.top)) {
        throw new Error('Saved position coordinates are invalid.');
      }
      const button = triggerRef.current;
      if (!button) return;
      const position = clampHelpWidgetPosition({ left: candidate.left, top: candidate.top }, button);
      updateWidgetPosition(position);
      saveHelpWidgetPosition(position);
    } catch (error) {
      console.error('Unable to restore the CGP Help button position.', error);
    }
  }, [updateWidgetPosition]);

  useEffect(() => {
    const clampCurrentPosition = () => {
      const position = widgetPositionRef.current;
      const button = triggerRef.current;
      if (!position || !button) return;
      const next = clampHelpWidgetPosition(position, button);
      if (next.left !== position.left || next.top !== position.top) {
        updateWidgetPosition(next);
        saveHelpWidgetPosition(next);
      }
    };
    window.addEventListener('resize', clampCurrentPosition);
    return () => window.removeEventListener('resize', clampCurrentPosition);
  }, [updateWidgetPosition]);

  const handleWidgetPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    widgetDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleWidgetPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = widgetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    setDraggingWidget(true);
    event.preventDefault();
    updateWidgetPosition(clampHelpWidgetPosition({
      left: drag.startLeft + deltaX,
      top: drag.startTop + deltaY,
    }, event.currentTarget));
  };

  const finishWidgetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = widgetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    widgetDragRef.current = null;
    setDraggingWidget(false);
    if (drag.moved) {
      const position = widgetPositionRef.current;
      if (position) saveHelpWidgetPosition(position);
      suppressWidgetClickRef.current = true;
      window.setTimeout(() => { suppressWidgetClickRef.current = false; }, 400);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWidgetKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return;
    const step = event.shiftKey ? 40 : 16;
    const direction = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const current = widgetPositionRef.current ?? { left: rect.left, top: rect.top };
    const position = clampHelpWidgetPosition({
      left: current.left + direction[0],
      top: current.top + direction[1],
    }, event.currentTarget);
    updateWidgetPosition(position);
    saveHelpWidgetPosition(position);
  };

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeButton = panelRef.current?.querySelector<HTMLButtonElement>('[data-help-close]');
    closeButton?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) return;
    if (!online) {
      setNotice('Ask needs an internet connection; FAQs are available offline.');
      return;
    }
    if (!supabase) {
      setNotice('CGP Help is not configured in this build. You can still search the offline FAQs.');
      return;
    }
    setAsking(true);
    setNotice('');
    setFeedback('');
    setAnswer('');
    setAnswerId('');
    try {
      const { data: result, error } = await supabase.functions.invoke('help', {
        body: { question: question.trim().slice(0, 500) },
      });
      if (error) throw error;
      if (!result || typeof result.answer !== 'string' || typeof result.answer_id !== 'string') {
        throw new Error('CGP Help returned an invalid response.');
      }
      setAnswer(result.answer);
      setAnswerId(result.answer_id);
    } catch (requestError) {
      if (!platformAdapter.isNetworkError(requestError)) {
        console.error('Unable to get a CGP Help answer.', requestError);
      }
      setNotice(navigator.onLine
        ? 'CGP Help could not answer right now. Please try again later or use the offline FAQs.'
        : 'Ask needs an internet connection; FAQs are available offline.');
    } finally {
      setAsking(false);
    }
  };

  const sendFeedback = async (helpful: boolean) => {
    if (!navigator.onLine || !supabase || !answerId) return;
    setFeedback('Sending feedback…');
    try {
      const { error } = await supabase.functions.invoke('help', {
        body: { action: 'feedback', answer_id: answerId, helpful },
      });
      if (error) throw error;
      setFeedback('Thank you for your feedback.');
    } catch (feedbackError) {
      if (platformAdapter.isNetworkError(feedbackError)) return;
      console.error('Unable to save CGP Help feedback.', feedbackError);
      setFeedback('Feedback could not be saved right now.');
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`fixed z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary-700 text-white shadow-lg transition hover:bg-primary-800 focus:outline-none focus:ring-4 focus:ring-primary-300 print:hidden ${draggingWidget ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={widgetPosition
          ? { left: `${widgetPosition.left}px`, top: `${widgetPosition.top}px`, touchAction: 'none' }
          : { right: '1rem', bottom: 'calc(1.25rem + env(safe-area-inset-bottom))', touchAction: 'none' }}
        aria-label="Open CGP help"
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
        title="Drag to move. Use Alt+Arrow keys to reposition."
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          if (suppressWidgetClickRef.current) {
            event.preventDefault();
            return;
          }
          setOpen(true);
        }}
        onPointerDown={handleWidgetPointerDown}
        onPointerMove={handleWidgetPointerMove}
        onPointerUp={finishWidgetDrag}
        onPointerCancel={finishWidgetDrag}
        onKeyDown={handleWidgetKeyDown}
      >
        <CircleHelp className="h-6 w-6" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 print:hidden" aria-hidden="false">
          <div className="absolute inset-0 bg-ink-950/40" aria-hidden="true" onClick={() => setOpen(false)} />
          <aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-panel-title"
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-ink-200 bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(100vw,28rem)] sm:rounded-none sm:border-l"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
              <div className="rounded-xl bg-primary-50 p-2 text-primary-700"><CircleHelp className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 id="help-panel-title" className="font-display text-lg font-bold text-ink-900">CGP Help</h2>
                <p className="text-xs text-ink-500">Guides and answers available offline</p>
              </div>
              <button data-help-close type="button" className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 focus:outline-none focus:ring-2 focus:ring-primary-500" aria-label="Close help" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
              <section aria-labelledby="help-suggested-title">
                <h3 id="help-suggested-title" className="text-sm font-bold text-ink-900">Suggested for this screen</h3>
                <ul className="mt-2 space-y-2">
                  {suggestions.map((faq) => (
                    <li key={faq.id} className="rounded-xl border border-ink-200 p-3">
                      <p className="text-sm font-semibold text-ink-800">{faq.question}</p>
                      <p className="mt-1 text-xs leading-5 text-ink-600">{faq.answer}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="help-faq-title">
                <h3 id="help-faq-title" className="text-sm font-bold text-ink-900">Search FAQs</h3>
                <label className="relative mt-2 block">
                  <span className="sr-only">Search help questions</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input className="input pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions" />
                </label>
                <div className="mt-2 space-y-2">
                  {filteredFaqs.map((faq) => (
                    <details key={faq.id} className="rounded-xl border border-ink-100 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-ink-800">{faq.question}</summary>
                      <p className="pt-2 text-xs leading-5 text-ink-600">{faq.answer}</p>
                    </details>
                  ))}
                  {filteredFaqs.length === 0 && <p className="text-sm text-ink-500">No matching questions. Try another search.</p>}
                </div>
                {filteredFaqs.length > 0 && <Link className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800" to="/help" onClick={() => setOpen(false)}>Browse full guide <ExternalLink className="h-3.5 w-3.5" /></Link>}
              </section>

              {!loading && !loadError && (
                <section aria-labelledby="help-setup-title">
                  <h3 id="help-setup-title" className="text-sm font-bold text-ink-900">Set-up guide</h3>
                  <ol className="mt-2 space-y-2">
                    {checklist.map((step) => (
                      <li key={step.title}>
                        <Link to={step.to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl bg-ink-50 p-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-primary-500">
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-success-100 text-success-700' : 'border border-ink-300 bg-white text-ink-400'}`}>
                            {step.done ? <Check className="h-4 w-4" aria-label="Completed" /> : <span className="sr-only">Not completed</span>}
                          </span>
                          <span className="flex-1">{step.title}</span>
                          {step.done && <span className="text-xs font-medium text-success-700">Done</span>}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <section aria-labelledby="help-ask-title">
                <h3 id="help-ask-title" className="flex items-center gap-2 text-sm font-bold text-ink-900"><MessageCircleQuestion className="h-4 w-4 text-primary-700" /> Ask a question</h3>
                <form className="mt-2 space-y-2" onSubmit={submitQuestion}>
                  <label htmlFor="help-question" className="sr-only">Ask a question about CGP</label>
                  <textarea id="help-question" className="input min-h-20 resize-y" maxLength={500} value={question} onChange={(event) => { setQuestion(event.target.value); setNotice(''); }} placeholder="What would you like help with?" />
                  <p className="text-xs leading-5 text-ink-500">Ask about CGP features only. Do not include grades, course details, names, or other personal information. Your CGP records are never attached.</p>
                  <button className="btn-primary w-full" type="submit" disabled={!question.trim() || asking}>
                    {asking ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Asking…</span> : 'Ask'}
                  </button>
                </form>
                <p role="status" className="mt-2 text-xs leading-5 text-ink-500">
                  {!online ? 'Ask needs an internet connection; FAQs are available offline.' : 'Answers use CGP’s Help guide only. FAQs are available offline.'}
                </p>
                {notice && <p role="status" className="mt-2 rounded-lg bg-primary-50 p-3 text-xs leading-5 text-primary-800">{notice}</p>}
                {answer && (
                  <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50 p-3">
                    <p className="whitespace-pre-line text-sm leading-6 text-ink-800">{answer}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-primary-100 pt-3">
                      <span className="mr-auto text-xs font-medium text-ink-600">Was this helpful?</span>
                      <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={Boolean(feedback)} onClick={() => void sendFeedback(true)}>Yes</button>
                      <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={Boolean(feedback)} onClick={() => void sendFeedback(false)}>No</button>
                    </div>
                    {feedback && <p role="status" className="mt-2 text-xs text-ink-600">{feedback}</p>}
                  </div>
                )}
                <Link to="/help" onClick={() => setOpen(false)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">Help & privacy guide <ExternalLink className="h-3.5 w-3.5" /></Link>
              </section>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
