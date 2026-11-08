import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { VoucherFormValues } from '../../../pages/VoucherEdit';
import type { AggregationCategoryMaster } from '../../../api/aggregationCategories';
import { AppSettingsProvider } from '../../../contexts/AppSettingsContext';
import LineItemRow from '../LineItemRow';

vi.mock('../TateguSelector', () => ({ default: () => null }));

const categories: AggregationCategoryMaster[] = [
  { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1, is_active: 1, synced_at: '' },
  { id: 2, code: 'factory_time', name: '工場時間', measure_type: 'time', sort_order: 2, is_active: 1, synced_at: '' },
];

const longName = '片引框戸1枚 900x1900x12 桧 縦格子 腰つき 杉板';

function Harness({ lineType = 'normal' }: { lineType?: string }) {
  const form = useForm<VoucherFormValues>({
    defaultValues: {
      voucher_type: 'estimate',
      tax_input_type: 'exclusive',
      lines: [{ item_name: longName, location_name: '玄関', memo: '', quantity: 1, line_type: lineType, costs: [], prices: [] }],
    } as unknown as VoucherFormValues,
  });
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FormProvider {...form}>
        <AppSettingsProvider>
          <LineItemRow index={0} categories={categories} isNew onSaveLine={vi.fn()} />
        </AppSettingsProvider>
      </FormProvider>
    </QueryClientProvider>
  );
}

const els = () => ({
  location: screen.getByRole('textbox', { name: '取付場所' }),
  type: screen.getByRole('combobox', { name: '行種別' }),
  ledger: screen.queryByRole('button', { name: '製品台帳' }),
  name: screen.getByRole('textbox', { name: '取付製品' }) as HTMLTextAreaElement,
  quantity: screen.getByRole('textbox', { name: '数量' }),
  memo: screen.getByRole('button', { name: /^備考/ }),
});

const rowOf = (el: HTMLElement) => el.style.gridRow || el.parentElement?.style.gridRow;

describe('R-0230 明細の左の欄は3段（案C）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('1段目 取付場所・種別・製品台帳、2段目 品名、3段目 数量・備考', () => {
    render(<Harness />);
    const e = els();
    expect(rowOf(e.location)).toBe('1');
    expect(rowOf(e.type)).toBe('1');
    expect(rowOf(e.ledger as HTMLElement)).toBe('1');
    expect(rowOf(e.name)).toBe('2');
    expect(rowOf(e.quantity.closest('[data-testid="quantity-group"]')?.parentElement as HTMLElement)).toBe('3');
    expect(rowOf(e.memo)).toBe('3');
    expect(e.quantity.closest('[data-testid="quantity-group"]')?.parentElement).toBe(e.memo.parentElement);
  });

  it('品名の欄の幅は 300px 以上で、欄の中でスクロールしない', () => {
    render(<Harness />);
    const { name } = els();
    expect(parseFloat(name.style.width)).toBeGreaterThanOrEqual(300);
    expect(name.style.overflowY).toBe('hidden');
    expect(name.value).toBe(longName);
  });

  it('品名は書いた量で高さが伸びる', () => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(60);
    render(<Harness />);
    expect(els().name.style.height).toBe('62px');
  });

  it('値引行も同じ3段で、製品台帳のボタンは出ない', () => {
    render(<Harness lineType="discount" />);
    const e = els();
    expect(e.ledger).toBeNull();
    expect(rowOf(e.name)).toBe('2');
    expect(rowOf(e.memo)).toBe('3');
  });

  it('Tab は 取付場所 → 品名 → 数量 → 備考 → 種別', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const e = els();
    e.location.focus();
    await user.tab();
    expect(document.activeElement).toBe(e.name);
    await user.tab();
    expect(document.activeElement).toBe(e.quantity);
    await user.tab();
    expect(document.activeElement).toBe(e.memo);
    await user.tab();
    expect(document.activeElement).toBe(e.type);
  });
});
