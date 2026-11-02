import { useEffect, useState } from 'react';
import type { ImageOptions } from '../../../../shared/jobs.ts';
import { invoke } from '../../lib/bridge.ts';

const DEBOUNCE_MS = 300;

/** Encodes the sample with the current options, debounced, to show the size it would end up with. */
export function useSizeEstimate(path: string | undefined, options: ImageOptions): number | null {
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    if (!path) {
      setBytes(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      invoke('images:estimate', path, options)
        .then((estimate) => current && setBytes(estimate))
        .catch(() => current && setBytes(null));
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [path, options]);

  return bytes;
}
