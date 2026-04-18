import { setupWorker } from 'msw/browser';
import { isMockApiMode } from '@/lib/api-config';
import { handlers } from '@/mocks/handlers';

const worker = setupWorker(...handlers);

let workerStartPromise: Promise<void> | undefined;

export function enableMocking() {
  if (!isMockApiMode) {
    return Promise.resolve();
  }

  if (!workerStartPromise) {
    workerStartPromise = worker
      .start({
        onUnhandledRequest: 'bypass',
        serviceWorker: {
          url: '/mockServiceWorker.js',
        },
      })
      .then(() => undefined);
  }

  return workerStartPromise;
}
