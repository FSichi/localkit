// The waveform: drag to select, click to jump, with removed parts dimmed.
import { useEffect, useRef, type PointerEvent } from 'react';
import type { TimeRange } from '../../../../shared/audio-edit.ts';
import { t } from '../../../../shared/i18n/index.ts';

/** Below this, dragging was a click. */
const DRAG_PIXELS = 4;
const HEIGHT = 140;

interface WaveformEditorProps {
  waveform: number[];
  duration: number;
  cuts: TimeRange[];
  selection: TimeRange | null;
  position: number;
  onSelect: (selection: TimeRange | null) => void;
  onSeek: (seconds: number) => void;
}

function cssColor(element: HTMLElement, token: string) {
  return getComputedStyle(element).getPropertyValue(token).trim();
}

export function WaveformEditor({ waveform, duration, cuts, selection, position, onSelect, onSeek }: WaveformEditorProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dragStart = useRef<{ x: number; seconds: number } | null>(null);

  useEffect(() => {
    const element = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth;
    element.width = width * ratio;
    element.height = HEIGHT * ratio;
    const context = element.getContext('2d')!;
    context.scale(ratio, ratio);
    const toX = (seconds: number) => (seconds / (duration || 1)) * width;

    context.clearRect(0, 0, width, HEIGHT);
    const middle = HEIGHT / 2;
    const isRemoved = (seconds: number) => cuts.some(({ start, end }) => seconds >= start && seconds < end);
    const wave = cssColor(element, '--accent');
    const removedWave = cssColor(element, '--border-2');
    for (let x = 0; x < width; x++) {
      const from = Math.floor((x / width) * waveform.length);
      const to = Math.max(from + 1, Math.floor(((x + 1) / width) * waveform.length));
      const peak = Math.max(...waveform.slice(from, to));
      const half = Math.max(1, peak * (middle - 4));
      context.fillStyle = isRemoved(((x + 0.5) / width) * duration) ? removedWave : wave;
      context.fillRect(x, middle - half, 1, half * 2);
    }

    context.fillStyle = cssColor(element, '--overlay');
    for (const { start, end } of cuts) context.fillRect(toX(start), 0, toX(end) - toX(start), HEIGHT);
    if (selection) {
      context.fillStyle = cssColor(element, '--accent-soft');
      context.globalAlpha = 0.55;
      context.fillRect(toX(selection.start), 0, toX(selection.end) - toX(selection.start), HEIGHT);
      context.globalAlpha = 1;
      context.fillStyle = cssColor(element, '--accent-text');
      context.fillRect(toX(selection.start), 0, 1, HEIGHT);
      context.fillRect(toX(selection.end) - 1, 0, 1, HEIGHT);
    }
    context.fillStyle = cssColor(element, '--text');
    context.fillRect(Math.round(toX(position)), 0, 1.5, HEIGHT);
  }, [waveform, duration, cuts, selection, position]);

  const secondsAt = (event: PointerEvent) => {
    const { left, width } = canvas.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((event.clientX - left) / width) * duration));
  };

  return (
    <canvas
      ref={canvas}
      className="waveform-editor"
      role="img"
      aria-label={t.audioEditor.waveform}
      style={{ height: HEIGHT }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = { x: event.clientX, seconds: secondsAt(event) };
      }}
      onPointerMove={(event) => {
        const start = dragStart.current;
        if (!start || Math.abs(event.clientX - start.x) < DRAG_PIXELS) return;
        const seconds = secondsAt(event);
        onSelect({ start: Math.min(start.seconds, seconds), end: Math.max(start.seconds, seconds) });
      }}
      onPointerUp={(event) => {
        const start = dragStart.current;
        dragStart.current = null;
        if (start && Math.abs(event.clientX - start.x) < DRAG_PIXELS) {
          onSelect(null);
          onSeek(start.seconds);
        }
      }}
    />
  );
}
