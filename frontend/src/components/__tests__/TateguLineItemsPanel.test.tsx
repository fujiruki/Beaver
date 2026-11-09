import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TateguCostLinesPanel, TateguLaborLinesPanel } from '../TateguLineItemsPanel';
import type { AggregationCategoryMaster } from '../../api/aggregationCategories';
import type { CostLineDraft, LaborLineDraft } from '../TateguLineItemsPanel';

const categories: AggregationCategoryMaster[] = [
  { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1, is_active: 1, synced_at: '' },
  { id: 2, code: 'HARDWARE', name: '金物', measure_type: 'money', sort_order: 2, is_active: 1, synced_at: '' },
  { id: 3, code: 'GLASS', name: 'ガラス', measure_type: 'money', sort_order: 3, is_active: 1, synced_at: '' },
  { id: 4, code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4, is_active: 1, synced_at: '' },
  { id: 5, code: 'SITE_TIME', name: '現場時間', measure_type: 'time', sort_order: 5, is_active: 1, synced_at: '' },
];

function CostLinesHarness() {
  const [lines, setLines] = useState<CostLineDraft[]>([]);
  return <TateguCostLinesPanel lines={lines} onChange={setLines} categories={categories} />;
}

function materialRows() {
  return screen.getByRole('table', { name: '材料費明細' }).querySelectorAll('tbody tr');
}

function laborRows() {
  return screen.getByRole('table', { name: '労務費明細' }).querySelectorAll('tbody tr');
}

function typeAndLeave(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input, { relatedTarget: document.body });
}

