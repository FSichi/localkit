import { Fragment, type ReactNode } from 'react';
import type { ReleaseSection } from '../../../../shared/changelog.ts';
import { formatBytes, formatDayMonthYear } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { invoke } from '../../lib/bridge.ts';
import { Dialog } from '../../ui/Dialog.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { ProgressBar } from '../../ui/ProgressBar.tsx';
import { installUpdate, postponeUpdate, updateStore } from './update-store.ts';

/** Changelog headings are in the document's language. */
const SECTION_STYLES: Record<string, string> = { nuevo: 'new', mejoras: 'improved', arreglos: 'fixed' };

/** Note text: only **bold** is interpreted, never HTML. */
function NoteLine({ text }: { text: string }) {
  const parts: ReactNode[] = text.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>));
  return <>{parts}</>;
}

function ReleaseSections({ sections }: { sections: ReleaseSection[] }) {
  if (!sections.length) return <p className="subtle">{t.updates.noNotes}</p>;
  return (
    <>
      {sections.map((section) => (
        <div key={section.title} className="notes-section">
          <h3 className={SECTION_STYLES[section.title.toLowerCase()] ?? ''}>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item}>
                <NoteLine text={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function UpdateProgressView() {
  const { progress } = updateStore.use();
  if (!progress) return null;
  const { phase, doneBytes, totalBytes } = progress;
  const downloading = phase === 'downloading';
  return (
    <>
      <p>
        {t.updates.phases[phase]}
        {downloading && totalBytes > 0 && <span className="muted"> · {t.updates.downloaded(formatBytes(doneBytes), formatBytes(totalBytes))}</span>}
      </p>
      <ProgressBar fraction={downloading && totalBytes ? doneBytes / totalBytes : null} />
      <p className="note">{phase === 'installing' ? t.updates.restarting : t.updates.keepOpen}</p>
    </>
  );
}

function UpdateDialog() {
  const { info, progress, installError } = updateStore.use();
  if (!info?.latest) return null;
  const { latest, installed, currentVersion } = info;
  return (
    <Dialog label={t.updates.dialogLabel} wide>
      <h2>{t.updates.title}</h2>
      <span className="version-chip">
        {currentVersion} → {latest.version}
      </span>
      {progress ? (
        <UpdateProgressView />
      ) : (
        <>
          <div className="notes">
            <ReleaseSections sections={latest.sections} />
          </div>
          {installError && <p className="error-text">{installError}</p>}
          <p className="note">{installed ? t.updates.installNote(latest.installer ? formatBytes(latest.installer.bytes) : '') : t.updates.fromSource}</p>
          <div className="dialog-actions">
            <button className="btn" onClick={postponeUpdate}>
              {t.common.later}
            </button>
            {installed ? (
              <button className="btn btn-primary" onClick={installUpdate}>
                <Icon name="download" size={14} /> {t.updates.install}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => invoke('shell:openGitHub', latest.url)}>
                {t.updates.viewOnGitHub}
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}

function NotesDialog() {
  const { notes } = updateStore.use();
  const close = () => updateStore.set({ dialog: null });
  const single = notes.length === 1;
  const title = single ? t.updates.whatsNew(notes[0].version) : t.updates.history;
  return (
    <Dialog label={title} wide onDismiss={close}>
      <h2>{title}</h2>
      <div className="notes">
        {notes.map((entry) => (
          <div key={entry.version} className="notes-version">
            {!single && (
              <span className="version-chip">
                {entry.version}
                {entry.date ? ` · ${formatDayMonthYear(new Date(`${entry.date}T12:00:00`))}` : ''}
              </span>
            )}
            <ReleaseSections sections={entry.sections} />
          </div>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="btn btn-primary" autoFocus onClick={close}>
          {t.common.done}
        </button>
      </div>
    </Dialog>
  );
}

export function UpdateDialogs() {
  const { dialog } = updateStore.use();
  if (dialog === 'update') return <UpdateDialog />;
  if (dialog === 'notes') return <NotesDialog />;
  return null;
}

export function UpdateBadge() {
  const { info } = updateStore.use();
  if (!info?.updateAvailable || !info.latest) return null;
  return (
    <button className="update-badge" onClick={() => updateStore.set({ dialog: 'update' })}>
      <span className="dot" />
      {t.updates.available(info.latest.version)}
    </button>
  );
}
