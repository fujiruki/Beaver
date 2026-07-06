import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import CustomerFormFields from '../CustomerFormFields';
import type { CustomerInput } from '../../types/customer';

function Harness({ code }: { code?: string | null }) {
  const { register, formState: { errors }, setValue, watch } = useForm<CustomerInput>({
    defaultValues: { honorific_type: '御中' },
  });
  return (
    <CustomerFormFields
      register={register}
      errors={errors}
      setValue={setValue}
      watch={watch}
      code={code}
    />
  );
}

describe('CustomerFormFields 得意先コードの表示専用化 (R-075)', () => {
  it('code という name の入力要素が存在しない', () => {
    const { container } = render(<Harness />);
    expect(container.querySelector('[name="code"]')).toBeNull();
  });

  it('新規時（codeプロパティ未指定）は「自動採番」と表示される', () => {
    render(<Harness />);
    expect(screen.getByText('自動採番')).not.toBeNull();
  });

  it('既存得意先編集時は現在のcodeが表示される', () => {
    render(<Harness code="12345" />);
    expect(screen.getByText('12345')).not.toBeNull();
  });
});
