import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useProject, useUpdateProject } from '../../api/projects';
import { useCustomers } from '../../api/customers';
import { useProjectStatuses } from '../../api/projectStatuses';
import type { ProjectInput } from '../../types/project';

interface Props {
  projectId: number;
  onClose: () => void;
  onSaved: () => void;
}

// select要素のDOM値は常に文字列のため、customer_idはフォーム内部では文字列として扱い送信時にNumberへ変換する
type FormValues = Omit<ProjectInput, 'customer_id'> & { customer_id: string };

const inputClass = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm';

export default function ProjectQuickEditModal({ projectId, onClose, onSaved }: Props) {
  const { data: project, isLoading } = useProject(projectId);
  const { data: customers = [], isLoading: customersLoading } = useCustomers();
  const { data: statuses = [], isLoading: statusesLoading } = useProjectStatuses();
  const update = useUpdateProject(projectId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  useEffect(() => {
    if (!project || customersLoading || statusesLoading) return;
    reset({
      project_code: project.project_code,
      customer_id: String(project.customer_id),
      name: project.name,
      status: project.status,
      order_date: project.order_date,
      start_date: project.start_date,
      delivery_date: project.delivery_date,
      manual_estimated_hours: project.manual_estimated_hours,
      memo: project.memo,
    });
  }, [project, customersLoading, statusesLoading, reset]);

  async function save(data: FormValues) {
    setSaveError(null);
    try {
      await update.mutateAsync({
        ...data,
        customer_id: Number(data.customer_id),
        manual_estimated_hours: Number.isNaN(data.manual_estimated_hours) ? null : data.manual_estimated_hours,
      });
      onSaved();
    } catch (error) {
      setSaveError(String(error));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="案件クイック編集" className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="flex-1 text-lg font-bold">案件クイック編集</h2>
          <Link className="text-sm text-blue-600 hover:underline" to={`/projects/${projectId}`}>案件詳細を開く</Link>
        </div>
        {isLoading || !project ? <div>読み込み中...</div> : (
          <form onSubmit={handleSubmit(save)} noValidate className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm">案件コード<input aria-label="案件コード" {...register('project_code')} className={inputClass} /></label>
              <label className="text-sm">案件名<input aria-label="案件名" {...register('name', { required: true })} className={inputClass} /></label>
              <label className="text-sm">得意先<select aria-label="得意先" {...register('customer_id', { required: true })} className={inputClass}>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-sm">ステータス<select aria-label="ステータス" {...register('status')} className={inputClass}>{statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></label>
              <label className="text-sm">受注日<input aria-label="受注日" type="date" {...register('order_date')} className={inputClass} /></label>
              <label className="text-sm">開始日<input aria-label="開始日" type="date" {...register('start_date')} className={inputClass} /></label>
              <label className="text-sm">納期<input aria-label="納期" type="date" {...register('delivery_date')} className={inputClass} /></label>
              <label className="text-sm">工数目安（h）<input aria-label="工数目安（h）" type="number" step="0.1" {...register('manual_estimated_hours', { valueAsNumber: true })} className={inputClass} /></label>
            </div>
            <label className="block text-sm">備考<textarea aria-label="備考" {...register('memo')} rows={3} className={inputClass} /></label>
            {(errors.name || saveError) && <div className="text-sm text-red-600">{saveError ?? '案件名は必須です'}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded border px-4 py-2 text-sm">キャンセル</button>
              <button type="submit" disabled={update.isPending} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{update.isPending ? '保存中...' : '保存'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
