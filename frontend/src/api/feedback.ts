import { useMutation } from '@tanstack/react-query';
import { APP_ID } from '../lib/appId';

const BASE = `/contents/${APP_ID}/api`;

export interface FeedbackInput {
  message: string;
  pagePath: string;
  images: File[];
}

async function submitFeedback(input: FeedbackInput): Promise<void> {
  const formData = new FormData();
  formData.append('message', input.message);
  formData.append('page_path', input.pagePath);
  for (const image of input.images) {
    formData.append('images[]', image);
  }
  const res = await fetch(`${BASE}/feedback`, { method: 'POST', body: formData });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text}`);
  }
}

/** 改善要望を送る（R-0080） */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: submitFeedback,
  });
}
