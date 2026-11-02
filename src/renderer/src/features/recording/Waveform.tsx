import { useEffect, useRef } from 'react';
import type { AudioSource } from '../../../../shared/transcription.ts';
import { levelHistory } from './recorder.ts';

function drawBars(context: CanvasRenderingContext2D, levels: Float32Array, color: string, upward: boolean, width: number, height: number, scale: number) {
  const step = width / levels.length;
  const barWidth = Math.max(1.5 * scale, step * 0.55);
  context.fillStyle = color;
  for (let i = 0; i < levels.length; i++) {
    const barHeight = Math.max(1.5 * scale, levels[i] * (height / 2 - 2 * scale));
    context.fillRect(i * step, upward ? height / 2 - barHeight - scale : height / 2 + scale, barWidth, barHeight);
  }
}

/** Live wave. Reads the level history directly, without going through React. */
export function Waveform({ source }: { source: AudioSource }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const styles = getComputedStyle(document.documentElement);
    const systemColor = styles.getPropertyValue('--accent').trim();
    const microphoneColor = styles.getPropertyValue('--ok').trim();
    let frame = 0;

    const draw = () => {
      const scale = devicePixelRatio;
      const width = canvas.clientWidth * scale;
      const height = canvas.clientHeight * scale;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.clearRect(0, 0, width, height);
      if (source !== 'microphone') drawBars(context, levelHistory.system, systemColor, true, width, height, scale);
      if (source !== 'system') drawBars(context, levelHistory.microphone, microphoneColor, source === 'microphone', width, height, scale);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [source]);

  return <canvas ref={canvasRef} className="waveform" />;
}
