import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useAggregationCategories, useSyncAggregationCategories } from '../api/aggregationCategories';
import { useMigrateFixedColumns } from '../api/vouchers';
import { useSyncStatus } from '../api/sync';

export default function AppSettings() {
  const navigate = useNavigate();
  const { settings, update } = useAppSettings();
  const { data: categories } = useAggregationCategories();
  const { data: syncStatus } = useSyncStatus();
  const syncMutation = useSyncAggregationCategories();
  const migrateMutation = useMigrateFixedColumns();
  const [migrateResult, setMigrateResult] = useState<{ migrated_costs: number; migrated_prices: number } | null>(null);

  const [presetInput, setPresetInput] = useState(
    settings.profitRatePresets.map(r => Math.round(r * 100)).join(', '),
  );

  const lastSynced = categories && categories.length > 0
    ? categories.reduce((latest, c) => c.synced_at > latest ? c.synced_at : latest, '')
    : null;

  function savePresets() {
    const parsed = presetInput
      .split(',')
      .map(s => parseFloat(s.trim()) / 100)
      .filter(n => !isNaN(n) && n > 0 && n < 1);
    if (parsed.length > 0) {
      update({ profitRatePresets: parsed });
    }
  }

  const fixedCostCols = ['cost_body', 'cost_hardware', 'cost_glass', 'cost_factory_hours', 'cost_site_hours'] as const;
  const fixedPriceCols = ['price_body', 'price_hardware', 'price_glass'] as const;
  const moneyCategories = (categories ?? []).filter(c => c.measure_type === 'money');
  const allCategories   = categories ?? [];

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold mb-6">アプリ設定</h1>

      <div className="bg-white rounded-lg shadow-sm p-5 space-y-5">
        {/* 文字サイズ */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">既定文字サイズ</label>
          <div className="flex items-center gap-3">
            <button onClick={() => update({ fontSize: settings.fontSize - 1 })}
              className="w-8 h-8 flex items-center justify-center border border-slate-300 rounded hover:bg-slate-50 text-slate-600">▼</button>
            <span className="w-16 text-center font-mono text-sm">{settings.fontSize} px</span>
            <button onClick={() => update({ fontSize: settings.fontSize + 1 })}
              className="w-8 h-8 flex items-center justify-center border border-slate-300 rounded hover:bg-slate-50 text-slate-600">▲</button>
            <span className="text-xs text-slate-400">（11〜20px）</span>
          </div>
        </div>

        {/* 1日の作業時間 */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">1日あたり作業時間</label>
          <div className="flex items-center gap-3">
            <button onClick={() => update({ hoursPerDay: settings.hoursPerDay - 1 })}
              className="w-8 h-8 flex items-center justify-center border border-slate-300 rounded hover:bg-slate-50 text-slate-600">▼</button>
            <span className="w-16 text-center font-mono text-sm">{settings.hoursPerDay} 時間</span>
            <button onClick={() => update({ hoursPerDay: settings.hoursPerDay + 1 })}
              className="w-8 h-8 flex items-center justify-center border border-slate-300 rounded hover:bg-slate-50 text-slate-600">▲</button>
            <span className="text-xs text-slate-400">（4〜12時間）</span>
          </div>
        </div>

        {/* 既定労務単価 */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">既定労務単価</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              step={100}
              value={settings.defaultLaborRate}
              onChange={e => update({ defaultLaborRate: Math.max(0, Number(e.target.value) || 0) })}
              className="w-32 px-2 py-1.5 border border-slate-300 rounded text-sm font-mono text-right"
            />
            <span className="text-sm text-slate-500">円／時間</span>
          </div>
        </div>

        {/* 利益率プリセット */}
        <div className="border-t border-slate-100 pt-4">
          <label className="block text-xs font-semibold text-slate-500 mb-2">利益率プリセット</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={presetInput}
              onChange={e => setPresetInput(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm font-mono"
              placeholder="10, 20, 25, 30, 35, 40"
            />
            <button
              onClick={savePresets}
              className="px-3 py-1.5 bg-slate-700 text-white rounded text-xs hover:bg-slate-800"
            >
              保存
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">カンマ区切りで % を入力（例: 10, 25, 30）</p>
        </div>

        {/* R-0143 A-B-06: AccessTategu連携の同期状態 */}
        <div className="border-t border-slate-100 pt-4">
          <h2 className="text-xs font-semibold text-slate-500 mb-2">AccessTategu連携</h2>
          <div className="text-xs text-slate-500 space-y-1">
            <div>同期先AppID: <span className="font-mono">{syncStatus?.app_id ?? '-'}</span></div>
            <div>最終同期時刻: {syncStatus?.last_synced_at ?? '未同期'}</div>
          </div>
        </div>

        {/* 売上種別 */}
        <div className="border-t border-slate-100 pt-4">
          <button
            onClick={() => navigate('/settings/sales-categories')}
            className="flex items-center justify-between w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded border border-slate-200"
          >
            <span>売上種別設定</span>
            <span className="text-slate-400">→</span>
          </button>
        </div>

        {/* 案件ステータス */}
        <div className="border-t border-slate-100 pt-4">
          <button
            onClick={() => navigate('/settings/project-statuses')}
            className="flex items-center justify-between w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded border border-slate-200"
          >
            <span>案件ステータス設定</span>
            <span className="text-slate-400">→</span>
          </button>
        </div>

        {/* 集計区分マスター */}
        <div className="border-t border-slate-100 pt-4">
          <h2 className="text-xs font-semibold text-slate-500 mb-3">集計区分マスター（catalog-system連携）</h2>
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {syncMutation.isPending ? '同期中...' : 'catalog-systemから同期'}
            </button>
            <span className="text-xs text-slate-400">
              {lastSynced ? `最終同期: ${lastSynced.slice(0, 16).replace('T', ' ')}` : '未同期'}
            </span>
          </div>

          {syncMutation.isError && (
            <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 rounded text-xs">
              {syncMutation.error instanceof Error ? syncMutation.error.message : '同期に失敗しました'}
            </div>
          )}

          {allCategories.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-200">
                  <th className="text-left pb-1 font-semibold">コード</th>
                  <th className="text-left pb-1 font-semibold">名称</th>
                  <th className="text-left pb-1 font-semibold">種別</th>
                </tr>
              </thead>
              <tbody>
                {allCategories.map(cat => (
                  <tr key={cat.code} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 pr-3 font-mono text-slate-500">{cat.code}</td>
                    <td className="py-1 pr-3">{cat.name}</td>
                    <td className="py-1 text-slate-400">{cat.measure_type === 'money' ? '金額' : '時間'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-slate-400">未同期です。「catalog-systemから同期」ボタンで取り込めます。</p>
          )}
        </div>

        {/* 固定列→カテゴリマッピング */}
        {allCategories.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-xs font-semibold text-slate-500 mb-1">旧データ移行マッピング</h2>
            <p className="text-xs text-slate-400 mb-3">固定列と集計区分コードの対応を設定し、一括移行を実行します。</p>
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => {
                  setMigrateResult(null);
                  migrateMutation.mutate(settings.columnMapping as unknown as Record<string, string>, {
                    onSuccess: (res) => setMigrateResult(res),
                  });
                }}
                disabled={migrateMutation.isPending}
                className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 disabled:opacity-50"
              >
                {migrateMutation.isPending ? '移行中...' : '旧データを一括移行'}
              </button>
              {migrateResult && (
                <span className="text-xs text-green-700">
                  原価: {migrateResult.migrated_costs}件、売値: {migrateResult.migrated_prices}件 を移行しました
                </span>
              )}
              {migrateMutation.isError && (
                <span className="text-xs text-red-600">移行に失敗しました</span>
              )}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-200">
                  <th className="text-left pb-1 font-semibold">固定列</th>
                  <th className="text-left pb-1 font-semibold">マッピング先コード</th>
                </tr>
              </thead>
              <tbody>
                {fixedCostCols.map(col => (
                  <tr key={col} className="border-b border-slate-100">
                    <td className="py-1 pr-3 font-mono text-slate-500">{col}</td>
                    <td className="py-1">
                      <select
                        value={settings.columnMapping[col]}
                        onChange={e => update({ columnMapping: { ...settings.columnMapping, [col]: e.target.value } })}
                        className="px-2 py-0.5 border border-slate-300 rounded text-xs w-full"
                      >
                        {allCategories.map(c => (
                          <option key={c.code} value={c.code}>{c.code} ({c.name})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {fixedPriceCols.map(col => (
                  <tr key={col} className="border-b border-slate-100">
                    <td className="py-1 pr-3 font-mono text-slate-500">{col}</td>
                    <td className="py-1">
                      <select
                        value={settings.columnMapping[col]}
                        onChange={e => update({ columnMapping: { ...settings.columnMapping, [col]: e.target.value } })}
                        className="px-2 py-0.5 border border-slate-300 rounded text-xs w-full"
                      >
                        {moneyCategories.map(c => (
                          <option key={c.code} value={c.code}>{c.code} ({c.name})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
