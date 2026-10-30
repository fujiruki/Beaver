import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useProject, useCreateProject, useUpdateProject, useUploadProjectImage, useDeleteProjectImage, useHardDeleteProject } from '../api/projects';
import { useCustomers } from '../api/customers';
import { useProjectStatuses } from '../api/projectStatuses';
import ComboSelect from '../components/ComboSelect';
import type { ComboOption } from '../components/ComboSelect';
import NewCustomerModal from '../components/NewCustomerModal';
import CapacityCheckPanel from '../components/CapacityCheckPanel';
import YoukanLinkButton from '../components/YoukanLinkButton';
import ProjectSchedulesPanel from '../components/ProjectSchedulesPanel';
import HardDeleteProjectModal from '../components/HardDeleteProjectModal';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useSmartBack } from '../hooks/useSmartBack';
import type { ProjectInput, ProjectVoucher } from '../types/project';
import { APP_ID } from '../lib/appId';
import type { Customer } from '../types/customer';
import type { ProjectInput as ProjectUpdate } from '../types/project';
import type { ProjectSchedule, ProjectScheduleInput } from '../types/projectSchedule';
import UndoToast from '../components/history/UndoToast';
import { useCreateProjectScheduleFor, useDeleteProjectSchedule, useUpdateProjectSchedule } from '../api/projectSchedules';
import { businessDaysUntil } from '../lib/dandoriCalc';
import '../styles/projectDetail.css';

/** APIクライアントの `API error 409: {"error":"..."}` 形式からサーバのエラーメッセージ本文を取り出す */
function extractServerErrorMessage(err: unknown): string {
  const raw = String(err);
  const match = raw.match(/:\s*(\{.*\})$/s);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (typeof parsed?.error === 'string') return parsed.error;
    } catch {
      // JSON以外のボディはそのままフォールバック
    }
  }
  return raw;
}

const VOUCHER_STATUS_LABEL: Record<string, string> = {
  draft: '下書き', submitted: '提出済', approved: '承認済', billed: '請求済', void: '無効',
};

