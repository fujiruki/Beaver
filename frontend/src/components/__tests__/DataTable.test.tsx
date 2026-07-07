import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable, { type DataTableColumn } from '../DataTable';

interface Row {
  id: number;
  name: string;
  amount: number;
}

const ROWS: Row[] = [
  { id: 1, name: '田中商店', amount: 1000 },
  { id: 2, name: '鈴木製作所', amount: 2000 },
];

function makeColumns(overrides: Partial<DataTableColumn<Row>> = {}): DataTableColumn<Row>[] {
  return [
    { key: 'name', label: '名前', sortable: true, render: r => r.name },
    { key: 'amount', label: '金額', align: 'right', width: 120, sortable: true, render: r => String(r.amount) },
    {
      key: 'actions',
      label: '操作',
      stopRowClick: true,
      render: r => `操作${r.id}`,
      ...overrides,
    },
  ];
}

beforeEach(() => {
  localStorage.clear();
});

describe('DataTable 描画', () => {
  it('列と行を描画する', () => {
    render(
      <DataTable
        tableId="test-render"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    expect(screen.getByText('田中商店')).not.toBeNull();
    expect(screen.getByText('鈴木製作所')).not.toBeNull();
    expect(screen.getByText('1000')).not.toBeNull();
  });

  it('align 指定のセルに text-align が反映される', () => {
    render(
      <DataTable
        tableId="test-align"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const cell = screen.getByText('1000');
    expect(cell.style.textAlign).toBe('right');
  });

  it('rows が空のとき既定の emptyMessage(登録なし)を表示する', () => {
    render(
      <DataTable
        tableId="test-empty"
        columns={makeColumns()}
        rows={[]}
        rowKey={r => r.id}
      />,
    );
    expect(screen.getByText('登録なし')).not.toBeNull();
  });

  it('emptyMessage を指定するとそのメッセージを表示する', () => {
    render(
      <DataTable
        tableId="test-empty-custom"
        columns={makeColumns()}
        rows={[]}
        rowKey={r => r.id}
        emptyMessage="該当データがありません"
      />,
    );
    expect(screen.getByText('該当データがありません')).not.toBeNull();
  });
});

describe('DataTable ソート', () => {
  it('ソート可能な列見出しをクリックすると onSortChange(key, "asc") が呼ばれる', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-sort-1"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByText('名前'));
    expect(onSortChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('同じ列を再クリックすると asc→desc に反転する', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-sort-2"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onSortChange={onSortChange}
        sortKey="name"
        sortDir="asc"
      />,
    );
    fireEvent.click(screen.getByText('名前'));
    expect(onSortChange).toHaveBeenCalledWith('name', 'desc');
  });

  it('別の列をクリックすると asc から開始する', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-sort-3"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onSortChange={onSortChange}
        sortKey="name"
        sortDir="desc"
      />,
    );
    fireEvent.click(screen.getByText('金額'));
    expect(onSortChange).toHaveBeenCalledWith('amount', 'asc');
  });

  it('sortable でない列をクリックしても onSortChange は呼ばれない', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-sort-4"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByText('操作'));
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('現在ソート中の列は aria-sort が ascending/descending になる', () => {
    render(
      <DataTable
        tableId="test-aria-1"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        sortKey="name"
        sortDir="asc"
      />,
    );
    const th = screen.getByText('名前').closest('th');
    expect(th?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('ソート可能だが未選択の列は aria-sort が none になる', () => {
    render(
      <DataTable
        tableId="test-aria-2"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        sortKey="amount"
        sortDir="asc"
      />,
    );
    const th = screen.getByText('名前').closest('th');
    expect(th?.getAttribute('aria-sort')).toBe('none');
  });

  it('sortable でない列には aria-sort 属性が付かない', () => {
    render(
      <DataTable
        tableId="test-aria-3"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const th = screen.getByText('操作').closest('th');
    expect(th?.hasAttribute('aria-sort')).toBe(false);
  });
});

describe('DataTable 行クリック', () => {
  it('行クリックで onRowClick(row) が呼ばれる', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        tableId="test-rowclick-1"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getByText('田中商店'));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it('stopRowClick な列のセルをクリックしても onRowClick は呼ばれない', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        tableId="test-rowclick-2"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onRowClick={onRowClick}
      />,
    );
    fireEvent.click(screen.getAllByText('操作1')[0]);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('DataTable 列幅の永続化', () => {
  it('localStorage に保存済みの幅があれば復元する', () => {
    localStorage.setItem('bv_table_widths_test-width-restore', JSON.stringify({ amount: 200 }));
    const { container } = render(
      <DataTable
        tableId="test-width-restore"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const cols = container.querySelectorAll('colgroup col');
    // amount 列（2番目）の幅が復元された200pxになっていること
    expect((cols[1] as HTMLElement).style.width).toBe('200px');
  });

  it('壊れたJSONが保存されていても例外を出さず列定義の既定幅にフォールバックする', () => {
    localStorage.setItem('bv_table_widths_test-width-broken', '{not valid json');
    expect(() => {
      render(
        <DataTable
          tableId="test-width-broken"
          columns={makeColumns()}
          rows={ROWS}
          rowKey={r => r.id}
        />,
      );
    }).not.toThrow();
    const amountCell = screen.getByText('1000');
    expect(amountCell.style.textAlign).toBe('right');
  });

  it('ドラッグ中(pointermove)は列幅が更新されるが、pointerup までlocalStorageへは保存されない', () => {
    const storageKey = 'bv_table_widths_test-width-drag';
    const { container } = render(
      <DataTable
        tableId="test-width-drag"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const handle = container.querySelector('.bv-datatable-resize-handle') as HTMLElement;
    expect(handle).not.toBeNull();

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 150, pointerId: 1 });

    // ドラッグ中はまだlocalStorageに保存されない
    expect(localStorage.getItem(storageKey)).toBeNull();
    const col = container.querySelectorAll('colgroup col')[0] as HTMLElement;
    expect(col.style.width).not.toBe('');
    const widthDuringDrag = col.style.width;

    fireEvent.pointerUp(window, { clientX: 150, pointerId: 1 });

    // pointerup時にその時点の幅で保存される
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    expect(saved).not.toBeNull();
    expect(`${saved.name}px`).toBe(widthDuringDrag);
  });
});
