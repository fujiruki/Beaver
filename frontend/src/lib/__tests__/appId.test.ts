import { describe, expect, it } from 'vitest';
import { resolveAppId, resolveStoragePrefix } from '../appId';

describe('resolveAppId', () => {
  it('VITE_APP_ID未指定なら本番のBeaverになる', () => {
    expect(resolveAppId(undefined)).toBe('Beaver');
  });

  it('VITE_APP_ID指定時はその値を使う', () => {
    expect(resolveAppId('Beaver_beta')).toBe('Beaver_beta');
  });
});

describe('resolveStoragePrefix', () => {
  it('本番AppIDは既存のbv_プレフィックスを維持する（後方互換）', () => {
    expect(resolveStoragePrefix('Beaver')).toBe('bv_');
  });

  it('ベータAppIDはAppIDそのままのプレフィックスになる', () => {
    expect(resolveStoragePrefix('Beaver_beta')).toBe('Beaver_beta_');
  });
});
