import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { reloadOnStaleChunk } from '../lib/staleChunkReload';

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

  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <p>画面を読み込めませんでした。ページを再読み込みしてください。</p>
      <button type="button" onClick={() => window.location.reload()}>
        再読み込み
      </button>
    </main>
  );
}
