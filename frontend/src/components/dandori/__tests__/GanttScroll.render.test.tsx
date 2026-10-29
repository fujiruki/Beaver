import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GanttScroll from '../GanttScroll';
import type { DandoriBar } from '../dandoriBoardUtils';
import { salesCategoryBorderColor } from '../../../pages/DandoriBoard';

const STORAGE_KEY = 'bv_dandori_label_widths';

const bar: DandoriBar = {
  id: 1,
  name: '客室建具改修工事（長い案件名で得意先名が隠れないことを確認する）',
  customerName: '山田建設',
  isShop: false,
  category: 'working',
  start: '2026-09-01',
  end: '2026-09-03',
  delivery: null,
  hours: 24,
  segments: [{ scheduleId: 10, start: '2026-09-01', end: '2026-09-03', hours: 24, fixedEnd: null, done: false, unknownHours: false }],
  frame: { start: '2026-09-01', end: '2026-09-03' },
};

const SALES_CATEGORY_COLORS: Record<number, string> = {
  1: '#2563eb',
  2: '#38bdf8',
  3: '#8b5cf6',
  5: '#ffffff',
};

function renderGantt(onNearRightEdge?: () => void) {
  return render(
    <GanttScroll
      bars={[bar]}
      rangeStart="2026-08-25"
      rangeEnd="2026-09-15"
      pxPerDay={24}
      todayISO="2026-09-01"
      onCommit={vi.fn()}
      onProjectDoubleClick={vi.fn()}
      onNearRightEdge={onNearRightEdge}
    />,
  );
}

function mockScrollMetrics(el: HTMLElement, metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperty(el, 'scrollWidth', { value: metrics.scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: metrics.clientWidth, configurable: true });
  Object.defineProperty(el, 'scrollLeft', { value: metrics.scrollLeft, configurable: true, writable: true });
}

describe('GanttScroll 案件名・得意先名の2列表示（R-0138）', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('案件名と得意先名が別々の列要素として表示される', () => {
    const { container } = renderGantt();
    const row = container.querySelector('.row') as HTMLElement;
    const nameCol = row.querySelector('.name-col') as HTMLElement;
    const custCol = row.querySelector('.cust-col') as HTMLElement;
    expect(nameCol).toBeTruthy();
    expect(custCol).toBeTruthy();
    expect(nameCol.contains(row.querySelector('.name'))).toBe(true);
    expect(custCol.contains(row.querySelector('.cust'))).toBe(true);
    expect(nameCol.style.textAlign).toBe('left');
    expect(custCol.style.textAlign).toBe('left');
  });

  it('見出し行に「案件名」「得意先」の2つの見出しが表示される', () => {
    const { container } = renderGantt();
    const axis = container.querySelector('.axis .label-col') as HTMLElement;
    expect(axis.textContent).toContain('案件名');
    expect(axis.textContent).toContain('得意先');
  });

  it('見出し行にのみドラッグハンドルが2つ表示され、各行には表示されない', () => {
    const { container } = renderGantt();
    const axisHandles = container.querySelectorAll('.axis .label-col .resize-handle');
    expect(axisHandles.length).toBe(2);
    const rowHandles = container.querySelectorAll('.row .label-col .resize-handle');
    expect(rowHandles.length).toBe(0);
  });

  it('案件名/得意先名の境界ハンドルをドラッグするとnameColWidthが変わりlocalStorageへ保存される', () => {
    const { container } = renderGantt();
    const nameHandle = container.querySelector('.resize-handle-name') as HTMLElement;
    const nameColBefore = (container.querySelector('.row .name-col') as HTMLElement).style.width;

    fireEvent.pointerDown(nameHandle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 160, pointerId: 1 });
    const nameColDuring = (container.querySelector('.row .name-col') as HTMLElement).style.width;
    expect(nameColDuring).not.toBe(nameColBefore);
    fireEvent.pointerUp(window, { clientX: 160, pointerId: 1 });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(saved).toBeTruthy();
    expect(typeof saved.name).toBe('number');
    expect(typeof saved.total).toBe('number');
  });

  it('ラベル全体/ガント本体の境界ハンドルをドラッグするとlabelTotalWidthが変わりlocalStorageへ保存される', () => {
    const { container } = renderGantt();
    const totalHandle = container.querySelector('.resize-handle-total') as HTMLElement;
    const labelColBefore = (container.querySelector('.row .label-col') as HTMLElement).style.width;

    fireEvent.pointerDown(totalHandle, { clientX: 300, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 360, pointerId: 2 });
    const labelColDuring = (container.querySelector('.row .label-col') as HTMLElement).style.width;
    expect(labelColDuring).not.toBe(labelColBefore);
    fireEvent.pointerUp(window, { clientX: 360, pointerId: 2 });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(saved.total).toBeGreaterThan(parseFloat(labelColBefore));
  });

  it('保存済みのbv_dandori_label_widthsがある状態でマウントすると幅が復元される', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 180, total: 300 }));
    const { container } = renderGantt();
    const nameCol = container.querySelector('.row .name-col') as HTMLElement;
    const labelCol = container.querySelector('.row .label-col') as HTMLElement;
    expect(nameCol.style.width).toBe('180px');
    expect(labelCol.style.width).toBe('300px');
  });

  it('最小幅を下回るドラッグではクランプされる（nameColWidthは60px未満にならない）', () => {
    const { container } = renderGantt();
    const nameHandle = container.querySelector('.resize-handle-name') as HTMLElement;

    fireEvent.pointerDown(nameHandle, { clientX: 100, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: -10000, pointerId: 3 });
    fireEvent.pointerUp(window, { clientX: -10000, pointerId: 3 });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(saved.name).toBe(60);
  });

  it('最小幅を下回るドラッグではクランプされる（labelTotalWidthは120px未満にならない）', () => {
    const { container } = renderGantt();
    const totalHandle = container.querySelector('.resize-handle-total') as HTMLElement;

    fireEvent.pointerDown(totalHandle, { clientX: 300, pointerId: 4 });
    fireEvent.pointerMove(window, { clientX: -10000, pointerId: 4 });
    fireEvent.pointerUp(window, { clientX: -10000, pointerId: 4 });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    expect(saved.total).toBe(120);
  });
});

