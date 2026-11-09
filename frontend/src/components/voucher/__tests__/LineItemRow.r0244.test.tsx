import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { VoucherFormValues } from '../../../pages/VoucherEdit';
import type { AggregationCategoryMaster } from '../../../api/aggregationCategories';
import { AppSettingsProvider } from '../../../contexts/AppSettingsContext';
import LineItemRow from '../LineItemRow';

vi.mock('../TateguSelector', () => ({ default: () => null }));

const categories: AggregationCategoryMaster[] = [
  { id: 1, code: 'factory_time', name: '工場時間', measure_type: 'time', sort_order: 1, is_active: 1, synced_at: '' },
];

let formRef: UseFormReturn<VoucherFormValues>;

function Harness() {
  const form = useForm<VoucherFormValues>({
    defaultValues: {
      voucher_type: 'estimate',
      tax_input_type: 'exclusive',
      lines: [{ item_name: '', location_name: '', memo: '', quantity: 1, costs: [], prices: [] }],
    } as unknown as VoucherFormValues,
  });
  formRef = form;
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

const savedValue = () => formRef.getValues('lines.0.costs').find(c => c.category_code === 'factory_time')?.value;

describe('R-0244 明細の数値欄の小数入力', () => {
  it('1・.・5 と打つと表示が 1 → 1. → 1.5 になり値は1.5', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: '工場h' }) as HTMLInputElement;
    await user.click(input);
    await user.keyboard('1');
    expect(input.value).toBe('1');
    await user.keyboard('.');
    expect(input.value).toBe('1.');
    await user.keyboard('5');
    expect(input.value).toBe('1.5');
    expect(savedValue()).toBe(1.5);
  });

  it('0.25 が入り、欄から出たあとも 0.25', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: '工場h' }) as HTMLInputElement;
    await user.click(input);
    await user.keyboard('0.25');
    expect(input.value).toBe('0.25');
    await user.tab();
    expect(input.value).toBe('0.25');
    expect(savedValue()).toBe(0.25);
  });

  it('12000 は欄から出たとき 12,000 と表示される', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: '工場h' }) as HTMLInputElement;
    await user.click(input);
    await user.keyboard('12000');
    await user.tab();
    expect(input.value).toBe('12,000');
  });
});

describe('R-0254 明細の数量・時間は小数第2位', () => {
  it('1.234 と打って欄から出ると 1.23、値も 1.23', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: '工場h' }) as HTMLInputElement;
    await user.click(input);
    await user.keyboard('1.234');
    await user.tab();
    expect(input.value).toBe('1.23');
    expect(savedValue()).toBe(1.23);
  });

  it('数量にも同じ丸めがかかる', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const qty = screen.getByRole('textbox', { name: '数量' }) as HTMLInputElement;
    await user.clear(qty);
    await user.keyboard('2.345');
    await user.tab();
    expect(qty.value).toBe('2.35');
    expect(formRef.getValues('lines.0.quantity')).toBe(2.35);
  });
});
