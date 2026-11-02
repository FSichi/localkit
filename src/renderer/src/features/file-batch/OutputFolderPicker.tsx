import { t } from '../../../../shared/i18n/index.ts';
import { appStore, updateSettings } from '../../app/app-store.ts';
import { invoke } from '../../lib/bridge.ts';
import { Icon } from '../../ui/Icon.tsx';

export function OutputFolderPicker() {
  const { settings } = appStore.use();
  const pickFolder = async () => {
    const folder = await invoke('dialog:pickFolder');
    if (folder) updateSettings({ outputFolder: folder });
  };
  return (
    <div className="output-folder">
      <span className="field-label">{t.batch.saveIn}</span>
      <button className="link-button" title={settings.outputFolder} onClick={pickFolder}>
        <Icon name="folder" size={14} />
        <span className="output-folder-path">{settings.outputFolder || t.batch.sameFolder}</span>
      </button>
      {settings.outputFolder && (
        <button className="link-button subtle" onClick={() => updateSettings({ outputFolder: '' })}>
          {t.batch.useOriginalFolder}
        </button>
      )}
    </div>
  );
}
