import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, FormProvider, useFieldArray, useWatch } from 'react-hook-form';
import {
  useVoucher, useCreateVoucher, useUpdateVoucher,
  useAddLine, useDeleteLine, useConvertToSales, useReloadSnapshots,
} from '../api/vouchers';
import { useCustomers } from '../api/customers';
import { useProjects } from '../api/projects';
import { useAggregationCategories } from '../api/aggregationCategories';
import VoucherHeader from '../components/voucher/VoucherHeader';
import LineItemRow from '../components/voucher/LineItemRow';
import ProfitRateBar from '../components/voucher/ProfitRateBar';
import TotalSummary from '../components/voucher/TotalSummary';
import type { VoucherType, VoucherStatus, TaxInputType, LineCategoryValue } from '../types/voucher';

export type VoucherFormValues = {
  voucher_type: VoucherType;
  status: VoucherStatus;
  customer_id: number;
  project_id: number | null;
  voucher_date: string;
  delivery_date: string | null;
  tax_input_type: TaxInputType;
  consumption_tax_type: string;
  override_billing_date: string | null;
  trade_type: string;
  description: string | null;
  profit_rate: number;
  memo: string | null;
  sales_category_id: number | null;
  validity_period: string | null;
  lines: LineFormValues[];
};

export type LineFormValues = {
  id?: number;
  line_no: number;
  line_type: 'normal' | 'discount' | 'subtotal';
  location_no: number | null;
  location_name: string | null;
  tategu_item_id: number | null;
  source_catalog_item_id: number | null;
  item_name: string | null;
  quantity: number;
  // 固定原価フィールド（後方互換）
  cost_body: number;
  cost_hardware: number;
  cost_glass: number;
  cost_factory_hours: number;
  cost_site_hours: number;
  cost_labor_rate: number;
  snapshot_loaded_at: string | null;
  // 固定売価フィールド（後方互換）
  price_body: number;
  price_hardware: number;
  price_glass: number;
  line_total: number;
  tax_category: string;
  memo: string | null;
  // 動的集計区分
  costs: LineCategoryValue[];
  prices: LineCategoryValue[];
};

export const defaultLine: LineFormValues = {
  line_no: 1,
  line_type: 'normal',
  location_no: null,
  location_name: null,
  tategu_item_id: null,
  source_catalog_item_id: null,
  item_name: null,
  quantity: 1,
  cost_body: 0,
  cost_hardware: 0,
  cost_glass: 0,
  cost_factory_hours: 0,
  cost_site_hours: 0,
  cost_labor_rate: 0,
  snapshot_loaded_at: null,
  price_body: 0,
  price_hardware: 0,
  price_glass: 0,
  line_total: 0,
  tax_category: 'taxable',
  memo: null,
  costs: [],
  prices: [],
};

const defaultValues: VoucherFormValues = {
  voucher_type: 'estimate',
  status: 'draft',
  customer_id: 0,
  project_id: null,
  voucher_date: new Date().toISOString().split('T')[0],
  delivery_date: null,
  tax_input_type: 'exclusive',
  consumption_tax_type: '課税',
  override_billing_date: null,
  trade_type: '掛売上',
  description: null,
  profit_rate: 0.3,
  memo: null,
  sales_category_id: null,
  validity_period: null,
  lines: [{ ...defaultLine }],
};

