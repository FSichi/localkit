// Builds a release's notes: what's new in that version (from CHANGELOG.md) plus how to install.
//   node installer/release-notes.mjs 1.2.0 dist/notes.md
// Fails if the changelog lacks that version, so no release goes out without notes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notesForVersion } from '../src/shared/changelog.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [version, output] = process.argv.slice(2);
if (!version) {
  console.error('Usage: node installer/release-notes.mjs <version> [output file]');
  process.exit(2);
}
const whatsNew = notesForVersion(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
if (!whatsNew) {
  console.error(`CHANGELOG.md has no "## [${version}]" section with changes.`);
  process.exit(1);
}
const howToInstall = fs.readFileSync(path.join(root, 'installer', 'release-notes.md'), 'utf8');
const notes = `${whatsNew}\n\n---\n\n${howToInstall}`;
if (output) {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, notes);
  console.log(`Notes for ${version} in ${output}`);
} else {
  process.stdout.write(notes);
}
