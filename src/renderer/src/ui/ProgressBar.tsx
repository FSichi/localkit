/** Without a fraction it shows an indeterminate animation. */
export function ProgressBar({ fraction }: { fraction: number | null }) {
  return (
    <span className={`progress ${fraction == null ? 'indeterminate' : ''}`}>
      <span className="progress-fill" style={{ width: `${(fraction ?? 0) * 100}%` }} />
    </span>
  );
}
