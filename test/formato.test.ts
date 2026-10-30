import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aParrafos, aSrt, aTxt, aHtml, reloj, relojSrt } from '../src/shared/formato.ts';

const seg = (inicio: number, fin: number, texto: string, hablante?: 'yo' | 'otros') => ({ inicio, fin, texto, hablante });

test('une segmentos seguidos y corta en pausas largas', () => {
  const p = aParrafos([seg(0, 2, 'Hola'), seg(2, 4, 'che'), seg(8, 9, 'Otra idea')]);
  assert.deepEqual(p.map((x) => x.texto), ['Hola che', 'Otra idea']);
});

test('corta párrafo cuando cambia quien habla', () => {
  const p = aParrafos([seg(0, 2, 'Hola', 'yo'), seg(2, 3, 'Buenas', 'otros')]);
  assert.equal(p.length, 2);
  assert.equal(p[1].hablante, 'otros');
});

test('relojes', () => {
  assert.equal(reloj(65), '01:05');
  assert.equal(reloj(3725), '1:02:05');
  assert.equal(relojSrt(61.5), '00:01:01,500');
  assert.equal(relojSrt(59.9996), '00:01:00,000');
});

test('SRT numerado, con hablante y duración mínima', () => {
  const srt = aSrt([seg(1, 1, 'Hola', 'yo')]);
  assert.equal(srt, '1\n00:00:01,000 --> 00:00:01,500\nYo: Hola\n');
});

test('TXT con tiempos y hablante', () => {
  assert.equal(aTxt([seg(5, 6, 'Hola', 'otros')], true), '[00:05] Otros: Hola\n');
});

test('el HTML del PDF escapa el contenido', () => {
  assert.ok(aHtml('<b>', 's', [seg(0, 1, '<script>')], false).includes('&lt;script&gt;'));
});