export default function VoucherEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get('readonly') === '1';
  const voucherId = id ? Number(id) : 0;
  const isNew = !id;

  const initProjectId  = searchParams.get('project_id') ? Number(searchParams.get('project_id')) : null;
  const initCustomerId = searchParams.get('customer_id') ? Number(searchParams.get('customer_id')) : null;
  const initType       = (searchParams.get('type') ?? 'estimate') as VoucherType;

  const { data: voucher, isLoading } = useVoucher(voucherId);
  const { data: customers = [] } = useCustomers();
  const { data: projects = [] } = useProjects();
  const { data: categories = [] } = useAggregationCategories();

  const createMutation = useCreateVoucher();
  const updateMutation = useUpdateVoucher(voucherId);
  const addLineMutation = useAddLine(voucherId);
  const deleteLineMutation = useDeleteLine(voucherId);
  const convertMutation = useConvertToSales(voucherId);
  const reloadMutation = useReloadSnapshots(voucherId);

  const form = useForm<VoucherFormValues>({
    defaultValues: {
      ...defaultValues,
      ...(isNew && initProjectId ? { project_id: initProjectId } : {}),
      ...(isNew && initCustomerId ? { customer_id: initCustomerId } : {}),
      ...(isNew ? { voucher_type: initType } : {}),
    },
  });
  const { control, handleSubmit, reset, watch } = form;

  const { fields, append, remove, swap } = useFieldArray({ control, name: 'lines' });
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (voucher) {
      reset({
        voucher_type: voucher.voucher_type,
        status: voucher.status,
        customer_id: voucher.customer_id,
        project_id: voucher.project_id,
        voucher_date: voucher.voucher_date,
        delivery_date: voucher.delivery_date,
        tax_input_type: voucher.tax_input_type,
        consumption_tax_type: voucher.consumption_tax_type,
        override_billing_date: voucher.override_billing_date,
        trade_type: (voucher as any).trade_type ?? '掛売上',
        description: (voucher as any).description ?? null,
        profit_rate: voucher.profit_rate,
        memo: voucher.memo,
        sales_category_id: (voucher as any).sales_category_id ?? null,
        validity_period: voucher.validity_period ?? null,
        lines: voucher.lines.map(l => ({
          id: l.id,
          line_no: l.line_no,
          line_type: l.line_type,
          location_no: l.location_no,
          location_name: l.location_name,
          tategu_item_id: l.tategu_item_id,
          source_catalog_item_id: l.source_catalog_item_id ?? null,
          item_name: l.item_name,
          quantity: l.quantity,
          cost_body: l.cost_body,
          cost_hardware: l.cost_hardware,
          cost_glass: l.cost_glass,
          cost_factory_hours: l.cost_factory_hours,
          cost_site_hours: l.cost_site_hours,
          cost_labor_rate: l.cost_labor_rate,
          snapshot_loaded_at: l.snapshot_loaded_at,
          price_body: l.price_body,
          price_hardware: l.price_hardware,
          price_glass: l.price_glass,
          line_total: l.line_total,
          tax_category: l.tax_category,
          memo: l.memo,
          costs: l.costs ?? [],
          prices: l.prices ?? [],
        })),
      });
    }
  }, [voucher, reset]);

  const watchedLines = useWatch({ control, name: 'lines' });
  const watchedTaxInputType = watch('tax_input_type');

  const canEdit = ['draft', 'submitted', 'approved'].includes(voucher?.status ?? '');
  const editBlockReason = voucher?.status === 'billed'
    ? '請求済み'
    : voucher?.status === 'void'
    ? '無効化済み'
    : null;

  const linesForCalc = (watchedLines ?? []).map(l => ({
    line_type: (l?.line_type ?? 'normal') as 'normal' | 'discount' | 'subtotal',
    line_total: l?.line_total ?? 0,
    tax_category: l?.tax_category ?? 'taxable',
  }));

  const costLinesForCalc = (watchedLines ?? []).map(l => ({
    costs: l?.costs ?? [],
    cost_labor_rate: l?.cost_labor_rate ?? 0,
    quantity: l?.quantity ?? 1,
    line_type: (l?.line_type ?? 'normal') as 'normal' | 'discount' | 'subtotal',
    line_total: l?.line_total ?? 0,
  }));

  async function onSubmit(data: VoucherFormValues) {
    const header = {
      voucher_type: data.voucher_type,
      status: data.status,
      customer_id: data.customer_id,
      project_id: data.project_id,
      voucher_date: data.voucher_date,
      delivery_date: data.delivery_date,
      tax_input_type: data.tax_input_type,
      consumption_tax_type: data.consumption_tax_type,
      override_billing_date: data.override_billing_date,
      trade_type: data.trade_type,
      description: data.description,
      profit_rate: data.profit_rate,
      memo: data.memo,
      sales_category_id: data.sales_category_id,
      validity_period: data.validity_period,
    };
    if (isNew) {
      const created = await createMutation.mutateAsync(header);
      navigate(`/vouchers/${created.id}`);
    } else {
      await updateMutation.mutateAsync(header);
      navigate('/vouchers');
    }
  }

  function handleAddLine() {
    const nextNo = (watchedLines?.length ?? 0) + 1;
    if (isNew) {
      append({ ...defaultLine, line_no: nextNo });
    } else {
      addLineMutation.mutate({ ...defaultLine, line_no: nextNo, voucher_id: voucherId } as any);
    }
  }

  function handleDuplicateLine() {
    if (selectedIdx === null) return;
    const src = watchedLines?.[selectedIdx];
    if (!src) return;
    const nextNo = (watchedLines?.length ?? 0) + 1;
    const dup = { ...src, id: undefined, line_no: nextNo };
    if (isNew) {
      append(dup);
    } else {
      addLineMutation.mutate({ ...dup, voucher_id: voucherId } as any);
    }
  }

  function handleInsertLine() {
    const insertAt = selectedIdx !== null ? selectedIdx + 1 : (watchedLines?.length ?? 0);
    const nextNo = insertAt + 1;
    if (isNew) {
      append({ ...defaultLine, line_no: nextNo });
    } else {
      addLineMutation.mutate({ ...defaultLine, line_no: nextNo, voucher_id: voucherId } as any);
    }
  }

  function handleMoveUp() {
    if (selectedIdx === null || selectedIdx === 0) return;
    swap(selectedIdx, selectedIdx - 1);
    setSelectedIdx(selectedIdx - 1);
  }

  function handleMoveDown() {
    const len = watchedLines?.length ?? 0;
    if (selectedIdx === null || selectedIdx >= len - 1) return;
    swap(selectedIdx, selectedIdx + 1);
    setSelectedIdx(selectedIdx + 1);
  }

  async function handleRemoveLine(index: number) {
    const lineId = watchedLines?.[index]?.id;
    if (!isNew && lineId) {
      deleteLineMutation.mutate(lineId);
    }
    remove(index);
  }

  if (!isNew && isLoading) return <div>読み込み中...</div>;

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutError = createMutation.error || updateMutation.error;

  const voucherTypeLabel = voucher?.voucher_type === 'estimate' ? '見積' : '売上';

  const moneyCategories = categories.filter(c => c.measure_type === 'money');
  const timeCategories  = categories.filter(c => c.measure_type === 'time');
  // 列数計算（行選択ラジオ含む）
  const totalCols = 4 + moneyCategories.length + 3 + moneyCategories.length + timeCategories.length + 7 + 1;

  return (
    <FormProvider {...form}>
      <div>
        {/* トップバー */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12, gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!isNew && (
              <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 'bold', color: '#334155' }}>
                {voucherTypeLabel} {voucher?.voucher_no ?? ''}
              </span>
            )}
            {isNew && (
              <span style={{ fontSize: 15, fontWeight: 'bold', color: '#334155' }}>伝票 新規作成</span>
            )}
            {isReadOnly && (
              <span style={{ fontSize: 11, padding: '2px 8px', background: '#f1f5f9', color: '#64748b', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                参照モード
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {isReadOnly && canEdit && (
              <button type="button" onClick={() => navigate(`/vouchers/${voucherId}`)} style={subBtnStyle}>
                編集
              </button>
            )}
            {isReadOnly && editBlockReason && (
              <span style={{ color: '#94a3b8', fontSize: 13, alignSelf: 'center' }}>
                編集できません（{editBlockReason}）
              </span>
            )}
            {!isReadOnly && !isNew && voucher?.voucher_type === 'estimate' && voucher.status !== 'void' && (
              <button type="button" onClick={async () => {
                if (!confirm('この見積を引用して売上伝票を新規作成します。よろしいですか？')) return;
                const created = await convertMutation.mutateAsync();
                navigate(`/vouchers/${created.id}`);
              }} style={convertBtnStyle} disabled={convertMutation.isPending}>
                {convertMutation.isPending ? '作成中...' : '引用して売上'}
              </button>
            )}
            {!isReadOnly && !isNew && (
              <button type="button" onClick={() => reloadMutation.mutate()} style={reloadBtnStyle}
                disabled={reloadMutation.isPending}>
                {reloadMutation.isPending ? '更新中...' : '原価再取得'}
              </button>
            )}
            <button type="button" style={subBtnStyle}
              onClick={() => window.print()}>
              プレビュー
            </button>
            <button type="button" onClick={() => navigate(-1)} style={subBtnStyle}>
              閉じる
            </button>
          </div>
        </div>

        {mutError && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fee2e2',
            color: '#dc2626', borderRadius: 6, fontSize: 14 }}>
            保存に失敗しました: {String(mutError)}
          </div>
        )}

        {/* 双方向トレース表示 */}
        {!isNew && voucher?.voucher_type === 'estimate' && (voucher.converted_sales?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 12, padding: '8px 14px', background: '#f0fdf4',
            color: '#166534', borderRadius: 6, fontSize: 13, border: '1px solid #bbf7d0' }}>
            この見積は以下の売上伝票に引用されています：
            {voucher.converted_sales!.map(s => (
              <span key={s.id} style={{ marginLeft: 8 }}>
                <button type="button" onClick={() => navigate(`/vouchers/${s.id}`)}
                  style={{ background: 'none', border: 'none', color: '#15803d', cursor: 'pointer',
                    textDecoration: 'underline', fontSize: 13, padding: 0 }}>
                  売上 {s.voucher_no}
                </button>
                {s.quoted_at && <span style={{ color: '#4ade80', marginLeft: 4 }}>（引用日: {s.quoted_at}）</span>}
              </span>
            ))}
          </div>
        )}

        {!isNew && voucher?.voucher_type === 'sales' && voucher.source_estimate_no && (
          <div style={{ marginBottom: 12, padding: '8px 14px', background: '#eff6ff',
            color: '#1e40af', borderRadius: 6, fontSize: 13, border: '1px solid #bfdbfe' }}>
            この売上は見積 {voucher.source_estimate_no} から引用されました
            {voucher.quoted_at && <span style={{ marginLeft: 8, color: '#3b82f6' }}>（引用日: {voucher.quoted_at}）</span>}
            {voucher.source_voucher_id && (
              <button type="button" onClick={() => navigate(`/vouchers/${voucher.source_voucher_id}`)}
                style={{ marginLeft: 8, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer',
                  textDecoration: 'underline', fontSize: 13, padding: 0 }}>
                見積を表示
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <VoucherHeader
            customers={customers}
            projects={projects}
            readOnly={isReadOnly}
          />

          <ProfitRateBar categories={categories} />

          {/* 明細行 */}
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button type="button" onClick={handleDuplicateLine}
                disabled={selectedIdx === null} style={rowOpBtnStyle}>建具複製</button>
              <button type="button" onClick={handleInsertLine} style={rowOpBtnStyle}>行を挿入</button>
              <button type="button" onClick={() => selectedIdx !== null && handleRemoveLine(selectedIdx)}
                disabled={selectedIdx === null} style={{ ...rowOpBtnStyle, color: '#ef4444', borderColor: '#fca5a5' }}>行を削除</button>
              <button type="button" onClick={handleMoveUp}
                disabled={selectedIdx === null || selectedIdx === 0} style={rowOpBtnStyle}>▲</button>
              <button type="button" onClick={handleMoveDown}
                disabled={selectedIdx === null || (watchedLines?.length ?? 0) - 1 === selectedIdx} style={rowOpBtnStyle}>▼</button>
            </div>
          )}
          <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: 16, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <Th>No</Th>
                  <Th>取付場所</Th>
                  <Th>内容</Th>
                  <Th>数量</Th>
                  {moneyCategories.map(c => (
                    <Th key={`ph-${c.code}`} style={{ borderLeft: moneyCategories[0].code === c.code ? '2px solid #bfdbfe' : undefined }}>
                      売値/{c.name}
                    </Th>
                  ))}
                  <Th right>単価</Th>
                  <Th right>金額</Th>
                  <Th>課税</Th>
                  {moneyCategories.map(c => (
                    <Th key={`ch-${c.code}`} style={{ borderLeft: moneyCategories[0].code === c.code ? '2px solid #d1fae5' : undefined }}>
                      原価/{c.name}
                    </Th>
                  ))}
                  {timeCategories.map(c => (
                    <Th key={`th-${c.code}`}>{c.name}(h)</Th>
                  ))}
                  <Th>労務単価</Th>
                  <Th right>労務費</Th>
                  <Th right>材料原価</Th>
                  <Th right>製造原価</Th>
                  <Th right>利益</Th>
                  <Th right>利益率</Th>
                  <Th right>粗利率</Th>
                  <Th right>日割粗利</Th>
                  <Th>選択</Th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <LineItemRow
                    key={field.id}
                    index={index}
                    onRemove={() => handleRemoveLine(index)}
                    readOnly={isReadOnly}
                    selected={selectedIdx === index}
                    onSelect={() => setSelectedIdx(index)}
                    categories={categories}
                    totalCols={totalCols}
                    voucherId={voucherId}
                    isNew={isNew}
                  />
                ))}
              </tbody>
            </table>
            {!isReadOnly && (
              <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
                <button type="button" onClick={handleAddLine} style={addLineBtnStyle}>
                  + 行を追加
                </button>
              </div>
            )}
          </div>

          {/* 合計 + ボタン */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <TotalSummary lines={linesForCalc} taxInputType={watchedTaxInputType} taxRate={0.10} costLines={costLinesForCalc} />
            <div style={{ display: 'flex', gap: 8 }}>
              {isReadOnly ? (
                <button type="button" onClick={() => navigate(-1)} style={cancelBtnStyle}>
                  ← 案件に戻る
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => navigate('/vouchers')} style={cancelBtnStyle}>
                    キャンセル
                  </button>
                  <button type="submit" disabled={isPending} style={submitBtnStyle}>
                    {isPending ? '保存中...' : '保存'}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </FormProvider>
  );
}

function Th({ children, right, style }: { children?: React.ReactNode; right?: boolean; style?: React.CSSProperties }) {
  return (
    <th style={{ padding: '8px 6px', textAlign: right ? 'right' : 'left', fontSize: 12,
      color: '#64748b', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
      ...style }}>
      {children}
    </th>
  );
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const submitBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const addLineBtnStyle: React.CSSProperties = {
  padding: '5px 14px', background: '#f8fafc', border: '1px dashed #94a3b8',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#64748b',
};
const convertBtnStyle: React.CSSProperties = {
  padding: '5px 12px', background: '#7c3aed', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const reloadBtnStyle: React.CSSProperties = {
  padding: '5px 12px', background: '#0891b2', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const subBtnStyle: React.CSSProperties = {
  padding: '5px 14px', background: '#f8fafc', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#475569',
};
const rowOpBtnStyle: React.CSSProperties = {
  padding: '4px 12px', background: '#f8fafc', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#475569',
};
