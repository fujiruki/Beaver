import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useSmartBack } from '../useSmartBack';

function PageA() {
  return <Link to="/b">Bへ</Link>;
}

function PageB({ fallback }: { fallback: string }) {
  const goBack = useSmartBack(fallback);
  return <button onClick={goBack}>← 戻る</button>;
}

function Fallback() {
  return <div>フォールバック画面</div>;
}

describe('useSmartBack', () => {
  it('アプリ内履歴がある場合はnavigate(-1)相当で直前の画面に戻る', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/a']}>
        <Routes>
          <Route path="/a" element={<PageA />} />
          <Route path="/b" element={<PageB fallback="/fallback" />} />
          <Route path="/fallback" element={<Fallback />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('Bへ'));
    await user.click(await screen.findByText('← 戻る'));

    expect(await screen.findByText('Bへ')).toBeTruthy();
    expect(screen.queryByText('フォールバック画面')).toBeNull();
  });

  it('履歴が無い場合（直リンク・リロード直後）はfallbackPathへ遷移する', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/b']}>
        <Routes>
          <Route path="/a" element={<PageA />} />
          <Route path="/b" element={<PageB fallback="/fallback" />} />
          <Route path="/fallback" element={<Fallback />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('← 戻る'));

    expect(await screen.findByText('フォールバック画面')).toBeTruthy();
  });

  it('履歴が無い場合、fallbackStateを渡していればフォールバック先にstateが渡る', async () => {
    const user = userEvent.setup();

    function PageBWithState() {
      const goBack = useSmartBack('/fallback', { toast: { message: '削除しました' } });
      return <button onClick={goBack}>← 戻る</button>;
    }

    function FallbackWithState() {
      const location = useLocation();
      const state = location.state as { toast?: { message: string } } | null;
      return <div>フォールバック画面: {state?.toast?.message ?? 'stateなし'}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/b']}>
        <Routes>
          <Route path="/b" element={<PageBWithState />} />
          <Route path="/fallback" element={<FallbackWithState />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByText('← 戻る'));

    expect(await screen.findByText('フォールバック画面: 削除しました')).toBeTruthy();
  });
});
