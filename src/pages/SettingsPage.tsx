import { useState } from 'react';
import { Save, Target } from 'lucide-react';
import { useAppData } from '@/lib/useAppData';
import {
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
  const [choice, setChoice] = useState<TargetChoice>(targetChoiceForSettings(data.settings));
  const [customPercent, setCustomPercent] = useState(
    savedCustomTarget === null
      ? (choice === 'custom' ? String(minPercentForGradePoint(data.settings.targetCGPA)) : '')
      : String(savedCustomTarget),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const saveTarget = () => {
    setError('');
    setMessage('');
    const parsedCustom = Number(customPercent);
    if (choice === 'custom' && (
      customPercent.trim() === ''
      || !Number.isFinite(parsedCustom)
      || parsedCustom < 0
      || parsedCustom > 100
    )) {
      setError('Enter a custom target from 0% to 100%.');
      return;
    }

    const customTarget = choice === 'custom' ? parsedCustom : null;
    const targetCGPA = choice === 'custom'
      ? getGradePoint(parsedCustom)
      : gradePointForTargetChoice(choice);
    if (targetCGPA === null) {
      setError('Choose a target from the available grade scale.');
      return;
    }

    updateSettings({
      targetCGPA,
      targetSet: true,
      customTargetPercent: customTarget,
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
              This sets your global CGPA goal and the default for new courses. Existing courses keep their individual targets.
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

          {error && <p role="alert" className="text-sm text-error-700">{error}</p>}
          {message && <p role="status" className="text-sm text-success-700">{message}</p>}
          <button type="button" className="btn-primary" onClick={saveTarget}>
            <Save className="h-4 w-4" aria-hidden="true" /> Save target
          </button>
        </div>
      </section>
    </div>
  );
}
