import type { ModelProfile } from '../ai/profiles';
import { advice, FIT_LABEL, rate, type Task } from '../ai/recommend';

interface Props {
  task: Task;
  profiles: ModelProfile[];
  value?: string;
  onChange: (id: string) => void;
  /** Show the advice as a line under the menu (otherwise only as its tooltip). */
  showAdvice?: boolean;
  className?: string;
  /** An extra first option, e.g. "(first ticked model)". */
  empty?: string;
  disabled?: boolean;
}

/** A model menu for one job: each model marked by how well it fits, the advice for the job alongside. */
export function ModelSelect({ task, profiles, value, onChange, showAdvice, className, empty, disabled }: Props) {
  const { fits } = rate(task, profiles);
  const tip = advice(task, profiles);
  const label = (p: ModelProfile) => {
    const f = FIT_LABEL[fits.get(p.id) ?? 'unknown'];
    return f ? `${p.name} · ${f}` : p.name;
  };
  return (
    <span className={showAdvice ? 'model-select with-advice' : 'model-select'}>
      <select className={className} value={value ?? ''} title={tip} disabled={disabled || (!profiles.length && !empty)} onChange={(e) => onChange(e.target.value)}>
        {empty !== undefined && <option value="">{empty}</option>}
        {!profiles.length && empty === undefined && <option value="">No models yet</option>}
        {profiles.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
      </select>
      {showAdvice && profiles.length > 0 && <small className="model-advice">{tip}</small>}
    </span>
  );
}
