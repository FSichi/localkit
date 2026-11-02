import { useState } from 'react';
import { t } from '../../../../shared/i18n/index.ts';
import { Tabs } from '../../ui/controls.tsx';
import { Page, PageHeader } from '../../ui/layout.tsx';
import { BatchQr } from './BatchQr.tsx';
import { SingleQr } from './SingleQr.tsx';

type QrMode = 'single' | 'batch';

const MODES: { id: QrMode; label: string }[] = [
  { id: 'single', label: t.qr.modes.single },
  { id: 'batch', label: t.qr.modes.batch },
];

export function QrPage() {
  const [mode, setMode] = useState<QrMode>('single');
  return (
    <Page>
      <PageHeader title={t.qr.title} subtitle={t.qr.subtitle} />
      <Tabs options={MODES} value={mode} onChange={setMode} />
      {mode === 'single' ? <SingleQr /> : <BatchQr />}
    </Page>
  );
}
