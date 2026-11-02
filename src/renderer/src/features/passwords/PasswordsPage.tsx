import { useCallback, useEffect, useState } from 'react';
import { t } from '../../../../shared/i18n/index.ts';
import { entropyBits, generatePassword, secondsToCrack, strengthOf, type PasswordOptions } from '../../../../shared/passwords.ts';
import { notify } from '../../app/toasts.ts';
import { invoke } from '../../lib/bridge.ts';
import { createStore } from '../../lib/create-store.ts';
import { Toggle } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader, Section } from '../../ui/layout.tsx';

const HISTORY_SIZE = 10;
const STRENGTH_LEVELS = { weak: 1, fair: 2, strong: 3, veryStrong: 4 } as const;

// Kept in memory only: passwords are never written to disk.
const passwordStore = createStore<{ options: PasswordOptions; history: string[] }>({
  options: { length: 16, lowercase: true, uppercase: true, digits: true, symbols: true, excludeAmbiguous: false },
  history: [],
});

const OPTION_TOGGLES: { key: Exclude<keyof PasswordOptions, 'length'>; label: string }[] = [
  { key: 'lowercase', label: t.passwords.lowercase },
  { key: 'uppercase', label: t.passwords.uppercase },
  { key: 'digits', label: t.passwords.digits },
  { key: 'symbols', label: t.passwords.symbols },
  { key: 'excludeAmbiguous', label: t.passwords.excludeAmbiguous },
];

async function copyPassword(password: string) {
  await invoke('clipboard:writeText', password);
  notify(t.passwords.copied);
}

function maskPassword(password: string) {
  return `${password.slice(0, 2)}${'•'.repeat(Math.max(0, password.length - 4))}${password.slice(-2)}`;
}

export function PasswordsPage() {
  const { options, history } = passwordStore.use();
  const [password, setPassword] = useState('');
  const bits = entropyBits(options);
  const strength = strengthOf(bits);

  const regenerate = useCallback(() => setPassword(generatePassword(passwordStore.get().options)), []);
  useEffect(regenerate, [options, regenerate]);

  const setOptions = (changes: Partial<PasswordOptions>) => passwordStore.set({ options: { ...options, ...changes } });

  const copy = () => {
    copyPassword(password);
    passwordStore.set({ history: [password, ...history.filter((entry) => entry !== password)].slice(0, HISTORY_SIZE) });
  };

  return (
    <Page>
      <PageHeader title={t.passwords.title} subtitle={t.passwords.subtitle} />

      <div className="password-card">
        <output className="password-value">{password || t.passwords.chooseCharacters}</output>
        <div className="password-actions">
          <button className="btn btn-icon" title={t.passwords.regenerate} disabled={!password} onClick={regenerate}>
            <Icon name="refresh" />
          </button>
          <button className="btn btn-primary" disabled={!password} onClick={copy}>
            <Icon name="copy" size={14} /> {t.common.copy}
          </button>
        </div>
      </div>

      <div className="strength" data-level={STRENGTH_LEVELS[strength]}>
        <div className="strength-bars">
          {[1, 2, 3, 4].map((level) => (
            <span key={level} className={level <= STRENGTH_LEVELS[strength] ? 'filled' : ''} />
          ))}
        </div>
        <span>
          <strong>{t.passwords.strength[strength]}</strong> · {t.passwords.bits(bits)} · {t.passwords.crackTime(secondsToCrack(bits))}
        </span>
      </div>

      <div className="panel">
        <div className="field">
          <span className="field-label">{t.passwords.length(options.length)}</span>
          <input className="range" type="range" min={6} max={64} value={options.length} aria-label={t.passwords.length(options.length)} onChange={(event) => setOptions({ length: Number(event.target.value) })} />
        </div>
        <div className="toggle-grid">
          {OPTION_TOGGLES.map(({ key, label }) => (
            <Toggle key={key} label={label} checked={options[key]} onChange={(checked) => setOptions({ [key]: checked })} />
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <Section title={t.passwords.history}>
          <div className="rows">
            {history.map((entry) => (
              <div key={entry} className="row">
                <span className="row-title mono">{maskPassword(entry)}</span>
                <button className="btn btn-ghost btn-small btn-icon" title={t.common.copy} onClick={() => copyPassword(entry)}>
                  <Icon name="copy" size={14} />
                </button>
              </div>
            ))}
          </div>
          <p className="footnote">
            <Icon name="lock" size={13} /> {t.passwords.historyNote}
          </p>
        </Section>
      )}
    </Page>
  );
}