describe('R-0189 売上種別による枠線色', () => {
  it.each(Object.entries(SALES_CATEGORY_COLORS))('売上種別%sの枠線色が%sになる', (salesCategoryId, color) => {
    const { container } = render(
      <GanttScroll
        bars={[{ ...bar, salesBorderColor: salesCategoryBorderColor(Number(salesCategoryId)) }]}
        rangeStart="2026-08-25" rangeEnd="2026-09-15" pxPerDay={24} todayISO="2026-09-01"
        onCommit={vi.fn()} onProjectDoubleClick={vi.fn()}
      />,
    );
    expect((container.querySelector('.bar') as HTMLElement).style.getPropertyValue('--sales-border')).toBe(color);
  });

  it.each([4, null])('売上種別%sは枠線色を指定しない', salesCategoryId => {
    const { container } = render(
      <GanttScroll
        bars={[{ ...bar, salesBorderColor: salesCategoryBorderColor(salesCategoryId) }]}
        rangeStart="2026-08-25" rangeEnd="2026-09-15" pxPerDay={24} todayISO="2026-09-01"
        onCommit={vi.fn()} onProjectDoubleClick={vi.fn()}
      />,
    );
    expect((container.querySelector('.bar') as HTMLElement).style.getPropertyValue('--sales-border')).toBe('');
  });

  it('未着手は点線、進行中は実線のクラスを保つ', () => {
    const { container } = render(
      <GanttScroll
        bars={[{ ...bar, id: 1, category: 'notstarted', salesBorderColor: salesCategoryBorderColor(1) }, { ...bar, id: 2, category: 'working', salesBorderColor: salesCategoryBorderColor(2) }]}
        rangeStart="2026-08-25" rangeEnd="2026-09-15" pxPerDay={24} todayISO="2026-09-01"
        onCommit={vi.fn()} onProjectDoubleClick={vi.fn()}
      />,
    );
    const bars = container.querySelectorAll('.bar');
    expect(bars[0].classList.contains('notstarted')).toBe(true);
    expect(bars[1].classList.contains('working')).toBe(true);
  });
});

