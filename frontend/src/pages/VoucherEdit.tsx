import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm, FormProvider, useFieldArray, useWatch } from 'react-hook-form';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  useVoucher, useCreateVoucher, useUpdateVoucher,
  useAddLine, useDeleteLine, useConvertToSales, useReloadSnapshots, useUpdateLine, useVoidVoucher,
} from '../api/vouchers';
import { api, ApiError } from '../api/client';
import { useCustomers } from '../api/customers';
import { useProjects } from '../api/projects';
import { useAggregationCategories } from '../api/aggregationCategories';
import VoucherHeader from '../components/voucher/VoucherHeader';
import LineItemRow from '../components/voucher/LineItemRow';
import ProfitRateBar from '../components/voucher/ProfitRateBar';
import VoidVoucherButton from '../components/voucher/VoidVoucherButton';
import TotalSummary from '../components/voucher/TotalSummary';
import { useSmartBack } from '../hooks/useSmartBack';
import { useAppSettings } from '../contexts/AppSettingsContext';
import type { Voucher, VoucherType, VoucherStatus, TaxInputType, LineCategoryValue } from '../types/voucher';
import { getVoucherEditBlockReason, getVoucherVoidBlockReason } from '../lib/voucherVoid';

export type VoucherFormValues = {
  voucher_type: VoucherType;
  status: VoucherStatus;
  // select要素のDOM値は常に文字列のため、フォーム内部では文字列として扱い送受信時にNumberへ変換する
  customer_id: string;
  project_id: string;
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
  customer_id: '0',
  project_id: '',
  voucher_date: new Date().toISOString().split('T')[0],
  delivery_date: null,
  tax_input_type: 'exclusive',
  consumption_tax_type: '外税/伝票計',
  override_billing_date: null,
  trade_type: '掛売上',
  description: null,
  profit_rate: 0.3,
  memo: null,
  sales_category_id: null,
  validity_period: null,
  lines: [{ ...defaultLine }],
};

const LEAVE_MESSAGE = '保存されていない変更があります。破棄して移動しますか？';
const HEADER_FIELDS = new Set<keyof VoucherFormValues>([
  'voucher_type', 'status', 'customer_id', 'project_id', 'voucher_date', 'delivery_date',
  'tax_input_type', 'consumption_tax_type', 'override_billing_date', 'trade_type', 'description',
  'profit_rate', 'memo', 'sales_category_id', 'validity_period',
]);

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unsaved';
type VoucherWriteResult = { updated_at?: string; voucher_updated_at?: string };

function toFormValues(voucher: Voucher): VoucherFormValues {
  return {
    voucher_type: voucher.voucher_type,
    status: voucher.status,
    customer_id: String(voucher.customer_id),
    project_id: voucher.project_id != null ? String(voucher.project_id) : '',
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
      id: l.id, line_no: l.line_no, line_type: l.line_type, location_no: l.location_no,
      location_name: l.location_name, tategu_item_id: l.tategu_item_id,
      source_catalog_item_id: l.source_catalog_item_id ?? null, item_name: l.item_name,
      quantity: l.quantity, cost_body: l.cost_body, cost_hardware: l.cost_hardware,
      cost_glass: l.cost_glass, cost_factory_hours: l.cost_factory_hours,
      cost_site_hours: l.cost_site_hours, cost_labor_rate: l.cost_labor_rate,
      snapshot_loaded_at: l.snapshot_loaded_at, price_body: l.price_body,
      price_hardware: l.price_hardware, price_glass: l.price_glass, line_total: l.line_total,
      tax_category: l.tax_category, memo: l.memo, costs: l.costs ?? [], prices: l.prices ?? [],
    })),
  };
}

