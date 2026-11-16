// Tells the main process when something is running, so closing the window doesn't stop it.
import { send } from '../lib/bridge.ts';
import { jobActivity } from '../features/file-batch/batch-store.ts';
import { recorderStore } from '../features/recording/recorder.ts';
import { transcriptionQueue } from '../features/transcription/transcription-queue.ts';

const isBusy = () => transcriptionQueue.get().jobs.length > 0 || recorderStore.get().status !== 'idle' || jobActivity.get().running > 0;

export function reportActivity() {
  let reported = false;
  const update = () => {
    const busy = isBusy();
    if (busy === reported) return;
    reported = busy;
    send('app:busy', busy);
  };
  [transcriptionQueue, recorderStore, jobActivity].forEach((store) => store.subscribe(update));
}
