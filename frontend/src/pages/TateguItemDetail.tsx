import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTateguItem, useCreateTateguItem, useUpdateTateguItem, useUpdateCostBreakdown } from '../api/tateguItems';
import CatalogItemSelector from '../components/CatalogItemSelector';
import type { CatalogItem } from '../api/catalog';
import { fetchCatalogItemExport } from '../api/catalog';
import { api } from '../api/client';
import type { TateguItemInput } from '../types/tateguItem';
import { useAggregationCategories } from '../api/aggregationCategories';
import CostBreakdownPanel from '../components/CostBreakdownPanel';
import type { BreakdownDraft } from '../components/CostBreakdownPanel';

export default function TateguItemDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const itemId = id ? Number(id) : 0;
  const isNew  = !id;

  const { data: item, isLoading } = useTateguItem(itemId);
  const createMutation = useCreateTateguItem();
  const updateMutation = useUpdateTateguItem(itemId);
  const updateBreakdown = useUpdateCostBreakdown(itemId);
  const { data: categories } = useAggregationCategories();
  const [catalogSelectorOpen, setCatalogSelectorOpen] = useState(false);
  const [breakdownLines, setBreakdownLines] = useState<BreakdownDraft[]>([]);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TateguItemInput>({
    defaultValues: {
      cost_body: 0, cost_hardware: 0, cost_glass: 0,
      cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
      base_catalog_item_name: null,
    },
  });

  useEffect(() => {
    if (item) {
      reset(item);
      if (item.cost_breakdown) {
        setBreakdownLines(item.cost_breakdown.map(({ category_code, category_name, measure_type, value, sort_order }) => ({
          category_code, category_name, measure_type, value, sort_order,
        })));
      }
    }
  }, [item, reset]);

  const w = watch(['cost_body', 'cost_hardware', 'cost_glass', 'cost_factory_hours', 'cost_site_hours', 'cost_labor_rate']);
  const [cb, ch, cg, cfh, csh, clr] = w.map(v => Number(v) || 0);
  const totalCost = cb + ch + cg + (cfh + csh) * clr;

  const catalogName = watch('base_catalog_item_name');

  async function handleCatalogSelect(catalogItem: CatalogItem) {
    setValue('base_catalog_item_name', catalogItem.name);
    if (catalogItem.cost_body !== undefined) setValue('cost_body', catalogItem.cost_body);
    if (catalogItem.cost_hardware !== undefined) setValue('cost_hardware', catalogItem.cost_hardware);
    if (catalogItem.cost_glass !== undefined) setValue('cost_glass', catalogItem.cost_glass);

    try {
      const exportData = await fetchCatalogItemExport(catalogItem.id);
      const lines: BreakdownDraft[] = exportData.aggregations.map((a, i) => ({
        category_code: a.code,
        category_name: a.name,
        measure_type: a.measureType,
        value: a.total,
        sort_order: i,
      }));
      setBreakdownLines(lines);
      if (!isNew) {
        updateBreakdown.mutate(lines);
      }
    } catch { /* catalog-system が停止していても無視 */ }
  }

  async function onSubmit(data: TateguItemInput) {
    if (isNew) {
      const created = await createMutation.mutateAsync(data);
      if (breakdownLines.length > 0) {
        await api.put(`/tategu-items/${created.id}/cost-breakdown`, { lines: breakdownLines });
      }
    } else {
      await updateMutation.mutateAsync(data);
      await updateBreakdown.mutateAsync(breakdownLines);
    }
    navigate('/tategu');
  }

  if (!isNew && isLoading) return <div className="p-6">読み込み中...</div>;

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutError  = createMutation.error || updateMutation.error;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/tategu')} className="px-3 py-1 border border-slate-300 rounded text-sm text-slate-600 hover:bg-slate-50">
          ← 戻る
        </button>
        <h1 className="text-xl font-bold">{isNew ? '建具台帳 新規登録' : '建具台帳 編集'}</h1>
      </div>

      {mutError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          保存に失敗しました: {String(mutError)}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 基本情報 */}
        <section className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-500 mb-4">基本情報</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="品番コード *" error={errors.item_code?.message}>
              <input {...register('item_code', { required: '必須です' })} className={inputCls} />
            </Field>
            <Field label="品名 *" error={errors.name?.message}>
              <input {...register('name', { required: '必須です' })} className={inputCls} />
            </Field>
            <Field label="仕様">
              <input {...register('spec')} className={inputCls} />
            </Field>
            <Field label="単位">
              <input {...register('unit')} className={inputCls} placeholder="本・枚・組" />
            </Field>
          </div>
        </section>

        {/* 集計区分別原価 */}
        <section className="bg-white rounded-lg shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-slate-500">集計区分別原価</h2>
            <button
              type="button"
              onClick={() => setCatalogSelectorOpen(true)}
              className="px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50"
            >
              カタログから取り込み
            </button>
          </div>

          {catalogName && (
            <div className="mb-4 px-3 py-2 bg-blue-50 text-blue-700 rounded text-xs">
              コピー元: {catalogName}
            </div>
          )}

          <input type="hidden" {...register('base_catalog_item_name')} />

          <div className="grid grid-cols-3 gap-4">
            <Field label="本体材料費">
              <input {...register('cost_body', { valueAsNumber: true })} type="number" min="0" className={inputCls} />
            </Field>
            <Field label="金物材料費">
              <input {...register('cost_hardware', { valueAsNumber: true })} type="number" min="0" className={inputCls} />
            </Field>
            <Field label="ガラス材料費">
              <input {...register('cost_glass', { valueAsNumber: true })} type="number" min="0" className={inputCls} />
            </Field>
            <Field label="工場工数（h）">
              <input {...register('cost_factory_hours', { valueAsNumber: true })} type="number" min="0" step="0.5" className={inputCls} />
            </Field>
            <Field label="現場工数（h）">
              <input {...register('cost_site_hours', { valueAsNumber: true })} type="number" min="0" step="0.5" className={inputCls} />
            </Field>
            <Field label="労務単価（円/h）">
              <input {...register('cost_labor_rate', { valueAsNumber: true })} type="number" min="0" className={inputCls} />
            </Field>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded text-sm">
            <span className="text-slate-500">製造原価（概算）: </span>
            <span className="font-bold text-lg">¥{totalCost.toLocaleString()}</span>
            <span className="text-slate-400 ml-2 text-xs">
              材料 ¥{(cb+ch+cg).toLocaleString()} + 労務 ¥{((cfh+csh)*clr).toLocaleString()}
            </span>
          </div>
        </section>

        {/* 集計区分別内訳 */}
        <section className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-500 mb-3">集計区分別内訳</h2>
          <CostBreakdownPanel
            lines={breakdownLines}
            onChange={setBreakdownLines}
            laborRate={Number(watch('cost_labor_rate')) || 0}
            categories={categories ?? []}
          />
        </section>

        <Field label="備考">
          <textarea {...register('memo')} rows={2} className={`${inputCls} w-full resize-none`} />
        </Field>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate('/tategu')} className="px-4 py-2 bg-slate-100 text-slate-600 border border-slate-300 rounded-md text-sm hover:bg-slate-200">
            キャンセル
          </button>
          <button type="submit" disabled={isPending} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
            {isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </form>

      <CatalogItemSelector
        isOpen={catalogSelectorOpen}
        onClose={() => setCatalogSelectorOpen(false)}
        onSelect={handleCatalogSelect}
      />
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1 text-xs font-semibold text-slate-500">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-400';
