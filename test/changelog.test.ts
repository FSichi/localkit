import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararVersiones, notasDeVersion, parseChangelog, parseSecciones } from '../src/shared/changelog.ts';

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

test('lee versiones, fechas y secciones', () => {
  const v = parseChangelog(CHANGELOG);
  assert.deepEqual(v.map((x) => x.version), ['1.2.0', '1.1.0']);
  assert.equal(v[0].fecha, '2026-11-02');
  assert.equal(v[0].secciones[0].items[0], '**Algo**: una función que sigue en otra línea.');
  assert.equal(v[0].secciones[1].titulo, 'Arreglos');
});

test('las notas de una versión no incluyen la siguiente', () => {
  const notas = notasDeVersion(CHANGELOG, '1.2.0');
  assert.ok(notas.includes('Un arreglo.'));
  assert.ok(!notas.includes('Una mejora.'));
});

test('una versión que no está en el CHANGELOG da vacío', () => {
  assert.equal(notasDeVersion(CHANGELOG, '9.9.9'), '');
});

test('el cuerpo del release corta en las instrucciones', () => {
  const s = parseSecciones('### Nuevo\n- Algo\n\n---\n\n## Cómo instalar\n- No es novedad\n');
  assert.deepEqual(s, [{ titulo: 'Nuevo', items: ['Algo'] }]);
});

test('compara versiones numéricamente', () => {
  assert.ok(compararVersiones('0.10.0', '0.9.0') > 0);
  assert.ok(compararVersiones('1.0.0', '1.0.1') < 0);
  assert.equal(compararVersiones('1.2.3', '1.2.3'), 0);
});