describe('TateguCostLinesPanel', () => {
  it('R-0232 入力した本体空行の単価でTabすると追加後の本体空行の材料名へ移る', () => {
    render(<CostLinesHarness />);
    const row = materialRows()[0] as HTMLElement;
    fireEvent.change(within(row).getByLabelText('材料名'), { target: { value: 'オーデ' } });
    fireEvent.change(within(row).getByLabelText('数量'), { target: { value: '2' } });
    const unitCost = within(row).getByLabelText('材料単価');
    fireEvent.change(unitCost, { target: { value: '1000' } });
    fireEvent.keyDown(unitCost, { key: 'Tab' });

    expect(materialRows()).toHaveLength(4);
    expect(document.activeElement).toBe(within(materialRows()[1] as HTMLElement).getByLabelText('材料名'));
  });

  it('R-0232 空の本体材料名のTabと金物材料名のShift+Tabは空行の名称間を移る', () => {
    render(<CostLinesHarness />);
    const bodyName = within(materialRows()[0] as HTMLElement).getByLabelText('材料名');
    const hardwareName = within(materialRows()[1] as HTMLElement).getByLabelText('材料名');
    bodyName.focus();
    fireEvent.keyDown(bodyName, { key: 'Tab' });
    expect(document.activeElement).toBe(hardwareName);
    fireEvent.keyDown(hardwareName, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(bodyName);
  });
  it('R-0231 空の行へ続けて入力しても1行のままフォーカスが外れず、行から出ると1行だけ加わる', () => {
    render(<CostLinesHarness />);
    const input = within(materialRows()[0] as HTMLElement).getByLabelText('材料名') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '芯' } });
    fireEvent.change(input, { target: { value: '芯材' } });
    expect(materialRows()).toHaveLength(3);
    expect(document.activeElement).toBe(input);
    expect((within(materialRows()[0] as HTMLElement).getByLabelText('材料名') as HTMLInputElement).value).toBe('芯材');

    fireEvent.blur(input, { relatedTarget: document.body });
    expect(materialRows()).toHaveLength(4);
    expect((within(materialRows()[0] as HTMLElement).getByLabelText('材料名') as HTMLInputElement).value).toBe('芯材');
    expect((within(materialRows()[1] as HTMLElement).getByLabelText('材料名') as HTMLInputElement).value).toBe('');
  });

  it('R-0231 AC1: 行が無いとき区分順に材料費の空行を1行ずつ表示する', () => {
    render(<TateguCostLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);

    expect(Array.from(materialRows(), (row) => within(row as HTMLElement).getByText(/本体|金物|ガラス/).textContent))
      .toEqual(['本体', '金物', 'ガラス']);
  });

  it('R-0231 AC2: 本体とガラスの空行へ続けて入力すると各区分の直後に新しい空行を表示する', () => {
    render(<CostLinesHarness />);

    typeAndLeave(within(materialRows()[0] as HTMLElement).getByLabelText('材料名'), '框材');
    expect(Array.from(materialRows(), (row) => row.textContent)).toEqual([
      expect.stringContaining('本体'),
      expect.stringContaining('本体'),
      expect.stringContaining('金物'),
      expect.stringContaining('ガラス'),
    ]);
    expect((within(materialRows()[0] as HTMLElement).getByLabelText('材料名') as HTMLInputElement).value).toBe('框材');
    expect((within(materialRows()[1] as HTMLElement).getByLabelText('材料名') as HTMLInputElement).value).toBe('');

    typeAndLeave(within(materialRows()[3] as HTMLElement).getByLabelText('材料名'), '透明ガラス');
    expect(Array.from(materialRows(), (row) => row.textContent)).toEqual([
      expect.stringContaining('本体'),
      expect.stringContaining('本体'),
      expect.stringContaining('金物'),
      expect.stringContaining('ガラス'),
      expect.stringContaining('ガラス'),
    ]);
    expect((within(materialRows()[3] as HTMLElement).getByLabelText('材料名') as HTMLInputElement).value).toBe('透明ガラス');
    expect((within(materialRows()[4] as HTMLElement).getByLabelText('材料名') as HTMLInputElement).value).toBe('');
  });

  it('R-0231 AC3: 空でない行だけを正しい区分で変更通知する', () => {
    const onChange = vi.fn();
    render(<TateguCostLinesPanel lines={[]} onChange={onChange} categories={categories} />);

    typeAndLeave(within(materialRows()[1] as HTMLElement).getByLabelText('材料名'), '丁番');

    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({
      category_code: 'HARDWARE',
      name: '丁番',
      sort_order: 0,
    })]);
    expect(onChange.mock.calls.at(-1)?.[0]).toHaveLength(1);
  });

  it('数量と単価から金額を自動計算し、変更内容を返す', () => {
    const onChange = vi.fn();
    const lines: CostLineDraft[] = [{
      category_code: 'MAIN',
      name: '框材',
      quantity: 2,
      unit_cost: 1000,
      amount: 2000,
      source: 'manual',
      sort_order: 0,
    }];

    render(<TateguCostLinesPanel lines={lines} onChange={onChange} categories={categories} />);

    expect(screen.getAllByText('¥2,000').length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByLabelText('材料単価')[0], { target: { value: '1500' } });

    expect(onChange).toHaveBeenCalledWith([{
      ...lines[0],
      unit_cost: 1500,
      amount: 3000,
      sort_order: 0,
    }]);
  });

  it('末尾の空行へ入力すると材料行が追加され、行追加ボタンは出さない', () => {
    const onChange = vi.fn();

    render(<TateguCostLinesPanel lines={[]} onChange={onChange} categories={categories} />);
    expect(screen.queryByText('+ 行追加')).toBeNull();
    typeAndLeave(screen.getAllByLabelText('材料名')[0], '框材');

    expect(onChange).toHaveBeenCalledWith([{
      category_code: 'MAIN',
      name: '框材',
      quantity: 1,
      unit_cost: 0,
      amount: 0,
      source: 'manual',
      sort_order: 0,
    }]);
  });

  it('数値入力は右寄せで、非フォーカス時に数量はコンマ、単価は円記号を表示する', () => {
    render(<TateguCostLinesPanel lines={[{
      category_code: 'MAIN', name: '框材', quantity: 1200, unit_cost: 13200,
      amount: 15840000, source: 'manual', sort_order: 0,
    }]} onChange={vi.fn()} categories={categories} />);

    expect((screen.getAllByLabelText('数量')[0] as HTMLInputElement).value).toBe('1,200');
    expect((screen.getAllByLabelText('材料単価')[0] as HTMLInputElement).value).toBe('¥13,200');
    expect((screen.getAllByLabelText('数量')[0] as HTMLInputElement).style.textAlign).toBe('right');
    fireEvent.focus(screen.getAllByLabelText('材料単価')[0]);
    expect((screen.getAllByLabelText('材料単価')[0] as HTMLInputElement).value).toBe('13200');
  });

  it('単価は整数刻みで、wood_calc 行は読み取り専用かつ削除できない', () => {
    const onChange = vi.fn();
    const lines: CostLineDraft[] = [{
      category_code: 'MAIN', name: '木材計算', quantity: 2, unit_cost: 800,
      amount: 1600, source: 'wood_calc', sort_order: 0,
    }];

    render(<TateguCostLinesPanel lines={lines} onChange={onChange} categories={categories} />);

    expect(screen.getAllByLabelText('材料単価')[0].getAttribute('step')).toBe('1');
    expect((screen.getAllByLabelText('材料単価')[0] as HTMLInputElement).disabled).toBe(true);
    expect((screen.getAllByLabelText('数量')[0] as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull();
  });
});

