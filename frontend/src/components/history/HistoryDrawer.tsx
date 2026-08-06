import { useState } from 'react';
import { useHistory, useRestoreHistory } from '../../api/history';
import { HISTORY_LABELS, HISTORY_SUMMARY_FIELDS, formatHistoryValue } from './historyLabels';
import type { HistoryEntity, HistoryRecord, HistoryEnvelope } from '../../types/history';

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  entity: HistoryEntity;
  /** 指定時: そのレコード1件の履歴。未指定時: 削除履歴の一覧（一覧画面の「削除履歴」導線用） */
  entityId?: number;
  title?: string;
}

const ACTION_LABEL: Record<string, string> = { update: '更新', delete: '削除', restore: '復元' };
const ACTION_COLOR: Record<string, string> = { update: '#2563eb', delete: '#dc2626', restore: '#10b981' };

function parseEnvelope(json: string | null): HistoryEnvelope | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as HistoryEnvelope;
  } catch {
    return null;
  }
}

export default function HistoryDrawer({ open, onClose, entity, entityId, title }: HistoryDrawerProps) {
  const { data: records = [], isLoading } = useHistory(
    { entity, entity_id: entityId, action: entityId ? undefined : 'delete' },
    open
  );
  const restoreMutation = useRestoreHistory();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [restoredResult, setRestoredResult] = useState<Record<string, unknown> | null>(null);
  const labels = HISTORY_LABELS[entity];

  if (!open) return null;

  async function handleRestore(record: HistoryRecord) {
    const result = await restoreMutation.mutateAsync(record.id);
    setRestoredResult(result);
    setConfirmId(null);
  }

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="history-drawer-overlay">
      <div style={drawerStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{title ?? '変更履歴'}</h2>
          <button onClick={onClose} style={iconBtnStyle} aria-label="閉じる">×</button>
        </div>

        {restoredResult && (
          <div style={restoredPanelStyle}>
            <div style={{ fontWeight: 'bold', marginBottom: 6, color: '#166534' }}>
              復元しました。現在の値をご確認ください。
            </div>
            <div style={{ fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {HISTORY_SUMMARY_FIELDS[entity].map(f => (
                <span key={f}>
                  {labels[f] ?? f}: <strong>{formatHistoryValue(f, restoredResult[f])}</strong>
                </span>
              ))}
              {entity === 'invoices' && restoredResult.carry_forward_skipped === true && (
                <span style={{ color: '#f59e0b' }}>（繰越残高の更新はスキップされました）</span>
              )}
            </div>
            <button onClick={() => setRestoredResult(null)} style={{ ...smallBtnStyle, marginTop: 8 }}>
              閉じる
            </button>
          </div>
        )}

        {isLoading ? (
          <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>読み込み中...</div>
        ) : records.length === 0 ? (
          <div style={{ padding: 20, color: '#94a3b8', fontSize: 13 }}>履歴はありません</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {records.map((r, idx) => {
              const isLatestForRecord = entityId ? idx === 0 : true;
              const hasWarning = !isLatestForRecord || r.clamped === 1;
              return (
                <li key={r.id} style={itemStyle}>
                  <div style={itemHeaderStyle}>
                    <span style={{ ...actionBadgeStyle, background: ACTION_COLOR[r.action] }}>
                      {ACTION_LABEL[r.action] ?? r.action}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{r.created_at}</span>
                  </div>

                  <HistoryDiff entity={entity} record={r} labels={labels} />

                  {hasWarning && (
                    <div style={warningStyle}>
                      この復元より後に関連する変更があります。復元後、内容をご確認ください。
                    </div>
                  )}

                  {r.action !== 'restore' && (
                    confirmId === r.id ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#dc2626' }}>この時点に戻しますか？</span>
                        <button
                          onClick={() => handleRestore(r)}
                          disabled={restoreMutation.isPending}
                          style={confirmBtnStyle}
                        >
                          {restoreMutation.isPending ? '復元中...' : '復元する'}
                        </button>
                        <button onClick={() => setConfirmId(null)} style={smallBtnStyle}>キャンセル</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmId(r.id)} style={{ ...smallBtnStyle, marginTop: 8 }}>
                        この時点に戻す
                      </button>
                    )
                  )}
                  {restoreMutation.isError && confirmId === null && (
                    <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>
                      復元に失敗しました: {String(restoreMutation.error)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function HistoryDiff({ entity, record, labels }: {
  entity: HistoryEntity; record: HistoryRecord; labels: Record<string, string>;
}) {
  const before = parseEnvelope(record.before_json);
  const after = parseEnvelope(record.after_json);

  if (record.action === 'update' && before && after) {
    const changedKeys = Object.keys(labels).filter(k => before.row[k] !== after.row[k]);
    if (changedKeys.length === 0) return null;
    return (
      <div style={{ fontSize: 13, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {changedKeys.map(k => (
          <div key={k}>
            <span style={{ color: '#64748b' }}>{labels[k] ?? k}: </span>
            <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>
              {formatHistoryValue(k, before.row[k])}
            </span>
            {' → '}
            <span>{formatHistoryValue(k, after.row[k])}</span>
          </div>
        ))}
      </div>
    );
  }

  if (!before) return null;
  const summaryFields = HISTORY_SUMMARY_FIELDS[entity];
  return (
    <div style={{ fontSize: 13, marginTop: 6, color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
      {summaryFields.map(f => (
        <span key={f}>{labels[f] ?? f}: {formatHistoryValue(f, before.row[f])}</span>
      ))}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 100,
  display: 'flex', justifyContent: 'flex-end',
};
const drawerStyle: React.CSSProperties = {
  width: 420, maxWidth: '100%', height: '100%', background: '#fff',
  boxShadow: '-2px 0 12px rgba(0,0,0,0.15)', overflowY: 'auto', padding: 20,
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
};
const iconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', lineHeight: 1,
};
const itemStyle: React.CSSProperties = {
  padding: '12px 0', borderBottom: '1px solid #f1f5f9',
};
const itemHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};
const actionBadgeStyle: React.CSSProperties = {
  color: '#fff', fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 999,
};
const warningStyle: React.CSSProperties = {
  marginTop: 8, padding: '6px 10px', background: '#fffbeb', color: '#92400e',
  borderRadius: 6, fontSize: 12,
};
const restoredPanelStyle: React.CSSProperties = {
  marginBottom: 16, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
};
const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'transparent', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#475569',
};
const confirmBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: '#dc2626', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 12,
};
