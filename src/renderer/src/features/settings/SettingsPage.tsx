import { t } from '../../../../shared/i18n/index.ts';
import type { Theme } from '../../../../shared/settings.ts';
import { LANGUAGE_CODES } from '../../../../shared/whisper-models.ts';
import { appStore, updateSettings } from '../../app/app-store.ts';
import { invoke } from '../../lib/bridge.ts';
import { Select, Tabs, Toggle } from '../../ui/controls.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader, Section } from '../../ui/layout.tsx';
import { checkForUpdate, localReleaseNotes, updateStore } from '../updates/update-store.ts';
import { ModelList } from './ModelList.tsx';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: t.settings.themes.dark },
  { id: 'light', label: t.settings.themes.light },
  { id: 'system', label: t.settings.themes.system },
];

const LANGUAGE_OPTIONS = LANGUAGE_CODES.map((id) => ({ id: id as string, label: t.languages[id] }));
const VISIBLE_RELEASES = 12;

function FolderRow({ title, path, onPick }: { title: string; path: string; onPick: () => void }) {
  return (
    <div className="row">
      <span className="row-body">
        <span className="row-title">{title}</span>
        <span className="row-detail mono">{path}</span>
      </span>
      <button className="btn btn-small" onClick={() => invoke('shell:openPath', path)}>
        {t.common.open}
      </button>
      <button className="btn btn-small" onClick={onPick}>
        {t.common.change}
      </button>
    </div>
  );
}

function AppSection() {
  const { settings, version } = appStore.use();
  const { info, checking, checkError } = updateStore.use();
  const updateAvailable = Boolean(info?.updateAvailable && info.latest);

  const status = checkError
    ? t.settings.checkFailed(checkError)
    : updateAvailable
      ? t.settings.newVersion(info!.latest!.version)
      : info
        ? t.settings.upToDate
        : t.settings.notChecked;

  return (
    <Section title={t.settings.app}>
      <div className="rows">
        <div className="row">
          <span className="row-body">
            <span className="row-title">
              {t.app.name} {version}
            </span>
            <span className="row-detail">{status}</span>
          </span>
          {updateAvailable ? (
            <button className="btn btn-small btn-primary" onClick={() => updateStore.set({ dialog: 'update' })}>
              {t.settings.viewWhatsNew}
            </button>
          ) : (
            <button className="btn btn-small" disabled={checking} onClick={() => checkForUpdate(true)}>
              {checking ? t.settings.checking : t.settings.checkNow}
            </button>
          )}
        </div>
        <div className="row">
          <Toggle label={t.settings.checkOnOpen} checked={settings.checkForUpdates} onChange={(checkForUpdates) => updateSettings({ checkForUpdates })} />
        </div>
        <button className="row" onClick={() => updateStore.set({ dialog: 'notes', notes: localReleaseNotes().slice(0, VISIBLE_RELEASES) })}>
          <span className="row-title">{t.settings.versionHistory}</span>
          <Icon name="forward" size={14} />
        </button>
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const { settings, profile, gpuName } = appStore.use();

  const pickRecordingsFolder = async () => {
    const folder = await invoke('dialog:pickFolder');
    if (folder) updateSettings({ recordingsFolder: folder });
  };

  return (
    <Page>
      <PageHeader title={t.settings.title} />

      <Section title={t.settings.appearance}>
        <div className="rows">
          <div className="row">
            <span className="row-title">{t.settings.theme}</span>
            <Tabs options={THEMES} value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
          </div>
        </div>
      </Section>

      <Section
        title={t.settings.quality}
        action={
          <button className="link-button" onClick={() => invoke('models:openFolder')}>
            {t.settings.openModelsFolder}
          </button>
        }
      >
        <ModelList />
        <p className="footnote">{profile === 'gpu' ? t.settings.usingGpu(gpuName) : t.settings.usingCpu}</p>
      </Section>

      <Section title={t.settings.transcription}>
        <div className="rows">
          <div className="row">
            <span className="row-title">{t.settings.defaultLanguage}</span>
            <Select value={settings.language} options={LANGUAGE_OPTIONS} onChange={(language) => updateSettings({ language })} />
          </div>
        </div>
      </Section>

      <Section title={t.settings.recordings}>
        <div className="rows">
          <FolderRow title={t.settings.folder} path={settings.recordingsFolder} onPick={pickRecordingsFolder} />
        </div>
      </Section>

      <AppSection />

      <p className="footnote">
        <Icon name="lock" size={13} /> {t.settings.privacy}
      </p>
    </Page>
  );
}
