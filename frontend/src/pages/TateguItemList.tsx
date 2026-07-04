import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTateguItemsPaged, useDeleteTateguItem } from '../api/tateguItems';
import Pagination from '../components/Pagination';

export default function TateguItemList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const isComposingRef = useRef(false);
  const { data, isLoading, error } = useTateguItemsPaged(page, search);
  const deleteMutation = useDeleteTateguItem();

  const items = data?.data ?? [];
  const meta = data?.meta;

  function commitSearch(q: string) {
    setSearch(q);
    setPage(1);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInputValue(value);
    if (!isComposingRef.current) commitSearch(value);
  }

  function handleCompositionStart() {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
    isComposingRef.current = false;
    commitSearch(e.currentTarget.value);
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
        <h1 className="text-xl font-bold">建具台帳</h1>
        <button
          onClick={() => navigate('/tategu/new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          ＋ 新規登録
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="品名・コードで検索"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-60"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">コード</th>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">品名</th>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">仕様</th>
              <th className="px-3 py-2.5 text-right text-slate-500 font-semibold">製造原価</th>
              <th className="px-3 py-2.5 text-left text-slate-500 font-semibold">単位</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">登録なし</td></tr>
            )}
            {items.map(item => {
              const costMaterial = item.cost_body + item.cost_hardware + item.cost_glass;
              const costLabor    = (item.cost_factory_hours + item.cost_site_hours) * item.cost_labor_rate;
              const totalCost    = costMaterial + costLabor;
              return (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/tategu/${item.id}`)}
                >
                  <td className="px-3 py-2.5">{item.item_code}</td>
                  <td className="px-3 py-2.5 font-medium">{item.name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{item.spec ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono">¥{totalCost.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-slate-500">{item.unit ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/tategu/${item.id}`)}
                      className="px-2.5 py-1 bg-slate-500 text-white rounded text-xs mr-1 hover:bg-slate-600"
                    >編集</button>
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      className="px-2.5 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                      disabled={deleteMutation.isPending}
                    >削除</button>
                  </td>
                </tr>
              );
            })}
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
