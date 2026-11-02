import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, notesForVersion, parseChangelog, parseReleaseBody } from '../../src/shared/changelog.ts';

const CHANGELOG = `# Changelog

## [1.2.0] - 2026-11-02

### Nuevo
- **Algo**: una función
  que sigue en otra línea.

### Arreglos
- Un arreglo.

## [1.1.0] - 2026-10-30

### Mejoras
- Una mejora.
`;

test('reads versions, dates and sections', () => {
  const versions = parseChangelog(CHANGELOG);
  assert.deepEqual(versions.map(({ version }) => version), ['1.2.0', '1.1.0']);
  assert.equal(versions[0].date, '2026-11-02');
  assert.equal(versions[0].sections[0].items[0], '**Algo**: una función que sigue en otra línea.');
  assert.equal(versions[0].sections[1].title, 'Arreglos');
});

test('notes for a version do not include the next one', () => {
  const notes = notesForVersion(CHANGELOG, '1.2.0');
  assert.ok(notes.includes('Un arreglo.'));
  assert.ok(!notes.includes('Una mejora.'));
});

test('a version missing from the changelog gives nothing', () => {
  assert.equal(notesForVersion(CHANGELOG, '9.9.9'), '');
});

test('a release body stops at the install instructions', () => {
  const sections = parseReleaseBody('### Nuevo\n- Algo\n\n---\n\n## Cómo instalar\n- No es novedad\n');
  assert.deepEqual(sections, [{ title: 'Nuevo', items: ['Algo'] }]);
});

test('versions compare numerically', () => {
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
});
