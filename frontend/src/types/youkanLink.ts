// R-0130: Youkanプロジェクトリンク取得（Beaver縮退ラッパー）

export type YoukanLinkReason = 'not_found' | 'config' | 'unreachable';

export type YoukanLinkResponse =
  | { ok: true; url: string }
  | { ok: false; reason: YoukanLinkReason; message: string };