export default function ProjectDetail() {
  const navigate = useNavigate();
  const goBack = useSmartBack('/projects');
  const { id } = useParams<{ id: string }>();
  const projectId = id ? Number(id) : 0;
  const isNew = !id;

  const { data: project, isLoading } = useProject(projectId);
  const { data: customersData, refetch: refetchCustomers } = useCustomers();
  const customers = Array.isArray(customersData) ? customersData : [];
  const { data: projectStatuses = [] } = useProjectStatuses();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject(projectId);
  const uploadImageMutation = useUploadProjectImage(projectId);
  const deleteImageMutation = useDeleteProjectImage(projectId);
  const hardDeleteMutation = useHardDeleteProject();
  const { settings } = useAppSettings();

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hardDeleteModalOpen, setHardDeleteModalOpen] = useState(false);
  const [hardDeleteError, setHardDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProjectInput>({
    defaultValues: { status: '問い合わせ' },
  });
  const currentStatus = watch('status');
  const manualEstimatedHours = watch('manual_estimated_hours');

  useEffect(() => {
    if (project) {
      reset({
        customer_id: project.customer_id,
        name: project.name,
        description: project.description,
        status: project.status,
        end_date: project.end_date,
        delivery_date: project.delivery_date,
        address: project.address,
        memo: project.memo,
        order_date: project.order_date,
        owner_name: project.owner_name,
        general_contractor_name: project.general_contractor_name,
        site_contact: project.site_contact,
        manual_estimated_hours: project.manual_estimated_hours,
      });
      setCustomerId(project.customer_id);
    }
  }, [project, reset]);

  const customerOptions: ComboOption[] = customers.map(c => ({
    id: c.id,
    primaryText: c.name,
    secondaryText: c.memo ?? undefined,
    searchText: [c.name, c.name_kana, c.tel, c.mobile, c.address1, c.address2, c.memo].filter(Boolean).join(' '),
  }));

  function handleCustomerChange(id: number | null) {
    setCustomerId(id);
    setValue('customer_id', id ?? 0);
  }

  async function handleCustomerCreated(customer: Pick<Customer, 'id'>) {
    await refetchCustomers();
    setCustomerId(customer.id);
    setValue('customer_id', customer.id);
    setModalOpen(false);
  }

  async function onSubmit(data: ProjectInput) {
    if (isNew) {
      const created = await createMutation.mutateAsync(data);
      navigate(`/projects/${created.id}`);
    } else {
      await updateMutation.mutateAsync(data);
      goBack();
    }
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

  const selectedCustomer = customers.find(c => c.id === customerId) ?? null;
  const customerAddress = selectedCustomer ? [selectedCustomer.address1, selectedCustomer.address2].filter(Boolean).join('') : '';
  const customerPhone = selectedCustomer?.tel || selectedCustomer?.mobile || '';

  const estimates = project?.vouchers?.filter(v => v.voucher_type === 'estimate') ?? [];
  const sales     = project?.vouchers?.filter(v => v.voucher_type === 'sales') ?? [];
  const images    = project?.images ?? [];

  const factoryDays = ((project?.estimated_factory_hours ?? 0) / settings.hoursPerDay).toFixed(1);
  const siteDays    = ((project?.estimated_site_hours ?? 0) / settings.hoursPerDay).toFixed(1);

  // R-0097: 見積伝票集計工数（工場+現場）があればそれを優先し、無ければ手動入力を使う
  const voucherSumHours = (project?.estimated_factory_hours ?? 0) + (project?.estimated_site_hours ?? 0);
  const voucherSumDays  = (voucherSumHours / settings.hoursPerDay).toFixed(1);

  async function handleHardDeleteConfirm() {
    setHardDeleteError(null);
    try {
      await hardDeleteMutation.mutateAsync(projectId);
      goBack();
    } catch (err) {
      setHardDeleteError(extractServerErrorMessage(err));
    }
  }

  if (!isNew) return <ExistingProjectDetail projectId={projectId} goBack={goBack} />;

  return (
    <div className={isNew ? 'max-w-2xl' : 'w-full'}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={goBack} className={`px-3 py-1 border border-slate-300 text-sm text-slate-600 hover:border-blue-600 hover:bg-blue-50 ${isNew ? 'rounded' : 'rounded-none'}`}>
          ← 戻る
        </button>
        <h1 className="text-xl font-bold flex-1">{isNew ? '案件 新規登録' : '案件 編集'}</h1>
        <button
          type="button"
          aria-label="タイトル横保存"
          onClick={handleSubmit(onSubmit)}
          disabled={isPending}
          className={`px-4 py-1.5 bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 ${isNew ? 'rounded-md' : 'rounded-none'}`}
        >
          {isPending ? '保存中...' : '保存'}
        </button>
      </div>

      {mutError && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          保存に失敗しました: {String(mutError)}
        </div>
      )}

      {!isNew && (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-2 text-xs">
          <div className="grid grid-cols-1 min-[1100px]:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)] gap-2">
            <div data-testid="project-detail-left-column" className="space-y-2 min-w-0">
              <section data-testid="project-key-points" className={panelCls}>
                <h2 className={headingCls}>案件の要点</h2>
                <div className="grid grid-cols-2 border border-slate-300 [&>*]:p-2 [&>*]:border-b [&>*]:border-slate-300 [&>*:nth-child(odd)]:border-r">
                  <Field label="案件コード">
                    <div className={readOnlyCls}>{project?.project_code ?? '—'}</div>
                  </Field>
                  <Field label="案件名 *" error={errors.name?.message}>
                    <input {...register('name', { required: '必須です' })} className={inputCls} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="得意先 *" error={errors.customer_id?.message}>
                      <div className="flex [&_input]:!rounded-none [&_button]:!rounded-none">
                        <div className="flex-1">
                          <ComboSelect
                            options={customerOptions}
                            value={customerId}
                            onChange={handleCustomerChange}
                            placeholder="得意先を検索..."
                            headers={['得意先名', '備考']}
                          />
                        </div>
                        <button type="button" onClick={() => setModalOpen(true)} className={secondaryBtnCls}>
                          ＋ 新規得意先
                        </button>
                      </div>
                      {selectedCustomer && (
                        <div className="mt-1 flex items-start justify-between text-slate-500">
                          <div>
                            {customerAddress && <div>{customerAddress}</div>}
                            {customerPhone && <div><a href={`tel:${customerPhone}`} className="text-blue-600">{customerPhone}</a></div>}
                            {selectedCustomer.email && <div><a href={`mailto:${selectedCustomer.email}`} className="text-blue-600">{selectedCustomer.email}</a></div>}
                            {selectedCustomer.memo && <div>{selectedCustomer.memo}</div>}
                          </div>
                          <button
                            type="button"
                            onClick={() => window.open(`${import.meta.env.BASE_URL}customers/${selectedCustomer.id}`, '_blank')}
                            className={secondaryBtnCls}
                          >
                            得意先を編集
                          </button>
                        </div>
                      )}
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="ステータス">
                      <div className="flex">
                        {projectStatuses.map(status => (
                          <button
                            key={status.id}
                            type="button"
                            aria-label={status.name}
                            aria-pressed={currentStatus === status.name}
                            onClick={() => setValue('status', status.name)}
                            className={`${statusBtnCls} ${currentStatus === status.name ? 'bg-blue-600 text-white' : 'bg-white'}`}
                          >
                            {status.name}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <Field label="納期">
                    <input {...register('delivery_date')} type="date" className={dateInputCls} />
                  </Field>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-slate-500">作業時間（見積合計）</div>
                    <div className="grid grid-cols-2 gap-1 font-mono tabular-nums">
                      <span className="text-right">{Number(project?.estimated_factory_hours ?? 0).toFixed(1)} h</span>
                      <span className="text-right">{factoryDays} 日</span>
                      <span className="text-right">{Number(project?.estimated_site_hours ?? 0).toFixed(1)} h</span>
                      <span className="text-right">{siteDays} 日</span>
                    </div>
                  </div>
                  <div className="col-span-2 border-b-0">
                    <Field label="説明">
                      <textarea
                        aria-label="説明"
                        {...register('memo')}
                        rows={4}
                        className={`${inputCls} resize-y`}
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <ProjectSchedulesPanel projectId={projectId} />

              <VoucherPanel
                title="見積伝票"
                emptyText="登録なし"
                vouchers={estimates}
                onCreate={() => navigate(`/vouchers/new?project_id=${projectId}&customer_id=${customerId ?? ''}&type=estimate`)}
                onOpen={voucherId => navigate(`/vouchers/${voucherId}`)}
              />
              <VoucherPanel
                title="売上伝票"
                emptyText="登録なし"
                vouchers={sales}
                onCreate={() => navigate(`/vouchers/new?project_id=${projectId}&customer_id=${customerId ?? ''}&type=sales`)}
                onOpen={voucherId => navigate(`/vouchers/${voucherId}`)}
              />
            </div>

            <div data-testid="project-detail-right-column" className="space-y-2 min-w-0">
              <section data-testid="project-basic-info" className={panelCls}>
                <h2 className={headingCls}>基本情報</h2>
                <div className="grid grid-cols-2 border border-slate-300 [&>*]:p-2 [&>*]:border-b [&>*]:border-slate-300 [&>*:nth-child(odd)]:border-r">
                  <Field label="受注日">
                    <input {...register('order_date')} type="date" className={dateInputCls} />
                  </Field>
                  <Field label="納品日">
                    <input {...register('end_date')} type="date" className={dateInputCls} />
                  </Field>
                  <div className="col-span-2">
                    <Field label="工数目安（h）">
                      {voucherSumHours > 0 ? (
                        <div className={readOnlyCls}>見積伝票から自動計算: {voucherSumHours}時間（{voucherSumDays}日）</div>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          <input
                            type="number"
                            step="0.1"
                            aria-label="工数目安（h）"
                            {...register('manual_estimated_hours', { valueAsNumber: true })}
                            className={hoursInputCls}
                          />
                          <span>{((Number(manualEstimatedHours) || 0) / settings.hoursPerDay).toFixed(1)}日</span>
                          <button
                            type="button"
                            onClick={() => setValue('manual_estimated_hours', 4, { shouldDirty: true })}
                            className={quickHoursBtnCls}
                          >
                            4h
                          </button>
                          {QUICK_HOURS_DAYS.map(days => (
                            <button
                              key={days}
                              type="button"
                              onClick={() => setValue('manual_estimated_hours', days * settings.hoursPerDay, { shouldDirty: true })}
                              className={quickHoursBtnCls}
                            >
                              {days}日
                            </button>
                          ))}
                        </div>
                      )}
                    </Field>
                  </div>
                  <Field label="施主"><input {...register('owner_name')} className={inputCls} /></Field>
                  <Field label="元請"><input {...register('general_contractor_name')} className={inputCls} /></Field>
                  <Field label="連絡先"><input {...register('site_contact')} className={inputCls} /></Field>
                  <Field label="施工住所"><input {...register('address')} className={inputCls} /></Field>
                </div>
              </section>

              <section className={panelCls}>
                <div className={`${headingCls} flex items-center justify-between`}>
                  <h2>画像</h2>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadImageMutation.isPending}
                    className={primaryBtnCls}
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
                {images.length === 0 ? <p className="p-2 text-slate-400">画像はまだありません</p> : (
                  <div className="flex flex-wrap gap-1 p-2">
                    {images.map(image => (
                      <div key={image.id} className="relative group">
                        <img src={`/contents/${APP_ID}/api/${image.file_path}`} alt={image.file_name} className="w-24 h-24 object-cover border" />
                        <button
                          type="button"
                          onClick={() => deleteImageMutation.mutate(image.id)}
                          className="absolute top-0 right-0 bg-red-600 text-white px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <CapacityCheckPanel projectId={projectId} />
              <div className={panelCls}><YoukanLinkButton projectId={projectId} /></div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={goBack} className={secondaryBtnCls}>キャンセル</button>
            <button type="submit" disabled={isPending} className={primaryBtnCls}>
              {isPending ? '保存中...' : '保存'}
            </button>
          </div>

          <section className="border border-red-200 bg-white p-2 rounded-none">
            <h2 className="text-xs font-bold text-red-600 border-b border-red-100 pb-1 mb-2">危険な操作</h2>
            <p className="text-xs text-slate-500 mb-2">
              この案件を伝票・明細も含めて完全に削除します。請求書に紐づく伝票がある場合は実行できません。
            </p>
            <button
              type="button"
              onClick={() => { setHardDeleteError(null); setHardDeleteModalOpen(true); }}
              className="px-3 h-6 bg-red-600 text-white text-xs hover:bg-red-700 rounded-none"
            >
              完全削除
            </button>
          </section>
        </form>
      )}

      {isNew && (
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* 基本情報 */}
        <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-600 border-b border-slate-100 pb-2">基本情報</h2>

          <div className={isNew ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-[140px_1fr] gap-4'}>
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
            {selectedCustomer && (
              <div className="mt-1.5 flex items-start justify-between gap-2 text-xs text-slate-500">
                <div className="space-y-0.5">
                  {customerAddress && <div>{customerAddress}</div>}
                  {customerPhone && (
                    <div><a href={`tel:${customerPhone}`} className="text-blue-600 hover:underline">{customerPhone}</a></div>
                  )}
                  {selectedCustomer.email && (
                    <div><a href={`mailto:${selectedCustomer.email}`} className="text-blue-600 hover:underline">{selectedCustomer.email}</a></div>
                  )}
                  {selectedCustomer.memo && <div>{selectedCustomer.memo}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => window.open(`${import.meta.env.BASE_URL}customers/${selectedCustomer.id}`, '_blank')}
                  className="px-2 py-1 text-xs bg-slate-100 border border-slate-300 rounded-md text-slate-600 hover:bg-slate-200 whitespace-nowrap"
                >
                  得意先を編集
                </button>
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="ステータス" className="col-span-2">
              <div className="flex items-start">
                {projectStatuses.map((s, idx) => {
                  const isActive = currentStatus === s.name;
                  return (
                    <div key={s.id} className={`flex items-center ${idx < projectStatuses.length - 1 ? 'flex-1' : ''}`}>
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          aria-pressed={isActive}
                          aria-label={s.name}
                          onClick={() => setValue('status', s.name)}
                          className={`w-6 h-6 rounded-full border-2 shrink-0 transition-colors ${
                            isActive ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                          }`}
                        />
                        <span className={`mt-1 text-[10px] whitespace-nowrap ${isActive ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                          {s.name}
                        </span>
                      </div>
                      {idx < projectStatuses.length - 1 && (
                        <div className="flex-1 h-0.5 bg-slate-200 mt-3" />
                      )}
                    </div>
                  );
                })}
              </div>
            </Field>
            <Field label="受注日">
              <input {...register('order_date')} type="date" className={dateInputCls} />
            </Field>

            <Field label="納品日">
              <input {...register('end_date')} type="date" className={dateInputCls} />
            </Field>
            <Field label="納期" className="col-span-2">
              <input {...register('delivery_date')} type="date" className={dateInputCls} />
            </Field>
          </div>

          <Field label="工数目安（h）">
            {voucherSumHours > 0 ? (
              <div className="inline-block px-2.5 py-1.5 border border-slate-200 rounded-md text-sm bg-slate-50 text-slate-600">
                見積伝票から自動計算: {voucherSumHours}時間（{voucherSumDays}日）
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number"
                  step="0.1"
                  aria-label="工数目安（h）"
                  {...register('manual_estimated_hours', { valueAsNumber: true })}
                  className={hoursInputCls}
                />
                <span className="text-sm text-slate-500">
                  {((Number(manualEstimatedHours) || 0) / settings.hoursPerDay).toFixed(1)}日
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setValue('manual_estimated_hours', 4, { shouldDirty: true })}
                    className={quickHoursBtnCls}
                  >
                    4h
                  </button>
                  {QUICK_HOURS_DAYS.map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setValue('manual_estimated_hours', days * settings.hoursPerDay, { shouldDirty: true })}
                      className={quickHoursBtnCls}
                    >
                      {days}日
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>

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
                      src={`/contents/${APP_ID}/api/${img.file_path}`}
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
          <button type="button" onClick={goBack} className="px-4 py-2 bg-slate-100 text-slate-600 border border-slate-300 rounded-md text-sm hover:bg-slate-200">
            キャンセル
          </button>
          <button type="submit" disabled={isPending} className="px-5 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50">
            {isPending ? '保存中...' : '保存'}
          </button>
        </div>

        {!isNew && <ProjectSchedulesPanel projectId={projectId} />}

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

        {/* Youkan容量判定（編集時のみ、R-0118） */}
        {!isNew && <CapacityCheckPanel projectId={projectId} />}

        {/* Youkanで見る（編集時のみ、R-0130） */}
        {!isNew && (
          <div className="bg-white rounded-lg shadow-sm p-5">
            <YoukanLinkButton projectId={projectId} />
          </div>
        )}

        {/* 完全削除（編集時のみ、R-0095） */}
        {!isNew && (
          <div className="bg-white rounded-lg shadow-sm p-5 border border-red-200">
            <h2 className="text-sm font-bold text-red-600 border-b border-red-100 pb-2 mb-3">危険な操作</h2>
            <p className="text-xs text-slate-500 mb-3">
              この案件を伝票・明細も含めて完全に削除します。請求書に紐づく伝票がある場合は実行できません。
            </p>
            <button
              type="button"
              onClick={() => { setHardDeleteError(null); setHardDeleteModalOpen(true); }}
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-bold hover:bg-red-700"
            >
              完全削除
            </button>
          </div>
        )}
      </form>
      )}

      <NewCustomerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCustomerCreated}
      />

      <HardDeleteProjectModal
        isOpen={hardDeleteModalOpen}
        isPending={hardDeleteMutation.isPending}
        errorMessage={hardDeleteError}
        onClose={() => setHardDeleteModalOpen(false)}
        onConfirm={handleHardDeleteConfirm}
      />
    </div>
  );
}

type SaveState = 'saved' | 'saving' | 'error';
type UndoAction = { message: string; run: () => Promise<unknown> };

function ExistingProjectDetail({ projectId, goBack }: { projectId: number; goBack: () => void }) {
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(projectId);
  const { data: customers = [], refetch: refetchCustomers } = useCustomers();
  const { data: projectStatuses = [] } = useProjectStatuses();
  const updateProject = useUpdateProject(projectId);
  const uploadImage = useUploadProjectImage(projectId);
  const deleteImage = useDeleteProjectImage(projectId);
  const hardDelete = useHardDeleteProject();
  const deleteSchedule = useDeleteProjectSchedule();
  const updateSchedule = useUpdateProjectSchedule();
  const createSchedule = useCreateProjectScheduleFor();
  const { settings } = useAppSettings();
  const [values, setValues] = useState<Partial<ProjectUpdate>>({});
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeleteError, setHardDeleteError] = useState<string | null>(null);
  const initializedId = useRef(0);
  const requestIds = useRef<Record<string, number>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!project || initializedId.current === project.id) return;
    initializedId.current = project.id;
    setValues(project);
  }, [project]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState !== 'saving') return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [saveState]);

  if (isLoading || !project) return <div className="p-6">読み込み中...</div>;

  const customerList = Array.isArray(customers) ? customers : [];
  const selectedCustomer = customerList.find(customer => customer.id === values.customer_id) ?? null;
  const estimates = project.vouchers?.filter(voucher => voucher.voucher_type === 'estimate') ?? [];
  const sales = project.vouchers?.filter(voucher => voucher.voucher_type === 'sales') ?? [];
  const voucherHours = (project.estimated_factory_hours ?? 0) + (project.estimated_site_hours ?? 0);
  const dueDays = businessDaysUntil(String(values.delivery_date ?? ''), new Date().toLocaleDateString('sv-SE'));

  function change<K extends keyof ProjectUpdate>(key: K, value: ProjectUpdate[K]) {
    setValues(current => ({ ...current, [key]: value }));
  }

  async function saveField<K extends keyof ProjectUpdate>(
    key: K,
    value: ProjectUpdate[K],
    label: string,
    previous = values[key],
    showUndo = true,
    force = false,
  ) {
    if ((key === 'name' && !String(value ?? '').trim()) || (key === 'customer_id' && !value)) return;
    if (!force && value === previous) return;
    const requestId = (requestIds.current[String(key)] ?? 0) + 1;
    requestIds.current[String(key)] = requestId;
    setSaveState('saving');
    try {
      await updateProject.mutateAsync({ [key]: value } as Partial<ProjectUpdate>);
      if (requestIds.current[String(key)] !== requestId) return;
      setSaveState('saved');
      if (showUndo) {
        setUndo({
          message: `${label}を変更しました`,
          run: async () => {
            change(key, previous as ProjectUpdate[K]);
            await saveField(key, previous as ProjectUpdate[K], label, value, false);
          },
        });
      }
    } catch {
      if (requestIds.current[String(key)] === requestId) setSaveState('error');
    }
  }

  function textField(key: keyof ProjectUpdate, label: string, multiline = false) {
    const value = String(values[key] ?? '');
    const props = {
      'aria-label': label,
      className: 'pd-control',
      value,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(key, event.target.value as never),
      onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        saveField(key, event.target.value as never, label, project![key] as never),
    };
    return multiline ? <textarea {...props} rows={2} /> : <input {...props} />;
  }

  function showScheduleUndo(message: string, run: () => Promise<unknown>) {
    setUndo({ message, run });
  }

  function scheduleInput(schedule: ProjectSchedule): ProjectScheduleInput {
    return {
      kind: schedule.kind,
      name: schedule.name,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      hours: schedule.hours,
      memo: schedule.memo,
      done: schedule.done,
    };
  }

  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    for (const file of Array.from(event.target.files ?? [])) await uploadImage.mutateAsync(file);
    event.target.value = '';
  }

  const customerOptions: ComboOption[] = customerList.map(customer => ({
    id: customer.id,
    primaryText: customer.name,
    secondaryText: customer.memo ?? undefined,
    searchText: [customer.name, customer.name_kana, customer.tel, customer.mobile, customer.address1, customer.address2].filter(Boolean).join(' '),
  }));

  return (
    <form className="pd-shell" noValidate>
      <header className="pd-topbar">
        <button type="button" className="pd-link" onClick={goBack}>← 戻る</button>
        <h1 className="pd-title">案件 編集</h1>
        <span className="pd-spacer" />
        <span className={`pd-save-status pd-save-${saveState}`}>
          {saveState === 'saved' && '保存済'}
          {saveState === 'saving' && '保存中…'}
          {saveState === 'error' && <>保存できませんでした［<button type="button" onClick={() => location.reload()}>再試行</button>］</>}
        </span>
      </header>

      <div className="pd-layout">
        <div className="pd-column" data-testid="project-detail-left-column">
          <section className="pd-panel" data-testid="project-key-points">
            <h2 className="pd-panel-title">案件の要点</h2>
            <div className="pd-key-grid">
              <div className="pd-cell pd-readonly"><span className="pd-label">案件コード</span><span className="pd-value pd-code">{project.project_code}</span></div>
              <label className={`pd-cell ${!String(values.name ?? '').trim() ? 'pd-invalid' : ''}`}><span className="pd-label">案件名</span>{textField('name', '案件名')}</label>
              <div className="pd-cell"><span className="pd-label">得意先</span><ComboSelect options={customerOptions} value={Number(values.customer_id) || null} onChange={id => {
                const previous = values.customer_id;
                change('customer_id', id ?? 0);
                void saveField('customer_id', id ?? 0, '得意先', previous);
              }} placeholder="得意先を検索..." headers={['得意先名', '備考']} /></div>
              <label className="pd-cell"><span className="pd-label" title="ここまでに納品したい日">納期</span><div className="pd-due-field"><input aria-label="納期" type="date" max="9999-12-31" className="pd-control" value={String(values.delivery_date ?? '')} onChange={event => {
                const previous = values.delivery_date;
                change('delivery_date', event.target.value);
                void saveField('delivery_date', event.target.value, '納期', previous);
              }} />{dueDays !== null && <span className={dueDays < 0 ? 'pd-due-over' : dueDays <= 5 ? 'pd-due-soon' : ''}>{dueDays === 0 ? '今日' : dueDays < 0 ? `${Math.abs(dueDays)} 営業日超過` : `あと ${dueDays} 営業日`}</span>}</div></label>
            </div>
            {selectedCustomer && <>
              <div className="pd-customer-line">
                <span className="pd-ci"><span className="pd-label">住所</span>{[selectedCustomer.address1, selectedCustomer.address2].filter(Boolean).join('') || '—'}</span>
                {selectedCustomer.tel && <a className="pd-contact-link" href={`tel:${selectedCustomer.tel}`}>TEL: {selectedCustomer.tel}</a>}
                {selectedCustomer.mobile && <a className="pd-contact-link" href={`tel:${selectedCustomer.mobile}`}>携帯: {selectedCustomer.mobile}</a>}
                {selectedCustomer.email && <a className="pd-contact-link" href={`mailto:${selectedCustomer.email}`}>{selectedCustomer.email}</a>}
                {selectedCustomer.memo && <span className="pd-ci-memo">{selectedCustomer.memo}</span>}
              </div>
              <div className="pd-customer-actions"><button type="button" className="pd-btn pd-customer-btn" onClick={() => window.open(`${import.meta.env.BASE_URL}customers/${selectedCustomer.id}`, '_blank')}>得意先を編集</button><button type="button" className="pd-btn pd-customer-btn" onClick={() => setModalOpen(true)}>＋ 新規得意先</button></div>
            </>}
            <div className="pd-status-area"><span className="pd-label">ステータス</span><div className="pd-status-list">{projectStatuses.map(status => <button key={status.id} type="button" aria-label={status.name} aria-pressed={values.status === status.name} className={`pd-status ${values.status === status.name ? 'pd-status-active' : ''}`} onClick={() => {
              const previous = values.status;
              change('status', status.name);
              void saveField('status', status.name, 'ステータス', previous, true, true);
            }}>{status.name}</button>)}</div></div>
            <div className="pd-work"><span className="pd-label">工数</span>{voucherHours > 0 ? <div className="pd-work-values"><span>工場 {Number(project.estimated_factory_hours).toFixed(1)}h {(Number(project.estimated_factory_hours) / settings.hoursPerDay).toFixed(1)}日</span><span>現場 {Number(project.estimated_site_hours).toFixed(1)}h {(Number(project.estimated_site_hours) / settings.hoursPerDay).toFixed(1)}日</span><small>見積から</small></div> : <div className="pd-effort"><input aria-label="工数目安（h）" type="number" step="0.1" className="pd-control" value={values.manual_estimated_hours ?? ''} onChange={event => change('manual_estimated_hours', event.target.value === '' ? null : Number(event.target.value))} onBlur={() => saveField('manual_estimated_hours', values.manual_estimated_hours ?? null, '工数目安', project.manual_estimated_hours)} /><span className="pd-days">{((Number(values.manual_estimated_hours) || 0) / settings.hoursPerDay).toFixed(1)}日</span>{[4, ...QUICK_HOURS_DAYS.map(day => day * settings.hoursPerDay)].map((hours, index) => <button key={hours} type="button" className="pd-quick" onClick={() => {
              const previous = values.manual_estimated_hours;
              change('manual_estimated_hours', hours);
              void saveField('manual_estimated_hours', hours, '工数目安', previous);
            }}>{index === 0 ? '4h' : `${QUICK_HOURS_DAYS[index - 1]}日`}</button>)}</div>}</div>
            <label className="pd-description"><span className="pd-label">説明</span>{textField('memo', '説明', true)}</label>
          </section>

          <ProjectSchedulesPanel projectId={projectId} onCreated={created => showScheduleUndo('予定を作りました', () => deleteSchedule.mutateAsync(created.id))} onUpdated={(schedule, patch) => showScheduleUndo('予定を変更しました', () => updateSchedule.mutateAsync({ id: schedule.id, ...Object.fromEntries(Object.keys(patch).map(key => [key, schedule[key as keyof ProjectSchedule]])) }))} onDeleted={schedule => showScheduleUndo('予定を削除しました', () => createSchedule.mutateAsync({ projectId, ...scheduleInput(schedule) }))} />
          <PdVoucherPanel title="見積伝票" vouchers={estimates} onCreate={() => navigate(`/vouchers/new?project_id=${projectId}&customer_id=${values.customer_id ?? ''}&type=estimate`)} onOpen={voucherId => navigate(`/vouchers/${voucherId}`)} />
          <PdVoucherPanel title="売上伝票" vouchers={sales} onCreate={() => navigate(`/vouchers/new?project_id=${projectId}&customer_id=${values.customer_id ?? ''}&type=sales`)} onOpen={voucherId => navigate(`/vouchers/${voucherId}`)} />
        </div>

        <div className="pd-column" data-testid="project-detail-right-column">
          <section className="pd-panel" data-testid="project-basic-info"><h2 className="pd-panel-title">基本情報</h2><div className="pd-info">
            {([['order_date', '受注日'], ['end_date', '納品日']] as const).map(([key, label]) => <Fragment key={key}><span className="pd-info-label" title={key === 'end_date' ? '本当に納品した日・納品する日' : undefined}>{label}</span><span className="pd-info-value"><input aria-label={label} type="date" max="9999-12-31" className={`pd-control ${values[key] ? '' : 'pd-empty-date'}`} value={String(values[key] ?? '')} onChange={event => {
              const previous = values[key]; change(key, event.target.value); void saveField(key, event.target.value, label, previous);
            }} /></span></Fragment>)}
            {([['owner_name', '施主'], ['general_contractor_name', '元請'], ['site_contact', '連絡先'], ['address', '施工住所']] as const).map(([key, label]) => <Fragment key={key}><span className="pd-info-label">{label}</span><span className="pd-info-value">{textField(key, label)}</span></Fragment>)}
          </div></section>
          <section className="pd-panel"><div className="pd-panel-title"><h2>画像</h2><span className="pd-spacer" /><button type="button" className="pd-btn" onClick={() => fileInput.current?.click()}>＋ 追加</button><input ref={fileInput} hidden type="file" multiple accept="image/*" onChange={uploadFiles} /></div>{project.images?.length ? <div className="pd-panel-actions">{project.images.map(image => <div key={image.id}><button type="button" onClick={() => window.open(`/contents/${APP_ID}/api/${image.file_path}`, '_blank')}><img src={`/contents/${APP_ID}/api/${image.file_path}`} alt={image.file_name} width="72" height="72" /></button><button type="button" className="pd-link-danger" onClick={() => deleteImage.mutate(image.id)}>削除</button></div>)}</div> : <p className="pd-empty">画像なし（0件）</p>}</section>
          <CapacityCheckPanel projectId={projectId} />
        </div>
      </div>

      <section className="pd-panel pd-danger"><h2 className="pd-panel-title">危険な操作</h2><div className="pd-danger-body"><p>この案件を伝票・明細も含めて完全に削除します。</p><button type="button" className="pd-btn pd-btn-danger" onClick={() => setHardDeleteOpen(true)}>完全削除</button></div></section>
      {undo && <UndoToast message={undo.message} onDismiss={() => setUndo(null)} onUndo={async () => { await undo.run(); setUndo(null); }} />}
      <NewCustomerModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onCreated={async customer => { await refetchCustomers(); const previous = values.customer_id; change('customer_id', customer.id); await saveField('customer_id', customer.id, '得意先', previous); setModalOpen(false); }} />
      <HardDeleteProjectModal isOpen={hardDeleteOpen} isPending={hardDelete.isPending} errorMessage={hardDeleteError} onClose={() => setHardDeleteOpen(false)} onConfirm={async () => { try { await hardDelete.mutateAsync(projectId); goBack(); } catch (error) { setHardDeleteError(extractServerErrorMessage(error)); } }} />
    </form>
  );
}

function PdVoucherPanel({ title, vouchers, onCreate, onOpen }: { title: string; vouchers: ProjectVoucher[]; onCreate: () => void; onOpen: (id: number) => void }) {
  return <section className="pd-panel"><div className="pd-panel-title"><h2>{title}</h2><span className="pd-spacer" /><button type="button" className="pd-btn" onClick={onCreate}>＋ 作成</button></div>{vouchers.length === 0 ? <p className="pd-empty">登録なし</p> : vouchers.map(voucher => <div key={voucher.id} role="button" tabIndex={0} className="pd-voucher-row pd-row-click" onClick={() => onOpen(voucher.id)} onKeyDown={event => event.key === 'Enter' && onOpen(voucher.id)}><span>{voucher.voucher_no}</span><span>{voucher.voucher_date}</span><span>{VOUCHER_STATUS_LABEL[voucher.status] ?? voucher.status}</span><span>{voucher.description}</span><span className="pd-amount">{Number(voucher.total_amount ?? 0).toLocaleString()}</span><span>›</span></div>)}</section>;
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

function VoucherPanel({ title, emptyText, vouchers, onCreate, onOpen }: {
  title: string;
  emptyText: string;
  vouchers: ProjectVoucher[];
  onCreate: () => void;
  onOpen: (voucherId: number) => void;
}) {
  return (
    <section className={panelCls}>
      <div className={`${headingCls} flex items-center justify-between`}>
        <h2>{title}</h2>
        <button type="button" onClick={onCreate} className={primaryBtnCls}>＋ {title.replace('伝票', '')}作成</button>
      </div>
      {vouchers.length === 0 ? <p className="p-2 text-slate-400">{emptyText}</p> : (
        <div className="border-x border-slate-300">
          {vouchers.map(voucher => (
            <button
              key={voucher.id}
              type="button"
              onClick={() => onOpen(voucher.id)}
              className="grid w-full grid-cols-[6rem_6rem_4rem_1fr_7rem_1rem] border-b border-slate-300 px-2 py-1 text-left hover:border-blue-600 hover:bg-blue-50 rounded-none"
            >
              <span className="font-mono">{voucher.voucher_no}</span>
              <span>{voucher.voucher_date}</span>
              <span>{VOUCHER_STATUS_LABEL[voucher.status] ?? voucher.status}</span>
              <span className="truncate">{voucher.description ?? ''}</span>
              <span className="text-right font-mono tabular-nums">¥{voucher.total_amount.toLocaleString()}</span>
              <span>→</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const inputCls = 'w-full h-6 px-1.5 border border-slate-300 rounded-none text-xs hover:border-blue-600 hover:bg-blue-50 focus:outline-none focus:border-blue-600';
const dateInputCls = 'w-40 h-6 px-1.5 border border-slate-300 rounded-none text-xs hover:border-blue-600 hover:bg-blue-50 focus:outline-none focus:border-blue-600';
const hoursInputCls = 'w-20 h-6 px-1.5 border border-slate-300 rounded-none text-xs text-right tabular-nums hover:border-blue-600 hover:bg-blue-50 focus:outline-none focus:border-blue-600';
const quickHoursBtnCls = 'px-2 h-6 text-xs bg-slate-100 border border-slate-300 rounded-none text-slate-600 hover:border-blue-600 hover:bg-blue-50';
const panelCls = 'bg-white border border-slate-300 rounded-none p-2';
const headingCls = 'text-xs font-bold text-slate-600 border-b border-slate-300 pb-1 mb-1';
const readOnlyCls = 'h-6 px-1.5 border border-slate-200 bg-slate-50 text-xs font-mono text-slate-600 flex items-center rounded-none';
const primaryBtnCls = 'px-3 h-6 bg-blue-600 border border-blue-600 text-white text-xs hover:bg-blue-700 hover:border-blue-700 focus:border-blue-700 rounded-none disabled:opacity-50';
const secondaryBtnCls = 'px-3 h-6 bg-white border border-slate-300 text-slate-600 text-xs hover:border-blue-600 hover:bg-blue-50 focus:border-blue-600 rounded-none';
const statusBtnCls = 'h-6 px-2 border border-slate-300 -ml-px first:ml-0 text-xs hover:border-blue-600 hover:bg-blue-50 focus:z-10 focus:border-blue-600 rounded-none';
const QUICK_HOURS_DAYS = [1, 2, 3, 5, 8, 14];
