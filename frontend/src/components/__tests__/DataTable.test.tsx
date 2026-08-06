import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import DataTable, { useSortState, type DataTableColumn } from '../DataTable';

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

describe('useSortState ソート状態の永続化', () => {
  it('初期状態は undefined（既定ソート未指定時）', () => {
    const { result } = renderHook(() => useSortState('sort-init'));
    expect(result.current[0]).toBeUndefined();
  });

  it('既定ソートを渡すと保存が無いとき既定値を返す', () => {
    const { result } = renderHook(() => useSortState('sort-default', { key: 'name', dir: 'asc' }));
    expect(result.current[0]).toEqual({ key: 'name', dir: 'asc' });
  });

  it('setSort(key, dir) 呼び出しで状態が更新され localStorage に保存される', () => {
    const { result } = renderHook(() => useSortState('sort-save'));
    act(() => result.current[1]('amount', 'desc'));
    expect(result.current[0]).toEqual({ key: 'amount', dir: 'desc' });
    expect(JSON.parse(localStorage.getItem('bv_table_sort_sort-save') ?? 'null')).toEqual({
      key: 'amount',
      dir: 'desc',
    });
  });

  it('同じ tableId で再マウントすると保存済みソートが復元される', () => {
    const { result, unmount } = renderHook(() => useSortState('sort-remount'));
    act(() => result.current[1]('name', 'asc'));
    unmount();
    const { result: result2 } = renderHook(() => useSortState('sort-remount'));
    expect(result2.current[0]).toEqual({ key: 'name', dir: 'asc' });
  });

  it('tableId が変われば別のソート状態になる', () => {
    localStorage.setItem('bv_table_sort_sort-a', JSON.stringify({ key: 'name', dir: 'asc' }));
    const { result, rerender } = renderHook(({ id }) => useSortState(id), {
      initialProps: { id: 'sort-a' },
    });
    expect(result.current[0]).toEqual({ key: 'name', dir: 'asc' });
    rerender({ id: 'sort-b' });
    expect(result.current[0]).toBeUndefined();
  });

  it('壊れたJSONが保存されていても例外を出さず既定値にフォールバックする', () => {
    localStorage.setItem('bv_table_sort_sort-broken', '{not valid json');
    const { result } = renderHook(() => useSortState('sort-broken', { key: 'code', dir: 'desc' }));
    expect(result.current[0]).toEqual({ key: 'code', dir: 'desc' });
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

function headerLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('thead th')).map(th =>
    (th.textContent ?? '').replace(/[▲▼\s]/g, ''),
  );
}

describe('DataTable 列順序の入れ替え', () => {
  it('localStorage に保存済みの順序があれば復元する', () => {
    localStorage.setItem(
      'bv_table_order_test-order-restore',
      JSON.stringify(['amount', 'name', 'actions']),
    );
    const { container } = render(
      <DataTable
        tableId="test-order-restore"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    expect(headerLabels(container)).toEqual(['金額', '名前', '操作']);
  });

  it('保存済み順序に無い新規列は末尾に定義順で追加される', () => {
    localStorage.setItem(
      'bv_table_order_test-order-partial',
      JSON.stringify(['amount']),
    );
    const { container } = render(
      <DataTable
        tableId="test-order-partial"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    expect(headerLabels(container)).toEqual(['金額', '名前', '操作']);
  });

  it('ヘッダーをドラッグして別の列にドロップすると表示順が入れ替わり localStorage に保存される', () => {
    const storageKey = 'bv_table_order_test-order-drag';
    const { container } = render(
      <DataTable
        tableId="test-order-drag"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const nameTh = screen.getByText('名前').closest('th') as HTMLElement;
    const amountTh = screen.getByText('金額').closest('th') as HTMLElement;

    fireEvent.pointerDown(nameTh, { clientX: 10, pointerId: 2 });
    fireEvent.pointerMove(amountTh, { clientX: 200, pointerId: 2 });
    fireEvent.pointerUp(window, { clientX: 200, pointerId: 2 });

    expect(headerLabels(container)).toEqual(['金額', '名前', '操作']);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? 'null')).toEqual([
      'amount',
      'name',
      'actions',
    ]);
  });

  it('入れ替えた順序は同じ tableId で再マウントしても復元される', () => {
    const { container, unmount } = render(
      <DataTable
        tableId="test-order-remount"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const nameTh = screen.getByText('名前').closest('th') as HTMLElement;
    const amountTh = screen.getByText('金額').closest('th') as HTMLElement;
    fireEvent.pointerDown(nameTh, { clientX: 10, pointerId: 3 });
    fireEvent.pointerMove(amountTh, { clientX: 200, pointerId: 3 });
    fireEvent.pointerUp(window, { clientX: 200, pointerId: 3 });
    expect(headerLabels(container)).toEqual(['金額', '名前', '操作']);
    unmount();

    const { container: c2 } = render(
      <DataTable
        tableId="test-order-remount"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    expect(headerLabels(c2)).toEqual(['金額', '名前', '操作']);
  });

  it('列幅設定は列の中身と一緒に移動する', () => {
    localStorage.setItem(
      'bv_table_widths_test-order-width',
      JSON.stringify({ amount: 200 }),
    );
    const { container } = render(
      <DataTable
        tableId="test-order-width"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const nameTh = screen.getByText('名前').closest('th') as HTMLElement;
    const amountTh = screen.getByText('金額').closest('th') as HTMLElement;
    fireEvent.pointerDown(nameTh, { clientX: 10, pointerId: 4 });
    fireEvent.pointerMove(amountTh, { clientX: 200, pointerId: 4 });
    fireEvent.pointerUp(window, { clientX: 200, pointerId: 4 });

    // 入れ替え後、金額列が先頭。その幅200pxが追従していること
    expect(headerLabels(container)).toEqual(['金額', '名前', '操作']);
    const firstCol = container.querySelectorAll('colgroup col')[0] as HTMLElement;
    expect(firstCol.style.width).toBe('200px');
  });

  it('実際にドラッグして移動した場合は直後のクリックでソートが誤発火しない', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-order-nosort"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onSortChange={onSortChange}
      />,
    );
    const nameTh = screen.getByText('名前').closest('th') as HTMLElement;
    const amountTh = screen.getByText('金額').closest('th') as HTMLElement;
    fireEvent.pointerDown(nameTh, { clientX: 10, pointerId: 5 });
    fireEvent.pointerMove(amountTh, { clientX: 200, pointerId: 5 });
    fireEvent.pointerUp(window, { clientX: 200, pointerId: 5 });
    // ブラウザはドラッグ後に click を発火するが、それでソートしてはいけない
    fireEvent.click(nameTh);
    expect(onSortChange).not.toHaveBeenCalled();
  });

  it('ドラッグせずクリックした場合は従来通りソートが発火する', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-order-clicksort"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onSortChange={onSortChange}
      />,
    );
    const nameTh = screen.getByText('名前').closest('th') as HTMLElement;
    fireEvent.pointerDown(nameTh, { clientX: 10, pointerId: 6 });
    fireEvent.pointerUp(window, { clientX: 10, pointerId: 6 });
    fireEvent.click(nameTh);
    expect(onSortChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('リサイズハンドルのドラッグでは列順序が変わらない', () => {
    const { container } = render(
      <DataTable
        tableId="test-order-resize-sep"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const handle = container.querySelector('.bv-datatable-resize-handle') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 7 });
    fireEvent.pointerMove(window, { clientX: 300, pointerId: 7 });
    fireEvent.pointerUp(window, { clientX: 300, pointerId: 7 });
    expect(headerLabels(container)).toEqual(['名前', '金額', '操作']);
    expect(localStorage.getItem('bv_table_order_test-order-resize-sep')).toBeNull();
  });
});

describe('DataTable 複合ソート（multiSort）', () => {
  it('multiSort未指定時はShift+クリックでも通常クリックと同じonSortChangeが呼ばれる（後方互換）', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-multisort-off"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByText('名前'), { shiftKey: true });
    expect(onSortChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('multiSort有効時、通常クリックは単一キー配列でonMultiSortChangeを呼ぶ（複合ソートをリセット）', () => {
    const onMultiSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-multisort-1"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        multiSort
        sortKeys={[{ key: 'amount', dir: 'asc' }]}
        onMultiSortChange={onMultiSortChange}
      />,
    );
    fireEvent.click(screen.getByText('名前'));
    expect(onMultiSortChange).toHaveBeenCalledWith([{ key: 'name', dir: 'asc' }]);
  });

  it('multiSort有効時、Shift+クリックで第2ソートキーとして追加される', () => {
    const onMultiSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-multisort-2"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        multiSort
        sortKeys={[{ key: 'name', dir: 'asc' }]}
        onMultiSortChange={onMultiSortChange}
      />,
    );
    fireEvent.click(screen.getByText('金額'), { shiftKey: true });
    expect(onMultiSortChange).toHaveBeenCalledWith([
      { key: 'name', dir: 'asc' },
      { key: 'amount', dir: 'asc' },
    ]);
  });

  it('multiSort有効時、既存キーを再度Shift+クリックすると昇順/降順がトグルされ末尾に付け直される', () => {
    const onMultiSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-multisort-3"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        multiSort
        sortKeys={[
          { key: 'name', dir: 'asc' },
          { key: 'amount', dir: 'asc' },
        ]}
        onMultiSortChange={onMultiSortChange}
      />,
    );
    fireEvent.click(screen.getByText('名前'), { shiftKey: true });
    expect(onMultiSortChange).toHaveBeenCalledWith([
      { key: 'amount', dir: 'asc' },
      { key: 'name', dir: 'desc' },
    ]);
  });

  it('multiSort有効時、ヘッダーに現在のソート順位(▲1 ▲2)が表示される', () => {
    render(
      <DataTable
        tableId="test-multisort-4"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        multiSort
        sortKeys={[
          { key: 'name', dir: 'asc' },
          { key: 'amount', dir: 'desc' },
        ]}
      />,
    );
    const nameTh = screen.getByText('名前').closest('th') as HTMLElement;
    const amountTh = screen.getByText('金額').closest('th') as HTMLElement;
    expect(nameTh.textContent).toContain('▲1');
    expect(amountTh.textContent).toContain('▼2');
  });

  it('multiSort有効かつonMultiSortChange未指定時はonSortChangeが呼ばれない（安全側フォールバック）', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        tableId="test-multisort-5"
        columns={makeColumns()}
        rows={ROWS}
        rowKey={r => r.id}
        multiSort
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByText('名前'));
    expect(onSortChange).not.toHaveBeenCalled();
  });
});

function widthColumns(): DataTableColumn<Row>[] {
  return [
    { key: 'name', label: '名前', width: 100, render: r => r.name },
    { key: 'amount', label: '金額', width: 120, render: r => String(r.amount) },
    { key: 'actions', label: '操作', width: 80, render: r => `操作${r.id}` },
  ];
}

describe('DataTable 列幅リサイズ（対象列のみ変化）', () => {
  it('真ん中の列の右端をドラッグするとその列だけ幅が変わり、隣接・非隣接列は変わらない', () => {
    const { container } = render(
      <DataTable
        tableId="test-width-isolated"
        columns={widthColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const handles = container.querySelectorAll('.bv-datatable-resize-handle');
    const middleHandle = handles[1] as HTMLElement;

    fireEvent.pointerDown(middleHandle, { clientX: 200, pointerId: 10 });
    fireEvent.pointerMove(window, { clientX: 260, pointerId: 10 });
    fireEvent.pointerUp(window, { clientX: 260, pointerId: 10 });

    const cols = container.querySelectorAll('colgroup col');
    expect((cols[1] as HTMLElement).style.width).toBe('180px');
    expect((cols[0] as HTMLElement).style.width).toBe('100px');
    expect((cols[2] as HTMLElement).style.width).toBe('80px');
  });

  it('テーブルは横スクロール可能なコンテナでラップされる', () => {
    const { container } = render(
      <DataTable
        tableId="test-width-scroll"
        columns={widthColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const table = container.querySelector('table') as HTMLElement;
    const wrapper = table.parentElement as HTMLElement;
    expect(wrapper.style.overflowX).toBe('auto');
    expect(table.style.width).toBe('max-content');
    // R-0103: minWidth:100%があると他列が比例配分で伸びて総幅が一定になってしまうため指定しない
    expect(table.style.minWidth).toBe('');
  });

  it('列をドラッグで縮めると、他列の幅は変化せずテーブル総幅（列幅合計）が縮む', () => {
    const { container } = render(
      <DataTable
        tableId="test-width-shrink-total"
        columns={widthColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const sumColWidths = () =>
      Array.from(container.querySelectorAll('colgroup col')).reduce(
        (sum, col) => sum + parseFloat((col as HTMLElement).style.width || '0'),
        0,
      );
    const totalBefore = sumColWidths();

    const handles = container.querySelectorAll('.bv-datatable-resize-handle');
    const firstHandle = handles[0] as HTMLElement;
    fireEvent.pointerDown(firstHandle, { clientX: 200, pointerId: 11 });
    fireEvent.pointerMove(window, { clientX: 150, pointerId: 11 });
    fireEvent.pointerUp(window, { clientX: 150, pointerId: 11 });

    const cols = container.querySelectorAll('colgroup col');
    expect((cols[0] as HTMLElement).style.width).toBe('60px');
    expect((cols[1] as HTMLElement).style.width).toBe('120px');
    expect((cols[2] as HTMLElement).style.width).toBe('80px');
    expect(sumColWidths()).toBe(totalBefore - 40);

    const table = container.querySelector('table') as HTMLElement;
    // 総幅が列幅合計に追従できるよう、テーブルにminWidth:100%を指定しない
    expect(table.style.minWidth).toBe('');
  });

  it('リサイズハンドルの縦線色はヘッダー文字色と一致する', () => {
    const { container } = render(
      <DataTable
        tableId="test-width-line"
        columns={widthColumns()}
        rows={ROWS}
        rowKey={r => r.id}
      />,
    );
    const handle = container.querySelector('.bv-datatable-resize-handle') as HTMLElement;
    const th = screen.getByText('名前').closest('th') as HTMLElement;
    expect(handle.style.borderRightStyle).toBe('solid');
    expect(handle.style.borderRightColor).toBe(th.style.color);
  });
});
