import { render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import type { VoucherFormValues } from '../../../pages/VoucherEdit';
import VoucherHeader from '../VoucherHeader';

function Harness({ voucherType = 'estimate' }: { voucherType?: 'estimate' | 'sales' }) {
  const form = useForm<VoucherFormValues>({
    defaultValues: {
      voucher_type: voucherType,
      tax_input_type: 'exclusive',
      sales_category_id: null,
      due_date: null,
      delivery_date: null,
    } as VoucherFormValues,
  });
  return (
    <FormProvider {...form}>
      <VoucherHeader customers={[]} projects={[]} salesCategories={[]} />
    </FormProvider>
  );
}

describe('R-0191 納期と納品日', () => {
  it('別々の入力欄をdue_dateとdelivery_dateへ割り当てる', () => {
    const { container } = render(<Harness />);

    expect(screen.getByText('納期')).toBeTruthy();
    expect(screen.getByText('納品日')).toBeTruthy();
    expect(container.querySelector('input[name="due_date"]')).toBeTruthy();
    expect(container.querySelector('input[name="delivery_date"]')).toBeTruthy();
  });
});

describe('R-0194 伝票日付の見出し', () => {
  it('見積は見積日と表示する', () => {
    render(<Harness voucherType="estimate" />);
    expect(screen.getByText('見積日 *')).toBeTruthy();
  });

  it('売上は売上日と表示する', () => {
    render(<Harness voucherType="sales" />);
    expect(screen.getByText('売上日 *')).toBeTruthy();
  });
});
