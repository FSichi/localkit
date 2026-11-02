import { useMemo, useState } from 'react';
import { extensionsFor, fileKindOf, fileNameOf, type SupportedFileKind } from '../../../../shared/files.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { navigate } from '../../app/app-store.ts';
import type { FileAction } from '../../app/tool-definition.ts';
import { fileActionsFor, TOOLS } from '../../app/tools.ts';
import { DropZone } from '../../ui/DropZone.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Page, PageHeader, Section } from '../../ui/layout.tsx';

const ALL_EXTENSIONS = extensionsFor('image', 'video', 'audio', 'pdf', 'markdown');

interface Suggestion {
  kind: SupportedFileKind;
  paths: string[];
  actions: FileAction[];
}

function suggestActions(paths: string[]): Suggestion[] {
  const byKind = new Map<SupportedFileKind, string[]>();
  for (const path of paths) {
    const kind = fileKindOf(path);
    if (kind !== 'other') byKind.set(kind, [...(byKind.get(kind) ?? []), path]);
  }
  return [...byKind].map(([kind, kindPaths]) => ({ kind, paths: kindPaths, actions: fileActionsFor(kind) }));
}

function SuggestionCard({ suggestion, onDismiss }: { suggestion: Suggestion; onDismiss: () => void }) {
  const { kind, paths, actions } = suggestion;
  return (
    <div className="suggestion">
      <div className="suggestion-header">
        <strong>{paths.length === 1 ? fileNameOf(paths[0]) : t.home.fileGroups[kind](paths.length)}</strong>
        <button className="btn btn-ghost btn-small btn-icon" title={t.common.remove} onClick={onDismiss}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="suggestion-actions">
        {actions.map((action) => (
          <button key={action.label} className="btn" onClick={() => action.run(paths)}>
            <Icon name={action.icon} size={14} /> {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const [paths, setPaths] = useState<string[]>([]);
  const suggestions = useMemo(() => suggestActions(paths), [paths]);

  return (
    <Page>
      <PageHeader title={t.home.title} subtitle={t.home.subtitle} />
      <DropZone extensions={ALL_EXTENSIONS} onFiles={setPaths} title={t.home.dropTitle} detail={t.home.dropDetail} compact={suggestions.length > 0} />

      {paths.length > 0 && !suggestions.length && <p className="footnote">{t.home.unsupported}</p>}
      {suggestions.map((suggestion) => (
        <SuggestionCard key={suggestion.kind} suggestion={suggestion} onDismiss={() => setPaths(paths.filter((path) => !suggestion.paths.includes(path)))} />
      ))}

      <Section title={t.home.tools}>
        <div className="tool-grid">
          {TOOLS.map((tool) => (
            <button key={tool.id} className="tool-card" onClick={() => navigate({ page: tool.id })}>
              <span className="tool-card-icon">
                <Icon name={tool.icon} size={18} />
              </span>
              <strong>{tool.label}</strong>
              <span>{tool.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <p className="footnote">
        <Icon name="lock" size={13} /> {t.home.privacy}
      </p>
    </Page>
  );
}
