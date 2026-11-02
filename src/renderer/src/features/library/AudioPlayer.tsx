import { useEffect, useState } from 'react';
import { formatClock } from '../../../../shared/format.ts';
import { t } from '../../../../shared/i18n/index.ts';
import { Icon } from '../../ui/Icon.tsx';

export function AudioPlayer({ audio, fallbackDuration }: { audio: HTMLAudioElement; fallbackDuration: number }) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  // WebM recordings carry no duration in the file.
  const duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;

  useEffect(() => {
    const onTime = () => setTime(audio.currentTime);
    const onState = () => setPlaying(!audio.paused);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onState);
    audio.addEventListener('pause', onState);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onState);
      audio.removeEventListener('pause', onState);
    };
  }, [audio]);

  return (
    <div className="player">
      <button className="player-toggle" title={playing ? t.item.pause : t.item.play} onClick={() => (audio.paused ? audio.play() : audio.pause())}>
        <Icon name={playing ? 'pause' : 'play'} size={13} />
      </button>
      <span className="numeric muted">{formatClock(time)}</span>
      <input
        className="player-position"
        type="range"
        aria-label={t.item.position}
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(time, duration)}
        onChange={(event) => (audio.currentTime = Number(event.target.value))}
      />
      <span className="numeric muted">{formatClock(duration)}</span>
    </div>
  );
}
