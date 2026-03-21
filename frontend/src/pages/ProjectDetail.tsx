import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useProject, useCreateProject, useUpdateProject, useUploadProjectImage, useDeleteProjectImage } from '../api/projects';
import { useCustomers } from '../api/customers';
import ComboSelect from '../components/ComboSelect';
import type { ComboOption } from '../components/ComboSelect';
import NewCustomerModal from '../components/NewCustomerModal';
import { useAppSettings } from '../contexts/AppSettingsContext';
import type { ProjectInput, ProjectStatus } from '../types/project';
import type { Customer } from '../types/customer';

const STATUS_OPTIONS: ProjectStatus[] = [
  '問い合わせ', '見積済', '受注済', '進行中', '納品済', '請求済', '完了',
];

const VOUCHER_STATUS_LABEL: Record<string, string> = {
  draft: '下書き', submitted: '提出済', approved: '承認済', billed: '請求済', void: '無効',
};

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const projectId = id ? Number(id) : 0;
  const isNew = !id;

  const { data: project, isLoading } = useProject(projectId);
  const { data: customers = [], refetch: refetchCustomers } = useCustomers();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(projectId);
  const uploadImageMutation = useUploadProjectImage(projectId);
  const deleteImageMutation = useDeleteProjectImage(projectId);
  const { settings } = useAppSettings();

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ProjectInput>({
    defaultValues: { status: '問い合わせ' },
  });

  useEffect(() => {
    if (project) {
      reset({
        customer_id: project.customer_id,
        name: project.name,
        description: project.description,
        status: project.status,
        start_date: project.start_date,
        end_date: project.end_date,
        delivery_date: project.delivery_date,
        address: project.address,
        memo: project.memo,
        order_date: project.order_date,
        owner_name: project.owner_name,
        general_contractor_name: project.general_contractor_name,
        site_contact: project.site_contact,
      });
      setCustomerId(project.customer_id);
    }
  }, [project, reset]);

  const customerOptions: ComboOption[] = customers.map(c => ({
    id: c.id,
    primaryText: c.name,
    secondaryText: c.memo ?? undefined,
    searchText: [c.name, c.name_kana, c.memo].filter(Boolean).join(' '),
  }));

  function handleCustomerChange(id: number | null) {
    setCustomerId(id);
    setValue('customer_id', id ?? 0);
  }

  async function handleCustomerCreated(customer: Customer) {
    await refetchCustomers();
    setCustomerId(customer.id);
    setValue('customer_id', customer.id);
    setModalOpen(false);
  }

  async function onSubmit(data: ProjectInput) {
    if (isNew) {
      await createMutation.mutateAsync(data);
    } else {
      await updateMutation.mutateAsync(data);
    }
    navigate('/projects');
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadImageMutation.mutateAsync(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!isNew && isLoading) return <div className="p-6">読み込み中...</div>;

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutError  = createMutation.error || updateMutation.error;

  const estimates = project?.vouchers?.filter(v => v.voucher_type === 'estimate') ?? [];
  const sales     = project?.vouchers?.filter(v => v.voucher_type === 'sales') ?? [];
  const images    = project?.images ?? [];

  const factoryDays = ((project?.estimated_factory_hours ?? 0) / settings.hoursPerDay).toFixed(1);
  const siteDays    = ((project?.estimated_site_hours ?? 0) / settings.hoursPerDay).toFixed(1);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/projects')} className="px-3 py-1 border border-slate-300 rounded text-sm text-slate-600 hover:bg-slate-50">
          ← 戻る
        </button>
        <h1 className="text-xl font-bold">{isNew ? '案件 新規登録' : '案件 編集'}</h1>
      </div>

      {mutError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          保存に失敗しました: {String(mutError)}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 基本情報 */}
        <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-600 border-b border-slate-100 pb-2">基本情報</h2>

          <div className="grid grid-cols-2 gap-4">
            {!isNew && (
              <Field label="案件コード">
                <div className="px-2.5 py-1.5 border border-slate-200 rounded-md text-sm font-mono bg-slate-50 text-slate-500">
                  {project?.project_code ?? '—'}
                </div>
              </Field>
            )}
            <Field label="案件名 *" error={errors.name?.message} className={isNew ? 'col-span-2' : ''}>
              <input {...register('name', { required: '必須です' })} className={inputCls} />
            </Field>
          </div>

          <Field label="得意先 *" error={errors.customer_id?.message}>
            <div className="flex gap-2">
              <div className="flex-1">
                <ComboSelect
                  options={customerOptions}
                  value={customerId}
                  onChange={handleCustomerChange}
                  placeholder="得意先を検索..."
                  headers={['得意先名', '備考']}
                />
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="px-3 py-1.5 text-xs bg-slate-100 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-200 whitespace-nowrap"
              >
                ＋ 新規得意先
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="ステータス">
              <select {...register('status')} className={inputCls}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="受注日">
              <input {...register('order_date')} type="date" className={inputCls} />
            </Field>

            <Field label="開始日">
              <input {...register('start_date')} type="date" className={inputCls} />
            </Field>
            <Field label="納品日">
              <input {...register('end_date')} type="date" className={inputCls} />
            </Field>
            <Field label="納期" className="col-span-2">
              <input {...register('delivery_date')} type="date" className={inputCls} />
            </Field>
          </div>

          <Field label="施主">
            <input {...register('owner_name')} className={`${inputCls} w-full`} />
          </Field>

          <Field label="元請">
            <input {...register('general_contractor_name')} className={`${inputCls} w-full`} />
          </Field>

          <Field label="連絡先">
            <input {...register('site_contact')} className={`${inputCls} w-full`} />
          </Field>

          <Field label="施工住所">
            <input {...register('address')} className={`${inputCls} w-full`} />
          </Field>

          <Field label="備考">
            <textarea {...register('memo')} rows={3} className={`${inputCls} w-full resize-none`} />
          </Field>
        </div>

        {/* 画像（編集時のみ） */}
        {!isNew && (
          <div className="bg-white rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-sm font-bold text-slate-600">画像</h2>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadImageMutation.isPending}
                className="px-3 py-1 text-xs bg-blue-50 border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
              >
                {uploadImageMutation.isPending ? 'アップロード中...' : '＋ 追加'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
            {images.length === 0 ? (
              <p className="text-sm text-slate-400">画像はまだありません</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {images.map(img => (
                  <div key={img.id} className="relative group">
                    <img
                      src={`/contents/Beaver/api/${img.file_path}`}
                      alt={img.file_name}
                      className="w-24 h-24 object-cover rounded border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => deleteImageMutation.mutate(img.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 保存ボタン */}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate('/projects')} className="px-4 py-2 bg-slate-100 text-slate-600 border border-slate-300 rounded-md text-sm hover:bg-slate-200">
            キャンセル
          </button>
          <button type="submit" disabled={isPending} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
            {isPending ? '保存中...' : '保存'}
          </button>
        </div>

        {/* 見積伝票（編集時のみ） */}
        {!isNew && (
          <div className="bg-white rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-sm font-bold text-slate-600">見積伝票</h2>
              <button
                type="button"
                onClick={() => navigate(`/vouchers/new?project_id=${projectId}&customer_id=${customerId ?? ''}&type=estimate`)}
                className="px-3 py-1 text-xs bg-blue-50 border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
              >
                ＋ 見積作成
              </button>
            </div>
            {estimates.length === 0 ? (
              <p className="text-sm text-slate-400">登録なし</p>
            ) : (
              <div className="space-y-1">
                {estimates.map(v => (
                  <div
                    key={v.id}
                    onClick={() => navigate(`/vouchers/${v.id}`)}
                    className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 cursor-pointer border border-slate-100"
                  >
                    <span className="font-mono text-sm text-slate-600 w-24 shrink-0">{v.voucher_no}</span>
                    <span className="text-xs text-slate-400 w-24 shrink-0">{v.voucher_date}</span>
                    <span className="text-xs text-slate-500 w-16 shrink-0">{VOUCHER_STATUS_LABEL[v.status] ?? v.status}</span>
                    <span className="text-xs text-slate-500 flex-1 truncate">{v.description ?? ''}</span>
                    <span className="text-sm text-right shrink-0">¥{v.total_amount.toLocaleString()}</span>
                    <span className="text-slate-400 text-xs">→</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 売上伝票（編集時のみ） */}
        {!isNew && (
          <div className="bg-white rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-sm font-bold text-slate-600">売上伝票</h2>
              <button
                type="button"
                onClick={() => navigate(`/vouchers/new?project_id=${projectId}&customer_id=${customerId ?? ''}&type=sales`)}
                className="px-3 py-1 text-xs bg-blue-50 border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
              >
                ＋ 売上作成
              </button>
            </div>
            {sales.length === 0 ? (
              <p className="text-sm text-slate-400">登録なし</p>
            ) : (
              <div className="space-y-1">
                {sales.map(v => (
                  <div
                    key={v.id}
                    onClick={() => navigate(`/vouchers/${v.id}`)}
                    className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 cursor-pointer border border-slate-100"
                  >
                    <span className="font-mono text-sm text-slate-600 w-24 shrink-0">{v.voucher_no}</span>
                    <span className="text-xs text-slate-400 w-24 shrink-0">{v.voucher_date}</span>
                    <span className="text-xs text-slate-500 w-16 shrink-0">{VOUCHER_STATUS_LABEL[v.status] ?? v.status}</span>
                    <span className="text-xs text-slate-500 flex-1 truncate">{v.description ?? ''}</span>
                    <span className="text-sm text-right shrink-0">¥{v.total_amount.toLocaleString()}</span>
                    <span className="text-slate-400 text-xs">→</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 工場・現場時間（編集時のみ） */}
        {!isNew && (
          <div className="bg-white rounded-lg shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-600 border-b border-slate-100 pb-2 mb-3">作業時間（見積合計）</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500 mb-1">工場時間</div>
                <div className="font-mono">{project?.estimated_factory_hours ?? 0} h = {factoryDays} 日</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">現場時間</div>
                <div className="font-mono">{project?.estimated_site_hours ?? 0} h = {siteDays} 日</div>
              </div>
            </div>
          </div>
        )}
      </form>

      <NewCustomerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCustomerCreated}
      />
    </div>
  );
}

function Field({ label, error, children, className = '' }: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block mb-1 text-xs font-semibold text-slate-500">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-400';
