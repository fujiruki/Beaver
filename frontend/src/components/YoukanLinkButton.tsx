import { useState } from 'react';
import { api } from '../api/client';
import type { YoukanLinkResponse } from '../types/youkanLink';

/** R-0130: 案件編集画面・案件一覧共通の「Youkanで見る」ボタン。クリック時にのみ問い合わせる */
export default function YoukanLinkButton({ projectId }: { projectId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<YoukanLinkResponse>(`/projects/${projectId}/youkan-link`);
      if (res.ok) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        setError(res.message);
      }
    } catch {
      setError('Youkanに接続できませんでした');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="px-2.5 py-1 bg-white border border-slate-300 text-slate-600 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? '確認中...' : 'Youkanで見る ↗'}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
