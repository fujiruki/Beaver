import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TateguItemDetail from '../TateguItemDetail';
import { TateguCostLinesPanel, TateguLaborLinesPanel } from '../../components/TateguLineItemsPanel';

const item = {
  id: 10, item_code: 'T-10', name: 'Test', spec: null, base_catalog_item_name: null,
  cost_body: 0, cost_hardware: 0, cost_glass: 0,
  cost_factory_hours: 4.7000000029802, cost_site_hours: 0.5, cost_labor_rate: 4000,
  unit: 'set', memo: null, created_at: '', updated_at: '',
  cost_breakdown: [
    { id: 3, tategu_item_id: 10, category_code: 'FACTORY_TIME', category_name: '工場時間', measure_type: 'time', value: 4.7000000029802, sort_order: 0 },
  ],
  cost_lines: [], labor_lines: [],
};
const categories = [
  { id: 4, code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4, is_active: 1, synced_at: '' },
];

describe('R-0254 製品台帳の時間・数量', () => {
  it('4.7000000029802 を持つ台帳は 4.7 と出る（工数の欄、集計区分別原価）', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (path.endsWith('/aggregation-categories')) return new Response(JSON.stringify(categories), { status: 200 });
      if (path.endsWith('/tategu-items/10')) return new Response(JSON.stringify(item), { status: 200 });
      return new Response('{}', { status: 200 });
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/tategu/10']}>
          <Routes><Route path="/tategu/:id" element={<TateguItemDetail />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue('Test');
    expect(screen.getAllByDisplayValue('4.7').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByDisplayValue('4.7000000029802')).toBeNull();
    expect(screen.getAllByText('4.7 h', { exact: false }).length).toBeGreaterThan(0);
  });

  it('材料の数量に 1.234 と入れて欄から出ると 1.23、渡す値も 1.23', () => {
    const onChange = vi.fn();
    const lines = [{ category_code: 'MAIN', name: 'A', quantity: 1, unit_cost: 100, amount: 100, source: 'manual' as const, sort_order: 0 }];
    render(<TateguCostLinesPanel lines={lines} onChange={onChange} categories={[]} />);
    const input = screen.getAllByLabelText('数量')[0] as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.234' } });
    fireEvent.blur(input);
    expect(onChange.mock.calls.at(-1)![0][0].quantity).toBe(1.23);
  });

  it('工程の工場時間も同じく第2位に丸めて渡し、4.7000000029802 は 4.7 と出る', () => {
    const onChange = vi.fn();
    const lines = [{ process_name: 'P', category_code: 'FACTORY_TIME', work_hours: 4.7000000029802, labor_rate: 4000, amount: 0, sort_order: 0 }];
    render(<TateguLaborLinesPanel lines={lines} onChange={onChange} categories={[]} />);
    const input = screen.getAllByLabelText('工場時間')[0] as HTMLInputElement;
    expect(input.value).toBe('4.7');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.234' } });
    fireEvent.blur(input);
    expect(onChange.mock.calls.at(-1)![0][0].work_hours).toBe(1.23);
  });
});
