import type { ReactNode } from 'react';

interface DialogProps {
  label: string;
  wide?: boolean;
  /** Without it, clicking outside does nothing. */
  onDismiss?: () => void;
  children: ReactNode;
}

export function Dialog({ label, wide, onDismiss, children }: DialogProps) {
  return (
    <div className="overlay" onClick={onDismiss}>
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
