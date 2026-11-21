import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScheduleAddModal from '../dandori/ScheduleAddModal';
import ProductLedgerModal from '../voucher/ProductLedgerModal';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function renderSchedule(onClose = vi.fn()) {
  const view = wrap(<ScheduleAddModal projectId={5} projectName="田中邸" defaultDate="2026-11-01" onClose={onClose} />);
  return { onClose, view };
}

function renderLedger(onClose = vi.fn()) {
  wrap(
    <ProductLedgerModal
      isOpen mode="create" voucherLabel="見積 E1" lineNo={1} initialName="扉"
      categories={[]} onClose={onClose} onApplied={vi.fn()}
    />,
  );
  return onClose;
}

describe('R-0270 モーダルのうっかり閉じ防止と仮保存', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')));
  });

  it('変更がなければ背景クリックでそのまま閉じる', () => {
    const { onClose } = renderSchedule();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('入力があるとき背景クリックでは閉じず、クリック位置の真下に「閉じる」が出る', () => {
    const { onClose } = renderSchedule();
    fireEvent.change(screen.getByLabelText('時間'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('dialog'), { clientX: 300, clientY: 200 });
    expect(onClose).not.toHaveBeenCalled();
    const box = screen.getByRole('alertdialog');
    expect(box.style.left).toBe('252px');
    expect(box.style.top).toBe('182px');
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('確認で「戻る」を押すと閉じず入力も残る', () => {
    const { onClose } = renderSchedule();
    fireEvent.change(screen.getByLabelText('時間'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText('時間') as HTMLInputElement).value).toBe('6');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('入力しかけは Beaver_draft_<種類>_<id> に仮保存され、開き直すと戻せる', async () => {
    const first = renderSchedule();
    fireEvent.change(screen.getByLabelText('時間'), { target: { value: '6' } });
    expect(localStorage.getItem('Beaver_draft_schedule_5')).toContain('"hours":"6"');
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(first.onClose).toHaveBeenCalledOnce();
    first.view.unmount();

    renderSchedule();
    expect(await screen.findByText(/入力しかけがあります（/)).toBeTruthy();
    expect((screen.getByLabelText('時間') as HTMLInputElement).value).toBe('');
    await userEvent.click(screen.getByRole('button', { name: '戻す' }));
    expect((screen.getByLabelText('時間') as HTMLInputElement).value).toBe('6');
  });

  it('「捨てる」で仮保存が消える', async () => {
    localStorage.setItem('Beaver_draft_schedule_5', JSON.stringify({
      savedAt: '2026-11-20T10:00:00', value: { kind: '見積', name: '', startDate: '', endDate: '', hours: '9', memo: '' },
    }));
    renderSchedule();
    await userEvent.click(await screen.findByRole('button', { name: '捨てる' }));
    expect(localStorage.getItem('Beaver_draft_schedule_5')).toBeNull();
    expect(screen.queryByText(/入力しかけがあります/)).toBeNull();
  });

  it('localStorage が使えなくても動く', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const { onClose } = renderSchedule();
    fireEvent.change(screen.getByLabelText('時間'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('製品台帳モーダルも、入力後の背景クリックと ✕ では確認が挟まる', () => {
    const onClose = renderLedger();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
    onClose.mockClear();
    fireEvent.change(screen.getByLabelText('製品名'), { target: { value: '扉B' } });
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(localStorage.getItem('Beaver_draft_ledger_new')).toContain('扉B');
  });
});
