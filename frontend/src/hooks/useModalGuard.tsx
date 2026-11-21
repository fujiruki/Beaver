import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Options<T> {
  kind: string;
  id: number | string | null | undefined;
  value: T;
  ready: boolean;
  resetKey: string;
  onClose: () => void;
  onRestore: (value: T) => void;
}

interface Draft<T> {
  savedAt: string;
  value: T;
}

function readDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft<T>) : null;
  } catch {
    return null;
  }
}

function writeDraft<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), value }));
  } catch {
    // 保存できなくても入力は続けられる
  }
}

function removeDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 消せなくても入力は続けられる
  }
}

function formatSavedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 入力のあるモーダル用。変更がある間は閉じる前に確認（クリック位置の真下に「閉じる」）を出し、
 * 入力内容を localStorage（Beaver_draft_<kind>_<id|new>）へ仮保存する。
 * resetKey が変わると、次の描画の value を「変更なし」の基準にし直す。
 */
export function useModalGuard<T>({ kind, id, value, ready, resetKey, onClose, onRestore }: Options<T>) {
  const key = `Beaver_draft_${kind}_${id ?? 'new'}`;
  const json = JSON.stringify(value);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [settled, setSettled] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft<T> | null>(null);
  const [confirmAt, setConfirmAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setBaseline(null);
    setDraft(null);
    setConfirmAt(null);
    setSettled(null);
    setArmed(resetKey);
  }, [resetKey]);

  // resetKey が変わった描画では呼び出し側の初期化がまだ value に届いていないので、次の描画で基準を取る
  useEffect(() => {
    if (!ready || armed !== resetKey || settled === resetKey) return;
    setBaseline(json);
    setSettled(resetKey);
    setDraft(readDraft<T>(key));
  }, [ready, armed, settled, resetKey, json, key]);

  const dirty = baseline !== null && json !== baseline;

  useEffect(() => {
    if (dirty) writeDraft(key, JSON.parse(json));
  }, [dirty, json, key]);

  const clearDraft = useCallback(() => removeDraft(key), [key]);

  const requestClose = useCallback((event?: MouseEvent) => {
    if (!dirty) {
      onClose();
      return;
    }
    setConfirmAt({
      x: event?.clientX ?? window.innerWidth / 2,
      y: event?.clientY ?? window.innerHeight / 2,
    });
  }, [dirty, onClose]);

  const guard: ReactNode = (
    <>
      {draft && !dirty && (
        <div role="status" style={bannerStyle}>
          <span style={{ flex: 1 }}>入力しかけがあります（{formatSavedAt(draft.savedAt)}）</span>
          <button type="button" style={primaryBtn} onClick={() => { onRestore(draft.value); setDraft(null); }}>戻す</button>
          <button type="button" style={subBtn} onClick={() => { removeDraft(key); setDraft(null); }}>捨てる</button>
        </div>
      )}
      {confirmAt && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 3000 }}
          onClick={(e) => { e.stopPropagation(); setConfirmAt(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setConfirmAt(null); } }}
        >
          <div
            role="alertdialog"
            aria-label="閉じる確認"
            style={{
              ...confirmStyle,
              left: Math.max(8, Math.min(confirmAt.x - 48, window.innerWidth - 248)),
              top: Math.max(8, confirmAt.y - 18),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                autoFocus
                style={{ ...primaryBtn, width: 96, height: 36 }}
                onClick={() => { setConfirmAt(null); onClose(); }}
              >
                閉じる
              </button>
              <button type="button" style={{ ...subBtn, height: 36 }} onClick={() => setConfirmAt(null)}>戻る</button>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>入力中の内容は仮保存されます</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );

  return { guard, requestClose, clearDraft };
}

const bannerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 12,
  background: '#eff6ff', color: '#1e40af', fontSize: 13,
};
const primaryBtn: React.CSSProperties = {
  padding: '4px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const subBtn: React.CSSProperties = {
  padding: '4px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const confirmStyle: React.CSSProperties = {
  position: 'absolute', padding: 10, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8,
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
};
