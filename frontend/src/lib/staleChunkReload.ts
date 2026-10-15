import { APP_ID } from './appId';

const RELOAD_INTERVAL_MS = 10_000;
const STORAGE_KEY = `${APP_ID}_chunk_reload_at`;
const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /chunkloaderror/i,
  /loading chunk .+ failed/i,
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : '';
}

export function reloadOnStaleChunk(error: unknown, isVitePreloadError = false): boolean {
  const isChunkLoadError = isVitePreloadError
    || DYNAMIC_IMPORT_ERROR_PATTERNS.some((pattern) => pattern.test(getErrorMessage(error)));
  if (!isChunkLoadError) return false;

  const now = Date.now();
  const previousReloadAt = Number(sessionStorage.getItem(STORAGE_KEY));
  if (previousReloadAt > 0 && now - previousReloadAt <= RELOAD_INTERVAL_MS) return false;

  sessionStorage.setItem(STORAGE_KEY, String(now));
  window.location.reload();
  return true;
}

export function installStaleChunkReloadHandler(): () => void {
  const handlePreloadError = (event: Event) => {
    event.preventDefault();
    const preloadEvent = event as Event & { payload?: unknown };
    reloadOnStaleChunk(preloadEvent.payload, true);
  };

  window.addEventListener('vite:preloadError', handlePreloadError);
  return () => window.removeEventListener('vite:preloadError', handlePreloadError);
}
