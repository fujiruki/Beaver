import { useCapacityCheck } from '../api/capacityCheck';
import YoukanLinkButton from './YoukanLinkButton';

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
    <section className="pd-panel">
      <div className="pd-panel-title">
        <h2>Youkan</h2>
        <span className="pd-spacer" />
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="pd-btn"
        >
          {isFetching ? '判定中...' : data?.ok ? '再判定' : '判定する'}
        </button>
        <YoukanLinkButton projectId={projectId} />
      </div>
      <div className="pd-capacity">{content}</div>
    </section>
  );
}
