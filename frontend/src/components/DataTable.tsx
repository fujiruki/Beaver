import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  stopRowClick?: boolean;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  tableId: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  sortKey?: string;
  sortDir?: SortDir;
  onSortChange?: (key: string, dir: SortDir) => void;
  emptyMessage?: string;
  density?: 'compact';
}

export interface SortState {
  key: string;
  dir: SortDir;
}

const STORAGE_PREFIX = 'bv_table_widths_';
const ORDER_STORAGE_PREFIX = 'bv_table_order_';
const SORT_STORAGE_PREFIX = 'bv_table_sort_';
const DEFAULT_MIN_WIDTH = 60;
const REORDER_MOVE_THRESHOLD = 4;

function loadWidths<T>(tableId: string, columns: DataTableColumn<T>[]): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const col of columns) {
    if (col.width !== undefined) defaults[col.key] = col.width;
  }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + tableId);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const merged = { ...defaults };
    for (const col of columns) {
      const v = (parsed as Record<string, unknown>)[col.key];
      if (typeof v === 'number' && Number.isFinite(v)) merged[col.key] = v;
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function useColumnWidths<T>(tableId: string, columns: DataTableColumn<T>[]) {
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(tableId, columns));

  useEffect(() => {
    setWidths(loadWidths(tableId, columns));
    // tableId が変わったときのみ復元し直す（columns は再生成されやすいため依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const setWidth = useCallback((key: string, width: number) => {
    setWidths(prev => ({ ...prev, [key]: width }));
  }, []);

  const persist = useCallback((next: Record<string, number>) => {
    try {
      localStorage.setItem(STORAGE_PREFIX + tableId, JSON.stringify(next));
    } catch {
      // localStorage が使えない環境（プライベートモード等）では保存を諦める
    }
  }, [tableId]);

  return { widths, setWidth, persist };
}

function loadOrder(tableId: string): string[] | null {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_PREFIX + tableId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const keys = parsed.filter((k): k is string => typeof k === 'string');
    return keys.length > 0 ? keys : null;
  } catch {
    return null;
  }
}

// 保存順を優先しつつ、未知の列は定義順で末尾に補完したキー配列を返す
function resolveOrder<T>(saved: string[] | null, columns: DataTableColumn<T>[]): string[] {
  const defKeys = columns.map(c => c.key);
  if (!saved) return defKeys;
  const known = new Set(defKeys);
  const ordered = saved.filter(k => known.has(k));
  const seen = new Set(ordered);
  for (const k of defKeys) {
    if (!seen.has(k)) ordered.push(k);
  }
  return ordered;
}

export function useColumnOrder<T>(tableId: string, columns: DataTableColumn<T>[]) {
  const [saved, setSaved] = useState<string[] | null>(() => loadOrder(tableId));

  useEffect(() => {
    setSaved(loadOrder(tableId));
    // tableId が変わったときのみ復元し直す（columns は再生成されやすいため依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const order = useMemo(() => resolveOrder(saved, columns), [saved, columns]);

  const reorder = useCallback((fromKey: string, toKey: string) => {
    setSaved(() => {
      const fromIdx = order.indexOf(fromKey);
      const toIdx = order.indexOf(toKey);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return order;
      const next = [...order];
      next.splice(fromIdx, 1);
      let insertAt = next.indexOf(toKey);
      if (fromIdx < toIdx) insertAt += 1;
      next.splice(insertAt, 0, fromKey);
      try {
        localStorage.setItem(ORDER_STORAGE_PREFIX + tableId, JSON.stringify(next));
      } catch {
        // localStorage が使えない環境では保存を諦める
      }
      return next;
    });
  }, [order, tableId]);

  return { order, reorder };
}

function loadSort(tableId: string, defaultSort?: SortState): SortState | undefined {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_PREFIX + tableId);
    if (!raw) return defaultSort;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultSort;
    const key = (parsed as Record<string, unknown>).key;
    const dir = (parsed as Record<string, unknown>).dir;
    if (typeof key === 'string' && (dir === 'asc' || dir === 'desc')) return { key, dir };
    return defaultSort;
  } catch {
    return defaultSort;
  }
}

export function useSortState(
  tableId: string,
  defaultSort?: SortState,
): [SortState | undefined, (key: string, dir: SortDir) => void] {
  const [sort, setSortState] = useState<SortState | undefined>(() => loadSort(tableId, defaultSort));

  useEffect(() => {
    setSortState(loadSort(tableId, defaultSort));
    // tableId が変わったときのみ復元し直す（defaultSort は再生成されやすいため依存に含めない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  const setSort = useCallback((key: string, dir: SortDir) => {
    const next: SortState = { key, dir };
    setSortState(next);
    try {
      localStorage.setItem(SORT_STORAGE_PREFIX + tableId, JSON.stringify(next));
    } catch {
      // localStorage が使えない環境（プライベートモード等）では保存を諦める
    }
  }, [tableId]);

  return [sort, setSort];
}

