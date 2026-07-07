import { useCallback, useEffect, useState } from 'react';
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

const STORAGE_PREFIX = 'bv_table_widths_';
const DEFAULT_MIN_WIDTH = 60;

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

  function handleHeaderClick(col: DataTableColumn<T>) {
    if (!col.sortable || !onSortChange) return;
    const nextDir: SortDir = sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc';
    onSortChange(col.key, nextDir);
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
        {columns.map(col => {
          const w = widths[col.key] ?? col.width;
          return <col key={col.key} style={w !== undefined ? { width: `${w}px` } : undefined} />;
        })}
      </colgroup>
      <thead>
        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          {columns.map(col => {
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
            };
            return (
              <th
                key={col.key}
                aria-sort={ariaSort}
                onClick={() => handleHeaderClick(col)}
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
            {columns.map(col => (
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
