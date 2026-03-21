import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectsPaged, useDeleteProject } from '../api/projects';
import { useCustomers } from '../api/customers';
import Pagination from '../components/Pagination';
import type { ProjectStatus } from '../types/project';

const statusLabel: Record<ProjectStatus, string> = {
  '問い合わせ': '問い合わせ',
  '見積済':     '見積済',
  '受注済':     '受注済',
  '進行中':     '進行中',
  '納品済':     '納品済',
  '請求済':     '請求済',
  '完了':       '完了',
};
const statusColor: Record<ProjectStatus, string> = {
  '問い合わせ': 'bg-slate-100 text-slate-600',
  '見積済':     'bg-blue-100 text-blue-700',
  '受注済':     'bg-indigo-100 text-indigo-700',
  '進行中':     'bg-amber-100 text-amber-700',
  '納品済':     'bg-cyan-100 text-cyan-700',
  '請求済':     'bg-purple-100 text-purple-700',
  '完了':       'bg-green-100 text-green-700',
};

export default function ProjectList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initCustomerId = searchParams.get('customer_id') ? Number(searchParams.get('customer_id')) : undefined;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [customerFilter] = useState<number | undefined>(initCustomerId);
  const { data: customers = [] } = useCustomers();
  const filters = { ...(search ? { q: search } : {}), ...(customerFilter ? { customer_id: customerFilter } : {}) };
  const { data, isLoading, error } = useProjectsPaged(page, Object.keys(filters).length ? filters : undefined);
  const deleteMutation = useDeleteProject();
  const filterCustomer = customerFilter ? customers.find(c => c.id === customerFilter) : null;

  const projects = data?.data ?? [];
  const meta = data?.meta;

  function handleSearch(q: string) {
    setSearch(q);
    setPage(1);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    deleteMutation.mutate(id);
  }

  if (isLoading) return <div className="p-6">読み込み中...</div>;
  if (error)     return <div className="p-6 text-red-600">エラー: {String(error)}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">案件一覧</h1>
          {filterCustomer && (
            <span className="text-sm text-slate-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              {filterCustomer.name} の案件
            </span>
          )}
        </div>
        <button
          onClick={() => {
            const params = new URLSearchParams();
            if (customerFilter) params.set('customer_id', String(customerFilter));
            const qs = params.toString();
            navigate(`/projects/new${qs ? `?${qs}` : ''}`);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          ＋ 新規登録
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="案件名で検索"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-60"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">案件コード</th>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">案件名</th>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">得意先</th>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">ステータス</th>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">開始日</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">登録なし</td></tr>
            )}
            {projects.map(p => (
              <tr
                key={p.id}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <td className="px-3 py-2.5 font-mono text-slate-500">{p.project_code ?? '—'}</td>
                <td className="px-3 py-2.5 font-medium">{p.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{p.customer_name ?? `ID:${p.customer_id}`}</td>
                <td className="px-3 py-2.5">
                  {p.status && statusColor[p.status as ProjectStatus] ? (
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status as ProjectStatus]}`}>
                      {statusLabel[p.status as ProjectStatus]}
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                      {p.status}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-slate-500">{p.start_date ?? '—'}</td>
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="px-2.5 py-1 bg-slate-500 text-white rounded text-xs mr-1 hover:bg-slate-600"
                  >編集</button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="px-2.5 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    disabled={deleteMutation.isPending}
                  >削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && (
          <Pagination
            page={meta.page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onChange={p => setPage(p)}
          />
        )}
      </div>
    </div>
  );
}
