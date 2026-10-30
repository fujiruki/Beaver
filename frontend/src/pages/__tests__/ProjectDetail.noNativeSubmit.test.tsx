import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';
import UndoToast from '../../components/history/UndoToast';

const project = {
  id: 5, project_code: 'P-0005', name: '既存案件', customer_id: 1, description: null,
  address: null, status: '見積中', start_date: null, end_date: null, delivery_date: null,
  memo: null, order_date: null, owner_name: null, general_contractor_name: null,
  site_contact: null, manual_estimated_hours: null, estimated_factory_hours: 0,
  estimated_site_hours: 0, effective_estimated_hours: 0, vouchers: [], images: [],
  created_at: '', updated_at: '',
};

function renderPage() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先', name_kana: null, memo: null }]), { status: 200 });
    if (path.endsWith('/project-statuses') || path.endsWith('/schedules')) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(project), { status: 200 });
  }));
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/projects/5']}>
        <Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectDetail ネイティブ送信の禁止', () => {
  it('formのsubmitはpreventDefaultされ、submitボタンが無い', async () => {
    const { container } = renderPage();
    await screen.findByDisplayValue('既存案件');
    const form = container.querySelector('form.pd-shell')!;
    await waitFor(() => expect(form).not.toBeNull());
    expect(fireEvent.submit(form)).toBe(false);
    const bad = [...form.querySelectorAll('button')].filter(b => b.getAttribute('type') !== 'button');
    expect(bad.map(b => b.textContent)).toEqual([]);
  });

  it('UndoToastのボタンはtype=button', () => {
    render(<UndoToast message="m" pending={false} onUndo={() => {}} onDismiss={() => {}} />);
    screen.getAllByRole('button').forEach(b => expect(b.getAttribute('type')).toBe('button'));
  });
});