function NavigationBlocker({ active, beforeLeave }: { active: boolean; beforeLeave: () => Promise<boolean> }) {
  const navigate = useNavigate();
  const activeRef = useRef(active);
  activeRef.current = active;
  const handlingRef = useRef(false);
  const bypassRef = useRef(false);
  const historyActionRef = useRef<'POP' | 'PUSH' | 'REPLACE'>('PUSH');
  const shouldBlock = useCallback(({ historyAction }: { historyAction: 'POP' | 'PUSH' | 'REPLACE' }) => {
    historyActionRef.current = historyAction;
    return !bypassRef.current && activeRef.current;
  }, []);
  const blocker = useBlocker(shouldBlock);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const location = blocker.location;
    const historyAction = historyActionRef.current;
    blocker.reset();
    if (handlingRef.current) return;
    handlingRef.current = true;
    void beforeLeave().then(leave => {
      if (!leave) {
        bypassRef.current = false;
        return;
      }
      bypassRef.current = true;
      if (historyAction === 'POP') navigate(-1);
      else navigate(location.pathname + location.search + location.hash);
    }).finally(() => {
      handlingRef.current = false;
    });
  }, [blocker, beforeLeave, navigate]);
  return null;
}

function OptionalNavigationBlocker({ active, beforeLeave }: { active: boolean; beforeLeave: () => Promise<boolean> }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  return dataRouter ? <NavigationBlocker active={active} beforeLeave={beforeLeave} /> : null;
}

export { getVoucherEditBlockReason };

/** R-0154: 実行中の保存（明細行のblur保存など）が終わるのを待ち、すべて成功したかを返す */
function settlePendingMutations(queryClient: QueryClient): Promise<boolean> {
  const cache = queryClient.getMutationCache();
  const pending = cache.getAll().filter(m => m.state.status === 'pending');
  return new Promise(resolve => {
    const check = () => {
      if (pending.some(m => m.state.status === 'pending')) return;
      unsubscribe();
      resolve(pending.every(m => m.state.status === 'success'));
    };
    const unsubscribe = cache.subscribe(check);
    check();
  });
}

/** R-0143 A-B-06: 'YYYY-MM-DD' を 'yyyy/mm/dd' に変換（不正値はそのまま返す） */
function formatDateSlash(dateStr?: string | null): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 10).replaceAll('-', '/');
}

function isStaleVoucherError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  return (error.body as { error?: unknown } | null)?.error === 'stale_voucher';
}

function formatSaveError(error: unknown): string {
  if (error instanceof ApiError) {
    const message = (error.body as { error?: unknown } | null)?.error;
    if (typeof message === 'string') return message;
    return `保存に失敗しました（HTTP ${error.status}）`;
  }
  return error instanceof Error ? error.message : String(error);
}

