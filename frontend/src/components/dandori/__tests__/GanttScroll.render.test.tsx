import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import GanttScroll from '../GanttScroll';
import type { DandoriBar } from '../dandoriBoardUtils';

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
  unknownHours: false,
};

function renderGantt() {
  return render(
    <GanttScroll
      bars={[bar]}
      rangeStart="2026-08-25"
      rangeEnd="2026-09-15"
      pxPerDay={24}
      todayISO="2026-09-01"
      onCommit={vi.fn()}
      onProjectDoubleClick={vi.fn()}
    />,
  );
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
