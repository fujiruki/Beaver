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
    fireEvent.change(screen.getByLabelText('材料単価'), { target: { value: '1500' } });

    expect(onChange).toHaveBeenCalledWith([{
      ...lines[0],
      unit_cost: 1500,
      amount: 3000,
      sort_order: 0,
    }]);
  });

  it('材料明細の行追加はmoney区分の先頭カテゴリを使う', () => {
    const onChange = vi.fn();

    render(<TateguCostLinesPanel lines={[]} onChange={onChange} categories={categories} />);
    fireEvent.click(screen.getByText('+ 行追加'));

    expect(onChange).toHaveBeenCalledWith([{
      category_code: 'MAIN',
      name: '',
      quantity: 1,
      unit_cost: 0,
      amount: 0,
      source: 'manual',
      sort_order: 0,
    }]);
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
    fireEvent.change(screen.getByLabelText('工数'), { target: { value: '2' } });

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

    const options = Array.from(screen.getByLabelText('労務区分').querySelectorAll('option')).map(option => option.value);
    expect(options).toEqual(['FACTORY_TIME', 'SITE_TIME']);
  });
});