export default function DataTable<T>({
  tableId,
  columns,
  rows,
  rowKey,
  onRowClick,
  sortKey,
  sortDir,
  onSortChange,
  emptyMessage = '登録なし',
  density = 'compact',
}: DataTableProps<T>) {
  const { widths, setWidth, persist } = useColumnWidths(tableId, columns);
  const { order, reorder } = useColumnOrder(tableId, columns);

  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map(c => [c.key, c]));
    return order.map(k => byKey.get(k)).filter((c): c is DataTableColumn<T> => c !== undefined);
  }, [order, columns]);

  const dragRef = useRef<{ sourceKey: string; startX: number; moved: boolean; overKey: string | null } | null>(null);
  const suppressClickRef = useRef(false);

  function handleHeaderClick(col: DataTableColumn<T>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!col.sortable || !onSortChange) return;
    const nextDir: SortDir = sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc';
    onSortChange(col.key, nextDir);
  }

  function handleReorderPointerDown(e: ReactPointerEvent<HTMLTableCellElement>, col: DataTableColumn<T>) {
    dragRef.current = { sourceKey: col.key, startX: e.clientX, moved: false, overKey: null };

    function handleMove(ev: PointerEvent) {
      const state = dragRef.current;
      if (!state) return;
      if (Math.abs(ev.clientX - state.startX) > REORDER_MOVE_THRESHOLD) state.moved = true;
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const state = dragRef.current;
      dragRef.current = null;
      if (!state || !state.moved) return;
      // ドラッグして離した直後の click はソートさせない
      suppressClickRef.current = true;
      if (state.overKey && state.overKey !== state.sourceKey) {
        reorder(state.sourceKey, state.overKey);
      }
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function handleReorderPointerOver(col: DataTableColumn<T>) {
    if (dragRef.current) dragRef.current.overKey = col.key;
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, col: DataTableColumn<T>) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widths[col.key] ?? col.width ?? DEFAULT_MIN_WIDTH;
    const minWidth = col.minWidth ?? DEFAULT_MIN_WIDTH;
    // jsdom/happy-dom などテスト環境では setPointerCapture が未実装のため optional chaining で保護する
    e.currentTarget.setPointerCapture?.(e.pointerId);

    let latestWidth = startWidth;

    function handleMove(ev: PointerEvent) {
      const delta = ev.clientX - startX;
      latestWidth = Math.max(minWidth, startWidth + delta);
      setWidth(col.key, latestWidth);
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      persist({ ...widths, [col.key]: latestWidth });
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  const cellPadding = density === 'compact' ? '4px 8px' : '8px 12px';
  const fontSize = density === 'compact' ? 13 : 14;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        {orderedColumns.map(col => {
          const w = widths[col.key] ?? col.width;
          return <col key={col.key} style={w !== undefined ? { width: `${w}px` } : undefined} />;
        })}
      </colgroup>
      <thead>
        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          {orderedColumns.map(col => {
            const isSorted = sortKey === col.key;
            const ariaSort: 'ascending' | 'descending' | 'none' | undefined = !col.sortable
              ? undefined
              : isSorted
                ? (sortDir === 'desc' ? 'descending' : 'ascending')
                : 'none';
            const thStyle: CSSProperties = {
              position: 'relative',
              padding: cellPadding,
              textAlign: col.align ?? 'left',
              fontSize,
              fontWeight: 'bold',
              color: '#475569',
              cursor: col.sortable ? 'pointer' : undefined,
              userSelect: 'none',
              touchAction: 'none',
            };
            return (
              <th
                key={col.key}
                aria-sort={ariaSort}
                onClick={() => handleHeaderClick(col)}
                onPointerDown={e => handleReorderPointerDown(e, col)}
                onPointerMove={() => handleReorderPointerOver(col)}
                style={thStyle}
              >
                {col.label}
                {col.sortable && isSorted && (
                  <span aria-hidden="true"> {sortDir === 'desc' ? '▼' : '▲'}</span>
                )}
                <div
                  className="bv-datatable-resize-handle"
                  onPointerDown={e => handleResizePointerDown(e, col)}
                  onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 6 }}
                />
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
              {emptyMessage}
            </td>
          </tr>
        )}
        {rows.map(row => (
          <tr
            key={rowKey(row)}
            className="bv-datatable-row"
            style={{ borderBottom: '1px solid #f1f5f9', cursor: onRowClick ? 'pointer' : undefined }}
            onClick={() => onRowClick?.(row)}
          >
            {orderedColumns.map(col => (
              <td
                key={col.key}
                style={{ padding: cellPadding, fontSize, textAlign: col.align ?? 'left' }}
                onClick={col.stopRowClick ? e => e.stopPropagation() : undefined}
              >
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
