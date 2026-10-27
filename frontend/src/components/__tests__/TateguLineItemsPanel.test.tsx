import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('TateguCostLinesPanel', () => {
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
    fireEvent.change(screen.getByLabelText('材料名'), { target: { value: '框材' } });

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

    fireEvent.change(screen.getByLabelText('工程名'), { target: { value: '組立' } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ process_name: '組立' })]);
    expect(screen.queryByText('+ 行追加')).toBeNull();

    const added = onChange.mock.calls[0][0] as LaborLineDraft[];
    rerender(<TateguLaborLinesPanel lines={added} onChange={onChange} categories={categories} />);
    expect(screen.getAllByLabelText('工程名')).toHaveLength(2);
  });
});
