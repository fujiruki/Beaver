import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AppSettingsProvider, useAppSettings } from '../AppSettingsContext';

describe('AppSettingsContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorageの旧集計区分コードを新コードへ正規化する', () => {
    localStorage.setItem('bv_app_settings', JSON.stringify({
      columnMapping: {
        cost_body: 'body',
        cost_hardware: 'hardware',
        cost_glass: 'glass',
        cost_factory_hours: 'factory_hours',
        cost_site_hours: 'site_hours',
        price_body: '独自本体コード',
      },
    }));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppSettingsProvider>{children}</AppSettingsProvider>
    );
    const { result } = renderHook(() => useAppSettings(), { wrapper });

    expect(result.current.settings.columnMapping).toEqual({
      cost_body: 'MAIN',
      cost_hardware: 'HARDWARE',
      cost_glass: 'GLASS',
      cost_factory_hours: 'FACTORY_TIME',
      cost_site_hours: 'SITE_TIME',
      price_body: '独自本体コード',
      price_hardware: 'HARDWARE',
      price_glass: 'GLASS',
    });
  });
});
