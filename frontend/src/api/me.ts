import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface Me {
  id: number;
  name: string;
  email?: string;
}

/** ログイン中のユーザー情報（AUTH_DRIVER=noneのローカル開発ではnull） */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me | null>('/me'),
  });
}
