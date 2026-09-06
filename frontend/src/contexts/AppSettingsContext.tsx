import { createContext, useContext, useState } from 'react';
import { APP_STORAGE_PREFIX } from '../lib/appId';

export interface ColumnMapping {
  cost_body: string;
  cost_hardware: string;
  cost_glass: string;
  cost_factory_hours: string;
  cost_site_hours: string;
  price_body: string;
  price_hardware: string;
  price_glass: string;
}

export interface AppSettings {
  fontSize: number;
  hoursPerDay: number;
  defaultLaborRate: number;
  profitRatePresets: number[];
  columnMapping: ColumnMapping;
}

const KEY = `${APP_STORAGE_PREFIX}app_settings`;

const DEFAULT_COLUMN_MAPPING: ColumnMapping = {
  cost_body:          'MAIN',
  cost_hardware:      'HARDWARE',
  cost_glass:         'GLASS',
  cost_factory_hours: 'FACTORY_TIME',
  cost_site_hours:    'SITE_TIME',
  price_body:         'MAIN',
  price_hardware:     'HARDWARE',
  price_glass:        'GLASS',
};

const LEGACY_CATEGORY_CODES: Record<string, string> = {
  body:          'MAIN',
  hardware:      'HARDWARE',
  glass:         'GLASS',
  factory_hours: 'FACTORY_TIME',
  site_hours:    'SITE_TIME',
};

function normalizeColumnMapping(columnMapping: ColumnMapping): ColumnMapping {
  return Object.fromEntries(
    Object.entries(columnMapping).map(([key, value]) => [
      key,
      LEGACY_CATEGORY_CODES[value] ?? value,
    ]),
  ) as unknown as ColumnMapping;
}

const DEFAULTS: AppSettings = {
  fontSize: 14,
  hoursPerDay: 8,
  defaultLaborRate: 0,
  profitRatePresets: [0.10, 0.20, 0.25, 0.30, 0.35, 0.40],
  columnMapping: DEFAULT_COLUMN_MAPPING,
};

const AppSettingsContext = createContext<{
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}>({ settings: DEFAULTS, update: () => {} });

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(KEY);
    if (!saved) return DEFAULTS;
    const parsed = JSON.parse(saved);
    return {
      ...DEFAULTS,
      ...parsed,
      columnMapping: normalizeColumnMapping({
        ...DEFAULT_COLUMN_MAPPING,
        ...(parsed.columnMapping ?? {}),
      }),
      profitRatePresets: parsed.profitRatePresets ?? DEFAULTS.profitRatePresets,
    };
  });

  function update(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    next.fontSize    = Math.min(20, Math.max(11, next.fontSize));
    next.hoursPerDay = Math.min(12, Math.max(4, next.hoursPerDay));
    localStorage.setItem(KEY, JSON.stringify(next));
    setSettings(next);
  }

  return (
    <AppSettingsContext.Provider value={{ settings, update }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
