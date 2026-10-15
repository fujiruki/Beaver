import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { isStaleChunkError, reloadOnStaleChunk } from '../lib/staleChunkReload';

export function RootErrorPage() {
  let routeError: unknown;
  try {
    routeError = useRouteError();
  } catch {
    routeError = undefined;
  }

  useEffect(() => {
    reloadOnStaleChunk(routeError);
  }, [routeError]);

  const message = isStaleChunkError(routeError)
    ? 'Beaverが新しくなったため、画面を読み込めませんでした。'
    : '画面を読み込めませんでした。ページを再読み込みしてください。';

  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <p>{message}</p>
      <button type="button" onClick={() => window.location.reload()}>
        再読み込み
      </button>
    </main>
  );
}
