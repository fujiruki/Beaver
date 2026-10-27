import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useTateguItem } from '../../api/tateguItems';
import type { AggregationCategoryMaster } from '../../api/aggregationCategories';
import type { TateguItem } from '../../types/tateguItem';
import { TateguCostLinesPanel, TateguLaborLinesPanel, type CostLineDraft, type LaborLineDraft } from '../TateguLineItemsPanel';

type Props = {
  isOpen: boolean;
  mode: 'create' | 'edit';
  itemId?: number | null;
  voucherLabel: string;
  lineNo: number;
  initialName: string;
  categories: AggregationCategoryMaster[];
  onClose: () => void;
  onApplied: (item: TateguItem) => void;
};

type ModalForm = { code: string | null; name: string; description: string; unit: string; cost_body: number; cost_hardware: number; cost_glass: number; cost_factory_hours: number; cost_site_hours: number; cost_labor_rate: number };
const empty: ModalForm = { code: null, name: '', description: '', unit: '', cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0 };

export default function ProductLedgerModal({ isOpen, mode, itemId, voucherLabel, lineNo, initialName, categories, onClose, onApplied }: Props) {
  const { data: loaded, isLoading } = useTateguItem(isOpen && mode === 'edit' ? Number(itemId) : 0);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ModalForm>({ ...empty, name: initialName });
  const [costLines, setCostLines] = useState<CostLineDraft[]>([]);
  const [laborLines, setLaborLines] = useState<LaborLineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setForm({ ...empty, name: initialName }); setCostLines([]); setLaborLines([]); setError('');
    } else if (loaded) {
      setForm({ code: loaded.code, name: loaded.name, description: loaded.description ?? '', unit: loaded.unit ?? '', cost_body: loaded.cost_body, cost_hardware: loaded.cost_hardware, cost_glass: loaded.cost_glass, cost_factory_hours: loaded.cost_factory_hours, cost_site_hours: loaded.cost_site_hours, cost_labor_rate: loaded.cost_labor_rate });
      setCostLines((loaded.cost_lines ?? []).map(({ category_code, name, quantity, unit_cost, amount, source, sort_order }) => ({ category_code, name, quantity, unit_cost, amount, source, sort_order })));
      setLaborLines((loaded.labor_lines ?? []).map(({ process_name, category_code, work_hours, labor_rate, amount, sort_order }) => ({ process_name, category_code, work_hours, labor_rate, amount, sort_order })));
      setError('');
    }
  }, [isOpen, mode, initialName, loaded]);

  const totals = useMemo(() => {
    const money = (code: string) => costLines.filter(l => l.category_code === code).reduce((s, l) => s + l.quantity * l.unit_cost, 0);
    const hours = (code: string) => laborLines.filter(l => l.category_code === code).reduce((s, l) => s + l.work_hours, 0);
    const lineLaborAmount = laborLines.reduce((s, l) => s + l.work_hours * l.labor_rate, 0);
    const allHours = hours('FACTORY_TIME') + hours('SITE_TIME');
    const hasCosts = costLines.length > 0;
    const hasLabor = laborLines.length > 0;
    const factory = hasLabor ? hours('FACTORY_TIME') : form.cost_factory_hours;
    const site = hasLabor ? hours('SITE_TIME') : form.cost_site_hours;
    const rate = allHours ? lineLaborAmount / allHours : form.cost_labor_rate;
    return { body: hasCosts ? money('MAIN') : form.cost_body, hardware: hasCosts ? money('HARDWARE') : form.cost_hardware, glass: hasCosts ? money('GLASS') : form.cost_glass, factory, site, rate, laborAmount: hasLabor ? lineLaborAmount : (factory + site) * rate };
  }, [costLines, laborLines, form]);
  const total = totals.body + totals.hardware + totals.glass + totals.laborAmount;

  if (!isOpen) return null;

  async function save() {
    if (!form.name.trim()) { setError('製品名は必須です'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...form, code: mode === 'create' ? null : form.code, description: form.description || null, unit: form.unit || null, memo: null, base_catalog_item_name: null, cost_body: totals.body, cost_hardware: totals.hardware, cost_glass: totals.glass, cost_factory_hours: totals.factory, cost_site_hours: totals.site, cost_labor_rate: totals.rate };
      const item = mode === 'create'
        ? await api.post<TateguItem>('/tategu-items', payload)
        : await api.put<TateguItem>(`/tategu-items/${itemId}`, payload);
      await api.put(`/tategu-items/${item.id}/cost-lines`, { lines: costLines.map((l, i) => ({ ...l, unit_cost: Math.round(l.unit_cost), amount: l.quantity * Math.round(l.unit_cost), sort_order: i })) });
      await api.put(`/tategu-items/${item.id}/labor-lines`, { lines: laborLines.map((l, i) => ({ ...l, labor_rate: Math.round(l.labor_rate), amount: l.work_hours * Math.round(l.labor_rate), sort_order: i })) });
      const applied: TateguItem = { ...item, ...payload, id: item.id, cost_body: totals.body, cost_hardware: totals.hardware, cost_glass: totals.glass, cost_factory_hours: totals.factory, cost_site_hours: totals.site, cost_labor_rate: totals.rate, cost_lines: costLines.map((l, i) => ({ ...l, id: 0, tategu_item_id: item.id, sort_order: i })), labor_lines: laborLines.map((l, i) => ({ ...l, id: 0, tategu_item_id: item.id, sort_order: i })) };
      queryClient.invalidateQueries({ queryKey: ['tateguItems'] });
      onApplied(applied);
      onClose();
    } catch (e) { setError(`保存に失敗しました: ${String(e)}`); }
    finally { setSaving(false); }
  }

  return <div role="dialog" aria-modal="true" style={overlayStyle} onClick={onClose}>
    <div style={modalStyle} onClick={e => e.stopPropagation()}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><div><strong>{voucherLabel}・明細{lineNo}</strong><h2 style={{ margin: '3px 0 0', fontSize: 20 }}>{mode === 'create' ? '製品台帳を新しく作る' : `製品台帳 ${form.code || '採番待ち'}を直す`}</h2></div><button type="button" onClick={onClose}>✕</button></header>
      <div style={{ padding: '8px 12px', background: '#eff6ff', color: '#1e40af', fontSize: 13, marginBottom: 12 }}>この保存は製品台帳を更新し、この伝票の明細{lineNo}だけに原価を反映します。他の伝票は変わりません。</div>
      {error && <div role="alert" style={{ padding: 8, background: '#fef2f2', color: '#b91c1c' }}>{error}</div>}
      {isLoading ? <p>読み込み中...</p> : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 250px', gap: 16, overflow: 'hidden' }}>
        <main style={{ overflowY: 'auto', paddingRight: 4 }}>
          <section style={sectionStyle}><div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px', gap: 10 }}><label>製品№<input value={form.code ?? '採番待ち'} readOnly style={fieldStyle} /></label><label>製品名<input aria-label="製品名" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={fieldStyle} /></label><label>単位<input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={fieldStyle} /></label></div><label>備考<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...fieldStyle, minHeight: 42 }} /></label></section>
          <section style={sectionStyle}><h3>材料費明細</h3><TateguCostLinesPanel lines={costLines} onChange={setCostLines} categories={categories} /></section>
          <section style={sectionStyle}><h3>労務費明細</h3><TateguLaborLinesPanel lines={laborLines} onChange={setLaborLines} categories={categories} /></section>
        </main>
        <aside style={{ ...sectionStyle, alignSelf: 'start', position: 'sticky', top: 0 }}><h3>製造原価</h3><strong style={{ fontSize: 25 }}>¥{Math.round(total).toLocaleString()}</strong><Summary label="本体" value={totals.body} /><Summary label="金物" value={totals.hardware} /><Summary label="ガラス" value={totals.glass} /><Summary label="労務" value={totals.laborAmount} /><hr /><div>工場 {totals.factory.toLocaleString()} h</div><div>現場 {totals.site.toLocaleString()} h</div><div>換算単価 ¥{Math.round(totals.rate).toLocaleString()}/h</div>{total === 0 && <p style={{ color: '#b45309' }}>原価が0円です</p>}</aside>
      </div>}
      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}><button type="button" onClick={onClose}>キャンセル</button><button type="button" onClick={save} disabled={saving} style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, padding: '9px 18px' }}>{saving ? '保存中...' : '保存して明細へ反映'}</button></footer>
    </div>
  </div>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><span>{label}</span><span>¥{Math.round(value).toLocaleString()}</span></div>; }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,.48)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalStyle: React.CSSProperties = { width: '90vw', maxWidth: 1180, height: '86vh', background: '#f8fafc', borderRadius: 12, padding: 18, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 12 };
const fieldStyle: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, border: '1px solid #cbd5e1', borderRadius: 5, padding: '6px 8px' };
