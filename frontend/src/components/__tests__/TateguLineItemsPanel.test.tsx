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

describe('TateguLaborLinesPanel', () => {
  it('R-0237 工場時間・現場時間の空行は工数を空で表示する', () => {
    render(<TateguLaborLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);

    expect(screen.getAllByLabelText('工数').map((input) => (input as HTMLInputElement).value))
      .toEqual(['', '']);
  });

  it('R-0237 工程名だけ入力して行を出ると工数0の行を1つ追加する', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel lines={[]} onChange={onChange} categories={categories} />);

    typeAndLeave(screen.getAllByLabelText('工程名')[0], '組立');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ process_name: '組立', work_hours: 0 }),
    ]);
  });

  it('R-0237 何も入力せずに空行を出ても行を追加しない', () => {
    const onChange = vi.fn();
    render(<TateguLaborLinesPanel lines={[]} onChange={onChange} categories={categories} />);

    fireEvent.blur(screen.getAllByLabelText('工程名')[0], { relatedTarget: document.body });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('R-0234 労務費の列を材料費と同じ並びと幅にする', () => {
    render(<TateguLaborLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);

    const table = screen.getByRole('table', { name: '労務費明細' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(['区分', '工程名', '工数', '労務単価', '金額', '']);
    expect(headers.map((header) => header.style.width)).toEqual(['112px', '', '96px', '112px', '112px', '48px']);

    const factoryBlankCells = (laborRows()[0] as HTMLTableRowElement).cells;
    expect(factoryBlankCells[0].textContent).toBe('工場時間');
    expect(within(factoryBlankCells[1] as HTMLElement).getByLabelText('工程名')).toBeTruthy();
  });

  it('R-0234 入力した工場時間空行の単価でTabすると追加後の同区分工程名へ移る', () => {
    function Harness() {
      const [lines, setLines] = useState<LaborLineDraft[]>([]);
      return <TateguLaborLinesPanel lines={lines} onChange={setLines} categories={categories} />;
    }
    render(<Harness />);
    const row = laborRows()[0] as HTMLElement;
    fireEvent.change(within(row).getByLabelText('工程名'), { target: { value: '組立' } });
    fireEvent.change(within(row).getByLabelText('工数'), { target: { value: '2' } });
    const rate = within(row).getByLabelText('労務単価');
    fireEvent.change(rate, { target: { value: '1000' } });
    fireEvent.keyDown(rate, { key: 'Tab' });

    expect(laborRows()).toHaveLength(3);
    expect(document.activeElement).toBe(within(laborRows()[1] as HTMLElement).getByLabelText('工程名'));
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
    function Harness() {
      const [lines, setLines] = useState<LaborLineDraft[]>([]);
      return <TateguLaborLinesPanel lines={lines} onChange={setLines} categories={categories} />;
    }
    render(<Harness />);
    const input = within(laborRows()[0] as HTMLElement).getByLabelText('工程名') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '組' } });
    fireEvent.change(input, { target: { value: '組立' } });
    expect(laborRows()).toHaveLength(2);
    expect(document.activeElement).toBe(input);

    fireEvent.blur(input, { relatedTarget: document.body });
    expect(laborRows()).toHaveLength(3);
    expect((within(laborRows()[0] as HTMLElement).getByLabelText('工程名') as HTMLInputElement).value).toBe('組立');
    expect((within(laborRows()[1] as HTMLElement).getByLabelText('工程名') as HTMLInputElement).value).toBe('');
  });

  it('R-0231 AC4: 区分順に工程の空行を1行ずつ表示する', () => {
    render(<TateguLaborLinesPanel lines={[]} onChange={vi.fn()} categories={categories} />);

    expect(Array.from(laborRows(), (row) => within(row as HTMLElement).getByText(/工場時間|現場時間/).textContent))
      .toEqual(['工場時間', '現場時間']);
  });

  it('工数と労務単価から金額を自動計算し、変更内容を返す', () => {
    const onChange = vi.fn();
    const lines: LaborLineDraft[] = [{
      process_name: '組立',
      category_code: 'FACTORY_TIME',
      work_hours: 1.5,
      labor_rate: 4000,
      amount: 6000,
      sort_order: 0,
    }];

    render(<TateguLaborLinesPanel lines={lines} onChange={onChange} categories={categories} />);

    expect(screen.getAllByText('¥6,000').length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByLabelText('工数')[0], { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledWith([{
      ...lines[0],
      work_hours: 2,
      amount: 8000,
      sort_order: 0,
    }]);
  });

  it('労務明細の区分はtime区分だけを表示する', () => {
    const onChange = vi.fn();
    const lines: LaborLineDraft[] = [{
      process_name: '取付',
      category_code: 'SITE_TIME',
      work_hours: 1,
      labor_rate: 5000,
      amount: 5000,
      sort_order: 0,
    }];

    render(<TateguLaborLinesPanel lines={lines} onChange={onChange} categories={categories} />);

    const options = Array.from(screen.getAllByLabelText('労務区分')[0].querySelectorAll('option')).map(option => option.value);
    expect(options).toEqual(['FACTORY_TIME', 'SITE_TIME']);
  });

  it('末尾の空行へ入力すると工程が追加され、下に新しい空行が残る', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TateguLaborLinesPanel lines={[]} onChange={onChange} categories={categories} />);

    typeAndLeave(screen.getAllByLabelText('工程名')[0], '組立');
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ process_name: '組立' })]);
    expect(screen.queryByText('+ 行追加')).toBeNull();

    const added = onChange.mock.calls[0][0] as LaborLineDraft[];
    rerender(<TateguLaborLinesPanel lines={added} onChange={onChange} categories={categories} />);
    expect(screen.getAllByLabelText('工程名')).toHaveLength(3);
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