describe('GanttScroll シームレススクロール（R-0146: onNearRightEdge）', () => {
  it('残り幅が閾値（400px）未満になるとonNearRightEdgeが呼ばれる', () => {
    const onNearRightEdge = vi.fn();
    const { container } = renderGantt(onNearRightEdge);
    const scrollEl = container.querySelector('.gantt-scroll') as HTMLElement;
    mockScrollMetrics(scrollEl, { scrollWidth: 2000, clientWidth: 800, scrollLeft: 1900 }); // 残り -700px

    fireEvent.scroll(scrollEl);

    expect(onNearRightEdge).toHaveBeenCalledTimes(1);
  });

  it('残り幅が閾値以上離れている場合は呼ばれない', () => {
    const onNearRightEdge = vi.fn();
    const { container } = renderGantt(onNearRightEdge);
    const scrollEl = container.querySelector('.gantt-scroll') as HTMLElement;
    mockScrollMetrics(scrollEl, { scrollWidth: 2000, clientWidth: 800, scrollLeft: 100 }); // 残り 1100px

    fireEvent.scroll(scrollEl);

    expect(onNearRightEdge).not.toHaveBeenCalled();
  });

  it('onNearRightEdgeが渡されていない場合はスクロールしてもエラーにならない', () => {
    const { container } = renderGantt(undefined);
    const scrollEl = container.querySelector('.gantt-scroll') as HTMLElement;
    mockScrollMetrics(scrollEl, { scrollWidth: 2000, clientWidth: 800, scrollLeft: 1900 });

    expect(() => fireEvent.scroll(scrollEl)).not.toThrow();
  });
});

