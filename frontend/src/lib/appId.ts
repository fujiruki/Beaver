// R-0141: AppIDから本番/ベータ環境の設定値を導出する

export function resolveAppId(rawAppId: string | undefined): string {
  return rawAppId || 'Beaver';
}

export function resolveStoragePrefix(appId: string): string {
  return appId === 'Beaver' ? 'bv_' : `${appId}_`;
}

export const APP_ID = resolveAppId(import.meta.env.VITE_APP_ID);
export const APP_STORAGE_PREFIX = resolveStoragePrefix(APP_ID);