const labor = (process_name: string, category_code: string, work_hours: number, sort_order: number, labor_rate = 4000): LaborLineDraft =>
  ({ process_name, category_code, work_hours, labor_rate, amount: work_hours * labor_rate, sort_order });
const cost = (category_code: string, name: string, sort_order: number, source: 'manual' | 'wood_calc' = 'manual'): CostLineDraft =>
  ({ category_code, name, quantity: 1, unit_cost: 100, amount: 100, source, sort_order });

function LaborHarness({ initial = [] }: { initial?: LaborLineDraft[] }) {
  const [lines, setLines] = useState<LaborLineDraft[]>(initial);
  return <TateguLaborLinesPanel lines={lines} onChange={setLines} categories={categories} />;
}

const rowValues = (row: Element, label: string) => (within(row as HTMLElement).getByLabelText(label) as HTMLInputElement).value;

describe('TateguLaborLinesPanel', () => {
  it('R-0237 工場時間・現場時間の空行は時間を空で表示する', () => {
    render(<TateguLaborLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);

    expect(screen.getAllByLabelText('工場時間').map((input) => (input as HTMLInputElement).value)).toEqual(['']);
    expect(screen.getAllByLabelText('現場時間').map((input) => (input as HTMLInputElement).value)).toEqual(['']);
  });

  it('R-0237 工程名だけ入力して行を出ると工場時間0の行を1つ追加する', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel lines={[]} onChange={onChange} categories={categories} />);

    typeAndLeave(screen.getAllByLabelText('工程名')[0], '組立');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ process_name: '組立', category_code: 'FACTORY_TIME', work_hours: 0, sort_order: 1 }),
    ]);
  });

  it('R-0237 何も入力せずに空行を出ても行を追加しない', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel lines={[]} onChange={onChange} categories={categories} />);

    fireEvent.blur(screen.getAllByLabelText('工程名')[0], { relatedTarget: document.body });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('R-0251 労務費は1作業1行の列で、区分の列と区分ごとの空行を持たない', () => {
    render(<TateguLaborLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);

    const table = screen.getByRole('table', { name: '労務費明細' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(['工程名', '工場時間', '現場時間', '労務単価', '金額', '']);
    expect(laborRows()).toHaveLength(1);
    expect(screen.queryByLabelText('労務区分')).toBeNull();
  });

  it('R-0251 入力した空行の労務単価でTabすると追加後の空行の工程名へ移る', () => {
    render(<LaborHarness />);
    const row = laborRows()[0] as HTMLElement;
    fireEvent.change(within(row).getByLabelText('工程名'), { target: { value: '組立' } });
    fireEvent.change(within(row).getByLabelText('工場時間'), { target: { value: '2' } });
    const rate = within(row).getByLabelText('労務単価');
    fireEvent.change(rate, { target: { value: '1000' } });
    fireEvent.keyDown(rate, { key: 'Tab' });

    expect(laborRows()).toHaveLength(2);
    expect(rowValues(laborRows()[0], '工程名')).toBe('組立');
    expect(document.activeElement).toBe(within(laborRows()[1] as HTMLElement).getByLabelText('工程名'));
  });

  it('R-0251 空行の工場時間・現場時間のTabは横取りせず、次の欄へ自然に進む', () => {
    render(<LaborHarness />);
    const row = laborRows()[0] as HTMLElement;
    for (const label of ['工程名', '工場時間', '現場時間']) {
      expect(fireEvent.keyDown(within(row).getByLabelText(label), { key: 'Tab' })).toBe(true);
    }
  });

  it('R-0232 IME変換中のTabとEnterを横取りしない', () => {
    render(<TateguLaborLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);
    const name = screen.getAllByLabelText('工程名')[0];
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, isComposing: true });
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    name.dispatchEvent(tab);
    name.dispatchEvent(enter);
    expect(tab.defaultPrevented).toBe(false);
    expect(enter.defaultPrevented).toBe(false);
  });

  it('R-0231 空の行へ続けて入力しても1行のままフォーカスが外れず、行から出ると1行だけ加わる', () => {
    render(<LaborHarness />);
    const input = within(laborRows()[0] as HTMLElement).getByLabelText('工程名') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '組' } });
    fireEvent.change(input, { target: { value: '組立' } });
    expect(laborRows()).toHaveLength(1);
    expect(document.activeElement).toBe(input);

    fireEvent.blur(input, { relatedTarget: document.body });
    expect(laborRows()).toHaveLength(2);
    expect(rowValues(laborRows()[0], '工程名')).toBe('組立');
    expect(rowValues(laborRows()[1], '工程名')).toBe('');
  });

  it('R-0251 読み: 工場A・現場A・工場B は2行（A は工場と現場、B は工場のみ）', () => {
    render(<LaborHarness initial={[labor('A', 'FACTORY_TIME', 2, 1), labor('A', 'SITE_TIME', 3, 2), labor('B', 'FACTORY_TIME', 1, 3)]} />);

    expect(laborRows()).toHaveLength(3);
    expect([rowValues(laborRows()[0], '工程名'), rowValues(laborRows()[0], '工場時間'), rowValues(laborRows()[0], '現場時間')]).toEqual(['A', '2', '3']);
    expect([rowValues(laborRows()[1], '工程名'), rowValues(laborRows()[1], '工場時間'), rowValues(laborRows()[1], '現場時間')]).toEqual(['B', '1', '']);
  });

  it('R-0251 読み: 現場だけの行は工場0の1行になり、離れた同名の行や単価違いの行は束ねない', () => {
    render(<LaborHarness initial={[labor('X', 'SITE_TIME', 4, 1), labor('Y', 'FACTORY_TIME', 1, 2), labor('Y', 'SITE_TIME', 1, 3, 5000)]} />);

    expect(laborRows()).toHaveLength(4);
    expect([rowValues(laborRows()[0], '工程名'), rowValues(laborRows()[0], '工場時間'), rowValues(laborRows()[0], '現場時間')]).toEqual(['X', '', '4']);
    expect([rowValues(laborRows()[1], '工場時間'), rowValues(laborRows()[1], '現場時間')]).toEqual(['1', '']);
    expect([rowValues(laborRows()[2], '工場時間'), rowValues(laborRows()[2], '現場時間')]).toEqual(['', '1']);
  });

  it('R-0251 書き: 画面の k 行目は工場が 2k-1、現場が 2k の sort_order になる', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel
      lines={[labor('A', 'FACTORY_TIME', 2, 1), labor('A', 'SITE_TIME', 3, 2), labor('B', 'FACTORY_TIME', 1, 3)]}
      onChange={onChange}
      categories={categories}
    />);

    fireEvent.change(within(laborRows()[1] as HTMLElement).getByLabelText('工場時間'), { target: { value: '5' } });

    const written = onChange.mock.calls.at(-1)?.[0] as LaborLineDraft[];
    expect(written.map((l) => [l.process_name, l.category_code, l.work_hours, l.sort_order])).toEqual([
      ['A', 'FACTORY_TIME', 2, 1], ['A', 'SITE_TIME', 3, 2], ['B', 'FACTORY_TIME', 5, 3],
    ]);
  });

  it('R-0251 書き: 現場を0にすると現場の行は作らず、両方0でも工程名があれば工場0で残す', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel
      lines={[labor('A', 'FACTORY_TIME', 2, 1), labor('A', 'SITE_TIME', 3, 2)]}
      onChange={onChange}
      categories={categories}
    />);

    fireEvent.change(within(laborRows()[0] as HTMLElement).getByLabelText('現場時間'), { target: { value: '0' } });
    expect((onChange.mock.calls.at(-1)?.[0] as LaborLineDraft[]).map((l) => [l.category_code, l.sort_order])).toEqual([['FACTORY_TIME', 1]]);

    fireEvent.change(within(laborRows()[0] as HTMLElement).getByLabelText('工場時間'), { target: { value: '0' } });
    expect((onChange.mock.calls.at(-1)?.[0] as LaborLineDraft[]).map((l) => [l.process_name, l.category_code, l.work_hours]))
      .toEqual([['A', 'FACTORY_TIME', 0]]);
  });

  it('R-0251 ▲ で B を上げて書くと B工場 1、A工場 3、A現場 4', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel
      lines={[labor('A', 'FACTORY_TIME', 2, 1), labor('A', 'SITE_TIME', 3, 2), labor('B', 'FACTORY_TIME', 1, 3)]}
      onChange={onChange}
      categories={categories}
    />);

    fireEvent.click(within(laborRows()[1] as HTMLElement).getByRole('button', { name: '上へ' }));

    const written = onChange.mock.calls.at(-1)?.[0] as LaborLineDraft[];
    expect(written.map((l) => [l.process_name, l.category_code, l.sort_order])).toEqual([
      ['B', 'FACTORY_TIME', 1], ['A', 'FACTORY_TIME', 3], ['A', 'SITE_TIME', 4],
    ]);
  });

  it('R-0251 先頭の行は▲、末尾の行は▼が押せず、ボタンは type=button', () => {
    render(<LaborHarness initial={[labor('A', 'FACTORY_TIME', 2, 1), labor('B', 'FACTORY_TIME', 1, 3)]} />);

    expect((within(laborRows()[0] as HTMLElement).getByRole('button', { name: '上へ' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(laborRows()[1] as HTMLElement).getByRole('button', { name: '下へ' }) as HTMLButtonElement).disabled).toBe(true);
    for (const button of screen.getAllByRole('button', { name: /上へ|下へ/ })) {
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('工数と労務単価から金額（工場＋現場）を自動計算し、変更内容を返す', () => {
    const onChange = vi.fn();
    const lines = [labor('組立', 'FACTORY_TIME', 1.5, 1), labor('組立', 'SITE_TIME', 0.5, 2)];

    render(<TateguLaborLinesPanel lines={lines} onChange={onChange} categories={categories} />);

    expect(within(laborRows()[0] as HTMLElement).getByText('¥8,000')).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText('工場時間')[0], { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledWith([
      { ...lines[0], work_hours: 2, amount: 8000, sort_order: 1 },
      { ...lines[1], amount: 2000, sort_order: 2 },
    ]);
  });

  it('工場・現場以外の区分の行は壊さず、表の下に今の形で残す', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel
      lines={[labor('組立', 'FACTORY_TIME', 1, 1), labor('特殊', 'OTHER_TIME', 2, 2)]}
      onChange={onChange}
      categories={categories}
    />);

    fireEvent.change(screen.getAllByLabelText('工場時間')[0], { target: { value: '3' } });

    expect((onChange.mock.calls.at(-1)?.[0] as LaborLineDraft[]).map((l) => [l.process_name, l.category_code])).toEqual([
      ['組立', 'FACTORY_TIME'], ['特殊', 'OTHER_TIME'],
    ]);
  });

  it('末尾の空行へ入力すると工程が追加され、下に新しい空行が残る', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TateguLaborLinesPanel lines={[]} onChange={onChange} categories={categories} />);

    typeAndLeave(screen.getAllByLabelText('工程名')[0], '組立');
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ process_name: '組立' })]);
    expect(screen.queryByText('+ 行追加')).toBeNull();

    const added = onChange.mock.calls[0][0] as LaborLineDraft[];
    rerender(<TateguLaborLinesPanel lines={added} onChange={onChange} categories={categories} />);
    expect(screen.getAllByLabelText('工程名')).toHaveLength(2);
  });
});