describe('R-0218 案件ステータスの右クリック変更', () => {
  it('バーの右クリックでマスタ順の一覧と現在値の印を表示し、選択値を通知する', () => {
    const onStatusChange = vi.fn();
    const { container } = render(
      <GanttScroll
        bars={[{ ...bar, status: '進行中' }]}
        rangeStart="2026-08-25"
        rangeEnd="2026-09-15"
        pxPerDay={24}
        todayISO="2026-09-01"
        onCommit={vi.fn()}
        onProjectDoubleClick={vi.fn()}
        statusOptions={['問い合わせ', '進行中', '完了']}
        onStatusChange={onStatusChange}
      />,
    );

    fireEvent.contextMenu(container.querySelector('.bar') as HTMLElement, { clientX: 30, clientY: 40 });

    const items = screen.getAllByRole('menuitem');
    expect(items.map(item => item.textContent)).toEqual(['問い合わせ', '✓ 進行中', '完了']);
    fireEvent.click(items[2]);
    expect(onStatusChange).toHaveBeenCalledWith(1, '完了');
  });

  it('外側クリックまたはEscで閉じる', () => {
    const { container } = render(
      <GanttScroll
        bars={[{ ...bar, status: '進行中' }]}
        rangeStart="2026-08-25" rangeEnd="2026-09-15" pxPerDay={24} todayISO="2026-09-01"
        onCommit={vi.fn()} onProjectDoubleClick={vi.fn()}
        statusOptions={['進行中', '完了']} onStatusChange={vi.fn()}
      />,
    );
    const projectBar = container.querySelector('.bar') as HTMLElement;

    fireEvent.contextMenu(projectBar);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.contextMenu(projectBar);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('R-0219 前期間へのシームレススクロール', () => {
  it('左端近くで前期間を要求し、追加後も見ていた位置を保つ', () => {
    const onNearLeftEdge = vi.fn();
    const props = {
      bars: [bar], rangeEnd: '2026-09-15', pxPerDay: 24, todayISO: '2026-09-01',
      onCommit: vi.fn(), onProjectDoubleClick: vi.fn(), onNearLeftEdge,
    };
    const { container, rerender } = render(<GanttScroll {...props} rangeStart="2026-08-25" />);
    const scrollEl = container.querySelector('.gantt-scroll') as HTMLElement;
    mockScrollMetrics(scrollEl, { scrollWidth: 2000, clientWidth: 800, scrollLeft: 100 });

    fireEvent.scroll(scrollEl);
    expect(onNearLeftEdge).toHaveBeenCalledTimes(1);

    Object.defineProperty(scrollEl, 'scrollWidth', { value: 2672, configurable: true });
    rerender(<GanttScroll {...props} rangeStart="2026-07-28" />);
    expect(scrollEl.scrollLeft).toBe(772);
  });
});

describe('R-0222 製作のバー・全体の枠・予定のラベル', () => {
  const baseProps = {
    rangeStart: '2026-08-25', rangeEnd: '2026-09-30', pxPerDay: 24, todayISO: '2026-09-01',
    onCommit: vi.fn(), onProjectDoubleClick: vi.fn(),
  };
  const sch = (over: object) => ({
    id: 1, project_id: 1, kind: '見積', start_date: null, end_date: '2026-09-10', hours: null,
    memo: '', done: 0, created_at: '', updated_at: '', ...over,
  });

  function drag(barEl: HTMLElement, px: number) {
    barEl.setPointerCapture = vi.fn();
    barEl.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(barEl, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(barEl, { clientX: 100 + px, pointerId: 1 });
    fireEvent.pointerUp(barEl, { clientX: 100 + px, pointerId: 1 });
  }

  it('製作が2本あれば1つの行に2本のバーを描く', () => {
    const two = {
      ...bar,
      segments: [
        { scheduleId: 10, start: '2026-09-01', end: '2026-09-03', hours: 24, fixedEnd: null, done: false, unknownHours: false },
        { scheduleId: 11, start: '2026-09-10', end: '2026-09-11', hours: 16, fixedEnd: null, done: false, unknownHours: false },
      ],
      frame: { start: '2026-09-01', end: '2026-09-11' },
    };
    const { container } = render(<GanttScroll {...baseProps} bars={[two]} />);
    expect(container.querySelectorAll('.row')).toHaveLength(1);
    expect(container.querySelectorAll('.bar')).toHaveLength(2);
  });

  it('製作のバーが無い行（予定だけ）はバーを描かない', () => {
    const none = { ...bar, segments: [], frame: { start: '2026-09-10', end: '2026-09-10' } };
    const { container } = render(<GanttScroll {...baseProps} bars={[none]} schedules={[sch({}) as never]} />);
    expect(container.querySelectorAll('.bar')).toHaveLength(0);
    expect(container.querySelector('.sched-diamond')).toBeTruthy();
  });

  it('行に予定全体の薄い枠を、一番早い日から一番遅い日まで描く', () => {
    const { container } = render(<GanttScroll {...baseProps} bars={[bar]} />);
    const frame = container.querySelector('.sched-frame') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.style.left).toBe(`${7 * 24}px`);
    expect(frame.style.width).toBe(`${3 * 24}px`);
  });

  it('枠が無い行（frame=null）には描かない', () => {
    const { container } = render(<GanttScroll {...baseProps} bars={[{ ...bar, segments: [], frame: null }]} />);
    expect(container.querySelector('.sched-frame')).toBeNull();
  });

  it('予定のラベルは種類名の横に時間を出す', () => {
    const { container } = render(
      <GanttScroll {...baseProps} bars={[bar]} schedules={[sch({ start_date: '2026-09-08', end_date: '2026-09-10', hours: 2 }) as never]} />,
    );
    expect(container.textContent).toContain('見積 2h');
  });

  it('製作のバーのドラッグは、その製作の予定の開始日を動かす', () => {
    const onScheduleMove = vi.fn();
    const { container } = render(<GanttScroll {...baseProps} bars={[bar]} onScheduleMove={onScheduleMove} />);
    drag(container.querySelector('.bar') as HTMLElement, 48);
    expect(onScheduleMove).toHaveBeenCalledWith(10, { start_date: '2026-09-03' });
  });

  it('終了のある製作のバーのドラッグは、終了も同じ日数動かす', () => {
    const onScheduleMove = vi.fn();
    const withEnd = { ...bar, segments: [{ ...bar.segments[0], fixedEnd: '2026-09-03' }] };
    const { container } = render(<GanttScroll {...baseProps} bars={[withEnd]} onScheduleMove={onScheduleMove} />);
    drag(container.querySelector('.bar') as HTMLElement, 24);
    expect(onScheduleMove).toHaveBeenCalledWith(10, { start_date: '2026-09-02', end_date: '2026-09-04' });
  });
});
