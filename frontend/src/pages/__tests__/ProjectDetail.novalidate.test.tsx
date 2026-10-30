import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';

// R-073: type="date" 入力が不正値を持つ案件で、ブラウザのネイティブHTML5検証が
// submit を黙ってブロックし保存が効かなくなる（R-067 と同一パターン）。
// jsdom はネイティブ検証による submit ブロックを再現しないため、
// フォームの noValidate 属性そのものを回帰固定する。
describe('ProjectDetail フォームのネイティブ検証抑止 (R-073)', () => {
  it('form 要素に noValidate が付与されている', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      const u = new URL(url, 'http://localhost');
      if (u.pathname.endsWith('/project-statuses') || u.pathname.endsWith('/customers')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects/new']}>
          <Routes>
            <Route path="/projects/new" element={<ProjectDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull());
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form!.noValidate).toBe(true);
  });
});
