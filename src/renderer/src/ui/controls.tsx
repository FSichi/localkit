// Small reusable form controls.
import type { ReactNode } from 'react';

export interface TabOption<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({ options, value, onChange }: { options: readonly TabOption<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option.id} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`field ${wide ? 'wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <span>{label}</span>
      <span className="toggle">
        <input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function Select<T extends string | number>({ value, options, onChange }: { value: T; options: readonly { id: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <select
      className="select"
      value={value}
      onChange={(event) => {
        const selected = options.find((option) => String(option.id) === event.target.value);
        if (selected) onChange(selected.id);
      }}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <input className="input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />;
}
