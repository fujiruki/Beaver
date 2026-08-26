import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TateguItemDetail from '../TateguItemDetail';

const baseItem = {
  id: 10,
  item_code: 'T-10',
  name: 'Test tategu',
  spec: null,
  base_catalog_item_name: null,
  cost_body: 1200,
  cost_hardware: 300,
  cost_glass: 450,
  cost_factory_hours: 2,
  cost_site_hours: 1,
  cost_labor_rate: 4000,
  unit: 'set',
  memo: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  cost_breakdown: [
    {
      id: 3,
      tategu_item_id: 10,
      category_code: 'MAIN',
      category_name: 'Body',
      measure_type: 'money',
      value: 1200,
      sort_order: 0,
    },
  ],
  cost_lines: [
    {
      id: 1,
      tategu_item_id: 10,
      category_code: 'MAIN',
      name: 'Material A',
      quantity: 2,
      unit_cost: 600,
      amount: 1200,
      source: 'manual',
      sort_order: 0,
    },
  ],
  labor_lines: [
    {
      id: 2,
      tategu_item_id: 10,
      process_name: 'Factory work',
      category_code: 'FACTORY_TIME',
      work_hours: 2,
      labor_rate: 4000,
      amount: 8000,
      sort_order: 0,
    },
  ],
};

const categories = [
  { id: 1, code: 'MAIN', name: 'Body', measure_type: 'money', sort_order: 1, is_active: 1, synced_at: '' },
  { id: 2, code: 'HARDWARE', name: 'Hardware', measure_type: 'money', sort_order: 2, is_active: 1, synced_at: '' },
  { id: 3, code: 'GLASS', name: 'Glass', measure_type: 'money', sort_order: 3, is_active: 1, synced_at: '' },
  { id: 4, code: 'FACTORY_TIME', name: 'Factory', measure_type: 'time', sort_order: 4, is_active: 1, synced_at: '' },
  { id: 5, code: 'SITE_TIME', name: 'Site', measure_type: 'time', sort_order: 5, is_active: 1, synced_at: '' },
];

type ApiCall = {
  method: string;
  path: string;
  body: any;
};

let apiCalls: ApiCall[] = [];

beforeEach(() => {
  apiCalls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';

    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      apiCalls.push({ method, path: u.pathname, body });
      if (u.pathname.endsWith('/tategu-items/10')) {
        return new Response(JSON.stringify({ ...baseItem, ...body }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (u.pathname.endsWith('/aggregation-categories')) {
      return new Response(JSON.stringify(categories), { status: 200 });
    }
    if (u.pathname.endsWith('/tategu-items/10')) {
      return new Response(JSON.stringify(baseItem), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tategu/10']}>
        <Routes>
          <Route path="/tategu/:id" element={<TateguItemDetail />} />
          <Route path="/tategu" element={<div>list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function removeLineByDisplayValue(value: string) {
  const row = screen.getByDisplayValue(value).closest('tr');
  const button = row?.querySelector('button');
  expect(button).toBeTruthy();
  fireEvent.click(button!);
}

async function saveForm() {
  const form = document.querySelector('form');
  expect(form).toBeTruthy();
  fireEvent.submit(form!);
  await waitFor(() => expect(apiCalls.some(call => call.path.endsWith('/tategu-items/10'))).toBe(true));
}

function putCall(pathSuffix: string) {
  const call = apiCalls.find(entry => entry.path.endsWith(pathSuffix));
  expect(call).toBeTruthy();
  return call!;
}

describe('TateguItemDetail line item save order', () => {
  it('saves empty line collections before the main update so fixed cost values are restored', async () => {
    renderPage();

    await screen.findByDisplayValue('Material A');
    removeLineByDisplayValue('Material A');
    removeLineByDisplayValue('Factory work');

    await saveForm();

    const costLinesIndex = apiCalls.findIndex(call => call.path.endsWith('/tategu-items/10/cost-lines'));
    const laborLinesIndex = apiCalls.findIndex(call => call.path.endsWith('/tategu-items/10/labor-lines'));
    const itemIndex = apiCalls.findIndex(call => call.path.endsWith('/tategu-items/10'));

    expect(costLinesIndex).toBeGreaterThanOrEqual(0);
    expect(laborLinesIndex).toBeGreaterThanOrEqual(0);
    expect(itemIndex).toBeGreaterThanOrEqual(0);
    expect(costLinesIndex).toBeLessThan(itemIndex);
    expect(laborLinesIndex).toBeLessThan(itemIndex);
    expect(putCall('/tategu-items/10/cost-lines').body.lines).toEqual([]);
    expect(putCall('/tategu-items/10/labor-lines').body.lines).toEqual([]);

    const itemPayload = putCall('/tategu-items/10').body;
    expect(itemPayload.cost_body).toBe(1200);
    expect(itemPayload.cost_hardware).toBe(300);
    expect(itemPayload.cost_glass).toBe(450);
    expect(itemPayload.cost_factory_hours).toBe(2);
    expect(itemPayload.cost_site_hours).toBe(1);
    expect(itemPayload.cost_labor_rate).toBe(4000);

    await waitFor(() => expect(apiCalls.some(call => call.path.endsWith('/tategu-items/10/cost-breakdown'))).toBe(true));
    expect(putCall('/tategu-items/10/cost-breakdown').body.lines).toEqual([
      {
        category_code: 'MAIN',
        category_name: 'Body',
        measure_type: 'money',
        value: 1200,
        sort_order: 0,
      },
    ]);
  });

  it('omits fixed cost fields from the main update while line collections still exist', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue('Material A');
    await user.type(screen.getByDisplayValue('Test tategu'), ' updated');

    await saveForm();

    const costLinesIndex = apiCalls.findIndex(call => call.path.endsWith('/tategu-items/10/cost-lines'));
    const laborLinesIndex = apiCalls.findIndex(call => call.path.endsWith('/tategu-items/10/labor-lines'));
    const itemIndex = apiCalls.findIndex(call => call.path.endsWith('/tategu-items/10'));
    const itemPayload = putCall('/tategu-items/10').body;

    expect(costLinesIndex).toBeLessThan(itemIndex);
    expect(laborLinesIndex).toBeLessThan(itemIndex);
    expect(putCall('/tategu-items/10/cost-lines').body.lines).toEqual([
      {
        category_code: 'MAIN',
        name: 'Material A',
        quantity: 2,
        unit_cost: 600,
        amount: 1200,
        source: 'manual',
        sort_order: 0,
      },
    ]);
    expect(putCall('/tategu-items/10/labor-lines').body.lines).toEqual([
      {
        process_name: 'Factory work',
        category_code: 'FACTORY_TIME',
        work_hours: 2,
        labor_rate: 4000,
        amount: 8000,
        sort_order: 0,
      },
    ]);
    expect(itemPayload.name).toBe('Test tategu updated');
    expect(itemPayload).not.toHaveProperty('cost_body');
    expect(itemPayload).not.toHaveProperty('cost_hardware');
    expect(itemPayload).not.toHaveProperty('cost_glass');
    expect(itemPayload).not.toHaveProperty('cost_factory_hours');
    expect(itemPayload).not.toHaveProperty('cost_site_hours');
    expect(itemPayload).not.toHaveProperty('cost_labor_rate');
  });
});
