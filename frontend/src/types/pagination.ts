export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    last_page: number;
  };
}

export interface SortParam {
  key: string;
  dir: 'asc' | 'desc';
}
