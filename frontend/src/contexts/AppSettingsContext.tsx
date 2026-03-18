import { createContext, useContext, useState } from 'react';

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
  profitRatePresets: number[];
  columnMapping: ColumnMapping;
}

const KEY = 'bv_app_settings';

const DEFAULT_COLUMN_MAPPING: ColumnMapping = {
  cost_body:          'body',
  cost_hardware:      'hardware',
  cost_glass:         'glass',
  cost_factory_hours: 'factory_hours',
  cost_site_hours:    'site_hours',
  price_body:         'body',
  price_hardware:     'hardware',
  price_glass:        'glass',
};

const DEFAULTS: AppSettings = {
  fontSize: 14,
  hoursPerDay: 8,
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
      columnMapping: { ...DEFAULT_COLUMN_MAPPING, ...(parsed.columnMapping ?? {}) },
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
