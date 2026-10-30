import { useCapacityCheck } from '../api/capacityCheck';

/** R-0118: 案件詳細のYoukan容量判定パネル（結論優先表示） */
export default function CapacityCheckPanel({ projectId }: { projectId: number }) {
  const { data, isLoading, isFetching, error, refetch } = useCapacityCheck(projectId);

  let content: React.ReactNode;
  if (isLoading) {
    content = <p className="text-sm text-slate-400">判定中...</p>;
  } else if (!data || error) {
    content = <p className="text-sm text-slate-500">Youkanに接続できないため、容量判定は現在利用できません</p>;
  } else if (!data.ok) {
    content = <p className="text-sm text-slate-500">{data.message}</p>;
  } else {
    const r = data.result;
    const color = r.feasible ? 'text-green-700' : r.deadline ? 'text-red-600' : 'text-amber-600';
    content = (
      <div>
        <p className={`text-lg font-bold ${color}`}>{r.message}</p>
        <p className="mt-1 text-xs text-slate-400">判定時刻: {r.evaluated_at}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-300 rounded-none p-2">
      <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1">
        <h2 className="text-xs font-bold text-slate-600">Youkan容量判定</h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 h-6 text-xs bg-blue-50 border border-blue-300 text-blue-700 rounded-none hover:border-blue-600 hover:bg-blue-100 focus:border-blue-600 disabled:opacity-50"
        >
          {isFetching ? '判定中...' : '再判定'}
        </button>
      </div>
      {content}
    </div>
  );
}