export default function VoucherEdit() {
  const { settings } = useAppSettings();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isReadOnly = searchParams.get('readonly') === '1';
  const voucherId = id ? Number(id) : 0;
  const isNew = !id;

  const initProjectIdParam  = searchParams.get('project_id');
  const initCustomerIdParam = searchParams.get('customer_id');
  const initProjectId  = initProjectIdParam ? Number(initProjectIdParam) : null;
  const initType       = (searchParams.get('type') ?? 'estimate') as VoucherType;

  const { data: voucher, isLoading, isFetchedAfterMount } = useVoucher(voucherId);
  const { data: customers = [] } = useCustomers();
  const { data: projects = [] } = useProjects();
  const { data: categories = [] } = useAggregationCategories();

  const projectFallbackId = voucher?.project_id ?? initProjectId;
  const closeGoBack = useSmartBack('/vouchers');
  const backToProjectGoBack = useSmartBack(projectFallbackId ? `/projects/${projectFallbackId}` : '/vouchers');

  const createMutation = useCreateVoucher();
  const updateMutation = useUpdateVoucher(voucherId);
  const addLineMutation = useAddLine(voucherId);
  const deleteLineMutation = useDeleteLine(voucherId);
  const convertMutation = useConvertToSales(voucherId);
  const reloadMutation = useReloadSnapshots(voucherId);
  const updateLineMutation = useUpdateLine(voucherId);
  const voidMutation = useVoidVoucher();

  const form = useForm<VoucherFormValues>({
    defaultValues: {
      ...defaultValues,
      ...(isNew && initProjectIdParam ? { project_id: initProjectIdParam } : {}),
      ...(isNew && initCustomerIdParam ? { customer_id: initCustomerIdParam } : {}),
      ...(isNew ? { voucher_type: initType } : {}),
      ...(isNew ? { lines: [{ ...defaultLine, cost_labor_rate: settings.defaultLaborRate }] } : {}),
    },
  });
  const { control, getValues, handleSubmit, reset, setValue, trigger, watch, formState: { isDirty } } = form;
  const queryClient = useQueryClient();

  const { fields, append, remove, swap } = useFieldArray({ control, name: 'lines' });
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const createdVoucherIdRef = useRef<number | null>(null);
  const savedNewLineCountRef = useRef(0);
  const initializedVoucherIdRef = useRef<number | null>(null);
  const queuedHeaderRef = useRef<ReturnType<typeof toHeader> | null>(null);
  const failedHeaderRef = useRef<ReturnType<typeof toHeader> | null>(null);
  const savingHeaderRef = useRef(false);
  const headerQueuePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const voucherUpdatedAtRef = useRef<string | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const staleRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [staleVoucher, setStaleVoucher] = useState<Voucher | null>(null);

  useEffect(() => {
    if (voucher && isFetchedAfterMount && initializedVoucherIdRef.current !== voucher.id) {
      reset(toFormValues(voucher));
      voucherUpdatedAtRef.current = voucher.updated_at ?? null;
      initializedVoucherIdRef.current = voucher.id;
    }
  }, [voucher, isFetchedAfterMount, reset]);

  useEffect(() => {
    if (isNew && initProjectIdParam && projects.some(project => String(project.id) === initProjectIdParam)) {
      setValue('project_id', initProjectIdParam);
    }
  }, [initProjectIdParam, isNew, projects, setValue]);

  useEffect(() => {
    if (isNew && initCustomerIdParam && customers.some(c => String(c.id) === initCustomerIdParam)) {
      setValue('customer_id', initCustomerIdParam);
    }
  }, [initCustomerIdParam, isNew, customers, setValue]);

  // R-0148: 新規伝票作成時、案件プルダウンで案件を選んだら得意先が未設定ならその案件の得意先を既定値として反映する
  const watchedProjectId = watch('project_id');
  useEffect(() => {
    if (!isNew || !watchedProjectId) return;
    const customerId = watch('customer_id');
    if (customerId !== '' && customerId !== '0') return;
    const project = projects.find(p => String(p.id) === watchedProjectId);
    if (project?.customer_id == null) return;
    setValue('customer_id', String(project.customer_id));
  }, [watchedProjectId, isNew, projects, watch, setValue]);

  const watchedLines = useWatch({ control, name: 'lines' });
  const watchedTaxInputType = watch('tax_input_type');

  const editBlockReason = getVoucherEditBlockReason(voucher);
  const canEdit = ['draft', 'submitted', 'approved'].includes(voucher?.status ?? '') && editBlockReason === null;

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

  function toHeader(data: VoucherFormValues) {
    return {
      voucher_type: data.voucher_type,
      status: data.status,
      customer_id: Number(data.customer_id),
      project_id: data.project_id ? Number(data.project_id) : null,
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
  }

  function enqueueVoucherWrite<T extends VoucherWriteResult>(write: (expectedUpdatedAt: string | null) => Promise<T>): Promise<T> {
    const result = writeQueueRef.current.then(async () => {
      if (staleRef.current) throw new Error('stale_voucher');
      try {
        const response = await write(voucherUpdatedAtRef.current);
        voucherUpdatedAtRef.current = response.voucher_updated_at ?? response.updated_at ?? voucherUpdatedAtRef.current;
        return response;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const body = error.body as { error?: string; voucher?: Voucher };
          if (body.error === 'stale_voucher' && body.voucher) {
            staleRef.current = true;
            queuedHeaderRef.current = null;
            failedHeaderRef.current = toHeader(getValues());
            setStaleVoucher(body.voucher);
            setSaveStatus('unsaved');
          }
        }
        throw error;
      }
    });
    writeQueueRef.current = result.then(() => undefined, () => undefined);
    return result;
  }

  function processHeaderQueue(): Promise<void> {
    if (savingHeaderRef.current) return headerQueuePromiseRef.current;
    savingHeaderRef.current = true;
    headerQueuePromiseRef.current = (async () => {
      while (queuedHeaderRef.current) {
        const header = queuedHeaderRef.current;
        queuedHeaderRef.current = null;
        setSaveStatus('saving');
        setSaveError(null);
        try {
          await enqueueVoucherWrite(expectedUpdatedAt => updateMutation.mutateAsync({
            ...header, expected_updated_at: expectedUpdatedAt ?? undefined,
          }));
          reset(getValues(), { keepValues: true });
          failedHeaderRef.current = null;
          setSavedAt(new Date());
          setSaveStatus('saved');
        } catch (error) {
          failedHeaderRef.current = header;
          queuedHeaderRef.current = null;
          setSaveError(error);
          setSaveStatus(staleRef.current ? 'unsaved' : 'error');
        }
      }
    })().finally(() => {
      savingHeaderRef.current = false;
    });
    return headerQueuePromiseRef.current;
  }

  async function queueHeaderSave() {
    if (isNew || isReadOnly || !canEdit) return;
    const valid = await trigger(['customer_id', 'voucher_date']);
    if (!valid) {
      queuedHeaderRef.current = null;
      setSaveStatus('unsaved');
      return;
    }
    const header = toHeader(getValues());
    queuedHeaderRef.current = header;
    void processHeaderQueue();
  }

  function handleHeaderBlur(event: React.FocusEvent<HTMLFormElement>) {
    const target = event.target as unknown as HTMLInputElement;
    if (target.tagName !== 'INPUT' || target.type === 'date' || !HEADER_FIELDS.has(target.name as keyof VoucherFormValues)) return;
    void queueHeaderSave();
  }

  function handleHeaderChange(event: React.ChangeEvent<HTMLFormElement>) {
    const target = event.target as unknown as HTMLInputElement | HTMLSelectElement;
    if (!HEADER_FIELDS.has(target.name as keyof VoucherFormValues)) return;
    if (target.tagName === 'SELECT' || (target as HTMLInputElement).type === 'date') {
      queueMicrotask(() => void queueHeaderSave());
    }
  }

  function retryHeaderSave() {
    if (failedHeaderRef.current) queuedHeaderRef.current = failedHeaderRef.current;
    void processHeaderQueue();
  }

  async function onSubmit(data: VoucherFormValues) {
    const header = toHeader(data);
    try {
      if (isNew) {
        if (createdVoucherIdRef.current === null) {
          const created = await createMutation.mutateAsync(header);
          createdVoucherIdRef.current = created.id;
        }
        const createdVoucherId = createdVoucherIdRef.current;
        for (let index = savedNewLineCountRef.current; index < data.lines.length; index++) {
          await addLineMutation.mutateAsync({ ...data.lines[index], voucher_id: createdVoucherId } as any);
          savedNewLineCountRef.current = index + 1;
        }
        navigate(`/vouchers/${createdVoucherId}`);
      } else {
        await enqueueVoucherWrite(expectedUpdatedAt => updateMutation.mutateAsync({
          ...header, expected_updated_at: expectedUpdatedAt ?? undefined,
        }));
        closeGoBack();
      }
    } catch {
      return;
    }
  }

  // R-0154 追加仕様2: 未保存の入力は保存してから取消の空判定へ進む。保存に失敗したら取消しない
  async function saveBeforeVoid(): Promise<boolean> {
    if (staleRef.current) return false;
    if (isDirty) {
      let saved = false;
      await handleSubmit(async data => {
        try {
          await enqueueVoucherWrite(expectedUpdatedAt => updateMutation.mutateAsync({
            ...toHeader(data), expected_updated_at: expectedUpdatedAt ?? undefined,
          }));
          saved = true;
        } catch {
          return;
        }
      })();
      if (!saved) return false;
    }
    return settlePendingMutations(queryClient);
  }

  const hasUnsavedChanges = isNew
    ? isDirty
    : saveStatus === 'saving' || saveStatus === 'error' || saveStatus === 'unsaved' || isDirty
      || addLineMutation.isPending || deleteLineMutation.isPending;

  async function beforeLeave(): Promise<boolean> {
    if (staleRef.current) return false;
    const valid = await trigger(['customer_id', 'voucher_date']);
    if (!valid) return window.confirm(LEAVE_MESSAGE);
    if (!isNew && isDirty && !savingHeaderRef.current) queuedHeaderRef.current = toHeader(getValues());
    await processHeaderQueue();
    await writeQueueRef.current;
    const mutationsSucceeded = await settlePendingMutations(queryClient);
    if (staleRef.current || failedHeaderRef.current || !mutationsSucceeded) return false;
    return true;
  }

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, staleVoucher]);

  function handleAddLine() {
    const nextNo = (watchedLines?.length ?? 0) + 1;
    if (isNew) {
      append({ ...defaultLine, line_no: nextNo, cost_labor_rate: settings.defaultLaborRate });
    } else {
      void enqueueVoucherWrite(expectedUpdatedAt => addLineMutation.mutateAsync({
        ...defaultLine, line_no: nextNo, cost_labor_rate: settings.defaultLaborRate,
        voucher_id: voucherId, expected_updated_at: expectedUpdatedAt ?? undefined,
      } as any)).catch(() => undefined);
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
      void enqueueVoucherWrite(expectedUpdatedAt => addLineMutation.mutateAsync({
        ...dup, voucher_id: voucherId, expected_updated_at: expectedUpdatedAt ?? undefined,
      } as any)).catch(() => undefined);
    }
  }

  function handleInsertLine() {
    const insertAt = selectedIdx !== null ? selectedIdx + 1 : (watchedLines?.length ?? 0);
    const nextNo = insertAt + 1;
    if (isNew) {
      append({ ...defaultLine, line_no: nextNo, cost_labor_rate: settings.defaultLaborRate });
    } else {
      void enqueueVoucherWrite(expectedUpdatedAt => addLineMutation.mutateAsync({
        ...defaultLine, line_no: nextNo, cost_labor_rate: settings.defaultLaborRate,
        voucher_id: voucherId, expected_updated_at: expectedUpdatedAt ?? undefined,
      } as any)).catch(() => undefined);
    }
  }

  function handleMoveUp() {
    if (selectedIdx === null || selectedIdx === 0) return;
    const moving = watchedLines?.[selectedIdx];
    const displaced = watchedLines?.[selectedIdx - 1];
    swap(selectedIdx, selectedIdx - 1);
    if (!isNew) {
      if (moving?.id) void saveLine(moving.id, { line_no: selectedIdx });
      if (displaced?.id) void saveLine(displaced.id, { line_no: selectedIdx + 1 });
    }
    setSelectedIdx(selectedIdx - 1);
  }

  function handleMoveDown() {
    const len = watchedLines?.length ?? 0;
    if (selectedIdx === null || selectedIdx >= len - 1) return;
    const moving = watchedLines?.[selectedIdx];
    const displaced = watchedLines?.[selectedIdx + 1];
    swap(selectedIdx, selectedIdx + 1);
    if (!isNew) {
      if (moving?.id) void saveLine(moving.id, { line_no: selectedIdx + 2 });
      if (displaced?.id) void saveLine(displaced.id, { line_no: selectedIdx + 1 });
    }
    setSelectedIdx(selectedIdx + 1);
  }

  async function handleRemoveLine(index: number) {
    const lineId = watchedLines?.[index]?.id;
    if (!isNew && lineId) {
      void enqueueVoucherWrite(expectedUpdatedAt => deleteLineMutation.mutateAsync({
        lineId, expected_updated_at: expectedUpdatedAt ?? undefined,
      })).catch(() => undefined);
    }
    remove(index);
  }

  async function saveLine(lineId: number, data: Record<string, unknown>) {
    try {
      await enqueueVoucherWrite(expectedUpdatedAt => updateLineMutation.mutateAsync({
        lineId,
        data: { ...data, expected_updated_at: expectedUpdatedAt ?? undefined },
      }));
    } catch { return; }
  }

  async function reloadLatestVoucher() {
    const latest = await api.get<Voucher>(`/vouchers/${voucherId}`);
    reset(toFormValues(latest));
    queryClient.setQueryData(['vouchers', voucherId], latest);
    voucherUpdatedAtRef.current = latest.updated_at ?? null;
    staleRef.current = false;
    failedHeaderRef.current = null;
    setStaleVoucher(null);
    setSaveError(null);
    setSaveStatus('idle');
  }

  async function performVoid(reason?: string) {
    await enqueueVoucherWrite(expectedUpdatedAt => voidMutation.mutateAsync({
      id: voucherId, reason, expected_updated_at: expectedUpdatedAt ?? undefined,
    }));
  }

  if (!isNew && isLoading) return <div>読み込み中...</div>;

  const isPending = createMutation.isPending || updateMutation.isPending || addLineMutation.isPending;
  const mutError = createMutation.error || updateMutation.error || addLineMutation.error;

  const voucherTypeLabel = voucher?.voucher_type === 'estimate' ? '見積' : '売上';

  const moneyCategories = categories.filter(c => c.measure_type === 'money');
  const timeCategories  = categories.filter(c => c.measure_type === 'time');
  // 列数計算（行選択ラジオ含む）
  const totalCols = 4 + moneyCategories.length + 3 + moneyCategories.length + timeCategories.length + 7 + 1;

  return (
    <FormProvider {...form}>
      <div>
        <OptionalNavigationBlocker active={hasUnsavedChanges} beforeLeave={beforeLeave} />
        {staleVoucher && (
          <div role="alert" style={staleAlertStyle}>
            <span>
              ほかで更新されています（最終更新: {staleVoucher.updated_at}）。再読み込みすると、この画面で保存されていない入力は失われます。
            </span>
            <button type="button" onClick={() => void reloadLatestVoucher()} style={subBtnStyle}>再読み込み</button>
          </div>
        )}
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
            {!isNew && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: voucher?.access_voucher_id != null ? '#eff6ff' : '#f0fdf4',
                color: voucher?.access_voucher_id != null ? '#1e40af' : '#166534',
                border: `1px solid ${voucher?.access_voucher_id != null ? '#bfdbfe' : '#bbf7d0'}`,
              }}>
                {voucher?.access_voucher_id != null ? 'Access由来' : 'Beaver作成'}
              </span>
            )}
            {!isNew && voucher?.access_voucher_id != null && (
              <span style={{ fontSize: 11, color: '#1e40af' }}>
                Access№ {voucher.access_voucher_id}
              </span>
            )}
            {!isNew && voucher?.last_synced_at && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                最終同期: {voucher.last_synced_at}
              </span>
            )}
            {!isNew && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                最終更新: {voucher?.updated_at}
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
              <button type="button" onClick={() => void enqueueVoucherWrite(expectedUpdatedAt => reloadMutation.mutateAsync({
                expected_updated_at: expectedUpdatedAt ?? undefined,
              })).catch(() => undefined)} style={reloadBtnStyle}
                disabled={reloadMutation.isPending}>
                {reloadMutation.isPending ? '更新中...' : '原価再取得'}
              </button>
            )}
            {!isNew && voucher && voucher.status !== 'void' && (
              <VoidVoucherButton voucherId={voucherId} beforeVoid={saveBeforeVoid} performVoid={performVoid} onDone={() => navigate('/vouchers')}
                blockReason={getVoucherVoidBlockReason(voucher)} />
            )}
            <button type="button" style={subBtnStyle}
              onClick={() => window.print()}>
              プレビュー
            </button>
            <button type="button" onClick={closeGoBack} style={subBtnStyle}>
              閉じる
            </button>
          </div>
        </div>

        {mutError && saveStatus !== 'error' && !isStaleVoucherError(mutError) && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fee2e2',
            color: '#dc2626', borderRadius: 6, fontSize: 14 }}>
            保存に失敗しました: {formatSaveError(mutError)}
          </div>
        )}

        {/* R-0143 A-B-06: 請求済みロック表示 */}
        {!isNew && voucher?.access_billed_flag === 1 && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fef2f2',
            color: '#991b1b', borderRadius: 6, fontSize: 14, border: '1px solid #fecaca' }}>
            Accessで請求済み（請求日 {formatDateSlash(voucher.access_billing_date)}）のため編集できません
          </div>
        )}

        {/* R-0143 A-B-06: Access側で確認待ち（競合の可能性あり） */}
        {!isNew && voucher?.sync_pending === 1 && (
          <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fffbeb',
            color: '#92400e', borderRadius: 6, fontSize: 14, border: '1px solid #fde68a' }}>
            Access で確認待ちです
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

        <form onSubmit={handleSubmit(onSubmit)} onBlurCapture={handleHeaderBlur} onChangeCapture={handleHeaderChange}>
          <VoucherHeader
            customers={customers}
            projects={projects}
            readOnly={isReadOnly || (!isNew && !canEdit)}
            onTaxInputTypeChange={() => queueMicrotask(() => void queueHeaderSave())}
          />

          <ProfitRateBar categories={categories} selectedIdx={selectedIdx} setSelectedIdx={setSelectedIdx} />

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
            {categories.length === 0 ? (
              <div role="alert" style={{ padding: 16, color: '#b45309', background: '#fffbeb' }}>
                集計区分が未同期のため明細を編集できません。設定画面から同期してください
              </div>
            ) : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                    isNew={isNew}
                    onSaveLine={saveLine}
                  />
                ))}
              </tbody>
            </table>}
            {!isReadOnly && categories.length > 0 && (
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!isNew && saveStatus === 'saving' && <span>保存中…</span>}
              {!isNew && saveStatus === 'saved' && savedAt && (
                <span>保存しました {savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {!isNew && saveStatus === 'unsaved' && <span>未保存の変更があります</span>}
              {!isNew && saveStatus === 'error' && (
                <span>
                  保存に失敗しました: {formatSaveError(saveError)}{' '}
                  <button type="button" onClick={retryHeaderSave} style={subBtnStyle}>再試行</button>
                </span>
              )}
              {isReadOnly ? (
                <button type="button" onClick={backToProjectGoBack} style={cancelBtnStyle}>
                  ← 案件に戻る
                </button>
              ) : isNew || !dataRouter ? (
                <>
                  <button type="button" onClick={closeGoBack} style={cancelBtnStyle}>
                    キャンセル
                  </button>
                  <button type="submit" disabled={isPending || voucher?.access_billed_flag === 1} style={submitBtnStyle}>
                    {isPending ? '保存中...' : '保存'}
                  </button>
                </>
              ) : null}
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
const staleAlertStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  marginBottom: 12, padding: '12px 16px', border: '2px solid #dc2626', borderRadius: 8,
  background: '#fef2f2', color: '#991b1b', fontWeight: 'bold',
};
const subBtnStyle: React.CSSProperties = {
  padding: '5px 14px', background: '#f8fafc', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#475569',
};
const rowOpBtnStyle: React.CSSProperties = {
  padding: '4px 12px', background: '#f8fafc', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#475569',
};
