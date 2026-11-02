// Reads CHANGELOG.md and the body of GitHub releases, which come from it.
// Format:  ## [1.2.0] - 2026-10-29   →   ### Nuevo   →   - A change
export interface ReleaseSection {
  title: string;
  items: string[];
}

export interface ReleaseNotes {
  version: string;
  date: string | null;
  sections: ReleaseSection[];
}

const VERSION_HEADING = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?(?:\s*[-–]\s*(\d{4}-\d{2}-\d{2}))?/;

function readSections(lines: string[], isEnd: (line: string) => boolean): ReleaseSection[] {
  const sections: ReleaseSection[] = [];
  let current: ReleaseSection | null = null;
  for (const line of lines) {
    if (isEnd(line)) break;
    const heading = line.match(/^###\s+(.+)/);
    if (heading) {
      current = { title: heading[1].trim(), items: [] };
      sections.push(current);
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+)/);
    if (item && current) current.items.push(item[1].trim());
    // An indented line continues the previous item.
    else if (current?.items.length && /^\s{2,}\S/.test(line)) current.items[current.items.length - 1] += ` ${line.trim()}`;
  }
  return sections.filter((section) => section.items.length);
}

const toLines = (text: string) => String(text ?? '').replace(/\r/g, '').split('\n');

export function parseChangelog(text: string): ReleaseNotes[] {
  const lines = toLines(text);
  const versions: ReleaseNotes[] = [];
  lines.forEach((line, index) => {
    const match = line.match(VERSION_HEADING);
    if (match) {
      versions.push({ version: match[1], date: match[2] ?? null, sections: readSections(lines.slice(index + 1), (l) => VERSION_HEADING.test(l)) });
    }
  });
  return versions;
}

/** A release body: sections come first; after "---" come the install instructions. */
export function parseReleaseBody(text: string): ReleaseSection[] {
  return readSections(toLines(text), (line) => /^---\s*$/.test(line) || /^##\s/.test(line));
}

/** The text of one version, as it goes in the release. Empty if the changelog doesn't have it. */
export function notesForVersion(text: string, version: string): string {
  const lines = toLines(text);
  const start = lines.findIndex((line) => line.match(VERSION_HEADING)?.[1] === version);
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => VERSION_HEADING.test(line));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return /^\s*[-*]\s+/m.test(body) ? body : '';
}

export function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.split('-')[0].split('.').map((n) => Number(n) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) - (right[i] ?? 0);
  }
  return 0;
}
