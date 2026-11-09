import { useState } from 'react';
import { Save, Target } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import { getLocalCalendarDate, deriveJoinedAcademicYear, getActiveAcademicYear, validateProgrammeAnchor } from '@/features/calendar/calendarModel';
import { parseCalendarDate } from '@/lib/academicCalendar';
import {
  customTargetCGPAForSettings,
  customTargetPercentForSettings,
  gradePointForTargetChoice,
  targetChoiceForSettings,
  TARGET_OPTIONS,
  type TargetChoice,
} from '@/lib/gradingConfig';
import { getGradePoint, MAX_GRADE_POINT, minPercentForGradePoint } from '@/lib/types';

function isTargetChoice(value: string): value is TargetChoice {
  return TARGET_OPTIONS.some((option) => option.value === value);
}

export function SettingsPage() {
  const { data, updateSettings } = useAppData();
  const savedCustomTarget = customTargetPercentForSettings(data.settings);
  const savedCustomCGPA = customTargetCGPAForSettings(data.settings);
  const [choice, setChoice] = useState<TargetChoice>(targetChoiceForSettings(data.settings));
  const [customPercent, setCustomPercent] = useState(
    savedCustomTarget === null
      ? (choice === 'custom' ? String(minPercentForGradePoint(data.settings.targetCGPA)) : '')
      : String(savedCustomTarget),
  );
  const [customCGPA, setCustomCGPA] = useState(
    savedCustomCGPA === null
      ? String(data.settings.targetCGPA)
      : String(savedCustomCGPA),
  );
  const [programmeYear, setProgrammeYear] = useState(
    data.settings.programmeAnchor?.year
      ? String(data.settings.programmeAnchor.year)
      : data.settings.yearOfStudy ? String(data.settings.yearOfStudy) : '',
  );
  const [programmeSemester, setProgrammeSemester] = useState(
    String(data.settings.programmeAnchor?.semester ?? data.settings.currentSemester ?? 1),
  );
  const [programDurationYears, setProgramDurationYears] = useState(
    data.settings.programmeAnchor?.programDurationYears
      ? String(data.settings.programmeAnchor.programDurationYears)
      : '',
  );
  const [programmeJoinedAcademicYear, setProgrammeJoinedAcademicYear] = useState(
    data.settings.programmeJoinedAcademicYear ?? '',
  );
  const [programmeFinishDateOverride, setProgrammeFinishDateOverride] = useState(
    data.settings.programmeFinishDateOverride ?? '',
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [programmeMessage, setProgrammeMessage] = useState('');
  const [programmeError, setProgrammeError] = useState('');

  const saveProgrammeDetails = () => {
    setProgrammeError('');
    setProgrammeMessage('');
    const parsedYear = programmeYear ? Number(programmeYear) : null;
    const parsedDuration = programDurationYears ? Number(programDurationYears) : null;
    const parsedSemester = programmeSemester ? Number(programmeSemester) : null;
    const validation = validateProgrammeAnchor(parsedYear, parsedDuration);
    if (validation.severity === 'error') {
      setProgrammeError(validation.message ?? 'Enter valid programme details.');
      return;
    }
    if (parsedSemester === null || !Number.isInteger(parsedSemester) || parsedSemester < 1 || parsedSemester > 2) {
      setProgrammeError('Choose your current semester from 1 to 2.');
      return;
    }
    if (parsedYear === null || parsedDuration === null) {
      setProgrammeError('Enter your current year of study and programme duration.');
      return;
    }
    if (programmeFinishDateOverride) {
      try {
        parseCalendarDate(programmeFinishDateOverride);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        setProgrammeError('Enter a valid finish date.');
        return;
      }
    }
    const academicYear = getActiveAcademicYear(getLocalCalendarDate());
    updateSettings({
      academicYear,
      yearOfStudy: parsedYear,
      currentSemester: parsedSemester,
      programmeAnchor: {
        academicYear,
        year: parsedYear,
        semester: parsedSemester,
        programDurationYears: parsedDuration,
      },
      programmeJoinedAcademicYear: programmeJoinedAcademicYear.trim()
        || deriveJoinedAcademicYear(academicYear, parsedYear),
      programmeFinishDateOverride: programmeFinishDateOverride || null,
    });
    setProgrammeMessage(validation.severity === 'warning'
      ? validation.message ?? 'Programme details saved.'
      : 'Programme details saved.');
  };

  const saveTarget = () => {
    setError('');
    setMessage('');
    const parsedCustom = Number(customPercent);
    const parsedCustomCGPA = Number(customCGPA);
    if (choice === 'custom' && (
      customPercent.trim() === ''
      || !Number.isFinite(parsedCustom)
      || parsedCustom < 0
      || parsedCustom > 100
    )) {
      setError('Enter a custom target from 0% to 100%.');
      return;
    }
    if (choice === 'custom-gp' && (
      customCGPA.trim() === ''
      || !Number.isFinite(parsedCustomCGPA)
      || parsedCustomCGPA < 0
      || parsedCustomCGPA > MAX_GRADE_POINT
    )) {
      setError(`Enter a custom CGPA from 0.00 to ${MAX_GRADE_POINT.toFixed(2)}.`);
      return;
    }

    const customTarget = choice === 'custom' ? parsedCustom : null;
    const exactCustomCGPA = choice === 'custom-gp' ? parsedCustomCGPA : null;
    const targetCGPA = choice === 'custom'
      ? getGradePoint(parsedCustom)
      : choice === 'custom-gp'
        ? parsedCustomCGPA
        : gradePointForTargetChoice(choice);
    if (targetCGPA === null) {
      setError('Choose a target from the available grade scale.');
      return;
    }

    updateSettings({
      targetCGPA,
      targetSet: true,
      customTargetPercent: customTarget,
      customTargetCGPA: exactCustomCGPA,
      targetChoice: choice,
      legacyTargetPromptDismissed: true,
    });
    setMessage(`Target saved. New courses will default to ${targetCGPA.toFixed(2)} GP.`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink-900">Settings</h1>
        <p className="mt-1 text-sm text-ink-500">Choose your academic target and default course goal.</p>
      </header>

      <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="target-setting-title">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary-50 p-2 text-primary-700">
            <Target className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="target-setting-title" className="font-display text-lg font-semibold text-ink-900">Your target</h2>
            <p className="mt-1 text-sm leading-6 text-ink-600">
              This sets your global CGPA goal and the default for courses. Existing courses follow the global goal unless you set an individual course override.
            </p>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <div>
            <label htmlFor="settings-target-choice" className="label">Target grade</label>
            <select
              id="settings-target-choice"
              className="input"
              value={choice}
              onChange={(event) => {
                if (isTargetChoice(event.target.value)) setChoice(event.target.value);
              }}
            >
              {TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {choice === 'custom' && (
            <div>
              <label htmlFor="settings-custom-target" className="label">Custom course percentage</label>
              <div className="flex items-center gap-2">
                <input
                  id="settings-custom-target"
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={customPercent}
                  onChange={(event) => setCustomPercent(event.target.value)}
                  aria-describedby="settings-custom-target-help"
                />
                <span className="text-sm text-ink-500">%</span>
              </div>
              <p id="settings-custom-target-help" className="mt-1 text-xs text-ink-500">
                The exact percentage is retained; the global CGPA target follows its grade-scale band (maximum {MAX_GRADE_POINT.toFixed(1)}).
              </p>
            </div>
          )}

          {choice === 'custom-gp' && (
            <div>
              <label htmlFor="settings-custom-cgpa" className="label">Exact CGPA target</label>
              <div className="flex items-center gap-2">
                <input
                  id="settings-custom-cgpa"
                  className="input"
                  type="number"
                  min="0"
                  max={MAX_GRADE_POINT}
                  step="0.01"
                  value={customCGPA}
                  onChange={(event) => setCustomCGPA(event.target.value)}
                  aria-describedby="settings-custom-cgpa-help"
                />
                <span className="text-sm text-ink-500">GP</span>
              </div>
              <p id="settings-custom-cgpa-help" className="mt-1 text-xs text-ink-500">
                This exact value is used for CGPA comparisons. Course forecasts use the grade-scale percentage threshold at this point.
              </p>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-error-700">{error}</p>}
          {message && <p role="status" className="text-sm text-success-700">{message}</p>}
          <button type="button" className="btn-primary" onClick={saveTarget}>
            <Save className="h-4 w-4" aria-hidden="true" /> Save target
          </button>
        </div>
      </section>

      <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="programme-setting-title">
        <div>
          <h2 id="programme-setting-title" className="font-display text-lg font-semibold text-ink-900">
            Programme progress
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-600">
            Add your current programme position and duration to estimate your finish date.
          </p>
        </div>
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="settings-programme-year" className="label">Current year of study</label>
            <select
              id="settings-programme-year"
              className="input"
              value={programmeYear}
              onChange={(event) => setProgrammeYear(event.target.value)}
            >
              <option value="">Choose year</option>
              {[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="settings-programme-semester" className="label">Current semester</label>
            <select
              id="settings-programme-semester"
              className="input"
              value={programmeSemester}
              onChange={(event) => setProgrammeSemester(event.target.value)}
            >
              <option value="1">Semester 1</option>
              <option value="2">Semester 2</option>
            </select>
          </div>
          <div>
            <label htmlFor="settings-programme-duration" className="label">Programme duration (years)</label>
            <input
              id="settings-programme-duration"
              className="input"
              type="number"
              min={1}
              max={6}
              step={1}
              inputMode="numeric"
              value={programDurationYears}
              onChange={(event) => setProgramDurationYears(event.target.value)}
              aria-describedby="settings-programme-duration-help"
            />
            <p id="settings-programme-duration-help" className="mt-1 text-xs text-ink-500">
              Estimate uses the university calendar’s two-semester pattern.
            </p>
          </div>
          <div>
            <label htmlFor="settings-programme-joined-year" className="label">Joined academic year</label>
            <input
              id="settings-programme-joined-year"
              className="input"
              maxLength={20}
              value={programmeJoinedAcademicYear
                || (programmeYear
                  ? deriveJoinedAcademicYear(
                    getActiveAcademicYear(getLocalCalendarDate()),
                    Number(programmeYear),
                  ) ?? ''
                  : '')}
              onChange={(event) => setProgrammeJoinedAcademicYear(event.target.value)}
              aria-describedby="settings-programme-joined-year-help"
            />
            <p id="settings-programme-joined-year-help" className="mt-1 text-xs text-ink-500">
              Display label only; changing it will not alter your estimate.
            </p>
          </div>
          <div>
            <label htmlFor="settings-programme-finish-override" className="label">Finish date override (optional)</label>
            <input
              id="settings-programme-finish-override"
              className="input"
              type="date"
              value={programmeFinishDateOverride}
              onChange={(event) => setProgrammeFinishDateOverride(event.target.value)}
              aria-describedby="settings-programme-finish-override-help"
            />
            <p id="settings-programme-finish-override-help" className="mt-1 text-xs text-ink-500">
              Use this if your expected finish date differs from the estimate. Clear it to use the estimate.
            </p>
          </div>
        </div>
        {programmeYear && programDurationYears && (() => {
          const validation = validateProgrammeAnchor(Number(programmeYear), Number(programDurationYears));
          return validation.message && (
            <p className={`text-sm ${validation.severity === 'error' ? 'text-error-700' : 'text-warning-700'}`} role={validation.severity === 'error' ? 'alert' : 'status'}>
              {validation.message}
            </p>
          );
        })()}
        {programmeError && <p role="alert" className="text-sm text-error-700">{programmeError}</p>}
        {programmeMessage && <p role="status" className="text-sm text-success-700">{programmeMessage}</p>}
        <button type="button" className="btn-primary" onClick={saveProgrammeDetails}>
          <Save className="h-4 w-4" aria-hidden="true" /> Save programme details
        </button>
      </section>
    </div>
  );
}