describe('R-0251 材料費の▲▼', () => {
  it('同じ区分の中だけで入れ替わり、区分の端では押せない', () => {
    const onChange = vi.fn();
    render(<TateguCostLinesPanel
      lines={[cost('MAIN', '本体1', 0), cost('MAIN', '本体2', 1), cost('HARDWARE', '金物1', 2)]}
      onChange={onChange}
      categories={categories}
    />);

    const rows = Array.from(materialRows());
    expect((within(rows[0] as HTMLElement).getByRole('button', { name: '上へ' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(rows[1] as HTMLElement).getByRole('button', { name: '下へ' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(rows[2] as HTMLElement).getByRole('button', { name: '上へ' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: '下へ' }));
    expect((onChange.mock.calls.at(-1)?.[0] as CostLineDraft[]).map((l) => [l.name, l.sort_order])).toEqual([
      ['本体2', 0], ['本体1', 1], ['金物1', 2],
    ]);
  });

  it('wood_calc の行には▲▼が無く、手で入れた行には type=button の▲▼がある', () => {
    render(<TateguCostLinesPanel
      lines={[cost('MAIN', '木材計算', 0, 'wood_calc'), cost('MAIN', '手入力', 1)]}
      onChange={vi.fn()}
      categories={categories}
    />);

    const rows = Array.from(materialRows());
    expect(within(rows[0] as HTMLElement).queryByRole('button', { name: /上へ|下へ/ })).toBeNull();
    for (const button of within(rows[1] as HTMLElement).getAllByRole('button', { name: /上へ|下へ/ })) {
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('上へで入れ替えて保存用の並びを返す', () => {
    const onChange = vi.fn();
    render(<TateguCostLinesPanel
      lines={[cost('MAIN', '本体1', 0), cost('MAIN', '本体2', 1)]}
      onChange={onChange}
      categories={categories}
    />);

    fireEvent.click(within(materialRows()[1] as HTMLElement).getByRole('button', { name: '上へ' }));
    expect((onChange.mock.calls.at(-1)?.[0] as CostLineDraft[]).map((l) => [l.name, l.sort_order])).toEqual([['本体2', 0], ['本体1', 1]]);
  });
});

describe('R-0231 表のマスの見た目', () => {
  it('入力できるマスは入力欄をマスいっぱいにするクラスを持つ', () => {
    render(<TateguCostLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);
    const cell = screen.getAllByLabelText('材料名')[0].closest('td') as HTMLElement;
    expect(cell.className).toContain('bv-fill-cell');
  });

  it('wood_calc の行のマスは readonly で、編集用クラスを持たない', () => {
    render(<TateguCostLinesPanel lines={[{
      category_code: 'MAIN', name: '木材計算', quantity: 2, unit_cost: 800,
      amount: 1600, source: 'wood_calc', sort_order: 0,
    }]} onChange={vi.fn()} categories={categories} />);
    for (const label of ['材料区分', '材料名', '数量', '材料単価']) {
      const cell = screen.getAllByLabelText(label)[0].closest('td') as HTMLElement;
      expect(cell.className).toContain('bv-readonly');
      expect(cell.className).not.toContain('bv-edit-cell');
    }
  });

  it('工数合計は小数2桁までに丸めて表示する', () => {
    render(<TateguLaborLinesPanel lines={[{
      process_name: '組立', category_code: 'FACTORY_TIME', work_hours: 16.6999999881, labor_rate: 0, amount: 0, sort_order: 0,
    }]} onChange={vi.fn()} categories={categories} />);
    expect(screen.getAllByText(/16\.7 h/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/16\.69999/)).toBeNull();
  });
});
