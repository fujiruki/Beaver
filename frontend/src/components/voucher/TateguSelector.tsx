import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTateguItems, useToggleFavorite } from '../../api/tateguItems';
import { useLedgerCatalogs, useLedgerCatalogItems } from '../../api/ledgerCatalogs';
import FavoriteStar from '../FavoriteStar';
import type { TateguItem } from '../../types/tateguItem';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: TateguItem) => void;
};

type TabKey = 'recent' | 'favorite' | 'all' | `catalog:${number}`;

const RECENT_LIMIT = 10;
const byRecent = (a: TateguItem, b: TateguItem) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '');

export default function TateguSelector({ isOpen, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('recent');
  const [reloading, setReloading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useTateguItems();
  const { data: catalogs = [] } = useLedgerCatalogs(isOpen);
  const toggleFavorite = useToggleFavorite();
  const catalogId = tab.startsWith('catalog:') ? Number(tab.slice(8)) : 0;
  const { data: catalogItems = [] } = useLedgerCatalogItems(catalogId);

  if (!isOpen) return null;

  const reload = async () => {
    setReloading(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tateguItems'] }),
        queryClient.invalidateQueries({ queryKey: ['ledgerCatalogs'] }),
      ]);
    } finally {
      setReloading(false);
    }
  };

  const clearSearch = () => {
    setSearch('');
    searchRef.current?.focus();
  };

  const sorted = [...items].sort(byRecent);
  const tabItems =
    tab === 'recent' ? sorted.slice(0, RECENT_LIMIT)
    : tab === 'favorite' ? sorted.filter(i => i.is_favorite)
    : tab === 'all' ? sorted
    : catalogItems;
  const filtered = tabItems.filter(item =>
    item.name.includes(search) || (item.code ?? '').includes(search) || (item.description ?? '').includes(search)
  );
  const favoriteOf = (item: TateguItem) => !!(items.find(i => i.id === item.id) ?? item).is_favorite;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'recent', label: '最近' },
    { key: 'favorite', label: 'お気に入り' },
    ...catalogs.map(c => ({ key: `catalog:${c.id}` as TabKey, label: c.name })),
    { key: 'all', label: 'すべて' },
  ];

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>製品台帳から選択</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {tabs.map(t => (
            <button
              type="button"
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={tab === t.key
                ? 'px-3 py-1 rounded-md text-sm bg-blue-600 text-white'
                : 'px-3 py-1 rounded-md text-sm bg-slate-100 text-slate-600 hover:bg-slate-200'}
            >{t.label}</button>
          ))}
          <button
            type="button"
            onClick={reload}
            disabled={reloading}
            className="px-3 py-1 rounded-md text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ marginLeft: 'auto' }}
          >{reloading ? '読み込み中…' : '再読み込み'}</button>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="品番・品名・仕様で検索"
            autoFocus
            style={{ width: '100%', padding: '7px 28px 7px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
              fontSize: 14, boxSizing: 'border-box' }}
          />
          {search && (
            <button
              type="button"
              aria-label="検索語を消す"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 leading-none text-slate-400 hover:text-slate-600"
              style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', padding: 0 }}
            >✕</button>
          )}
        </div>

        {isLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>該当なし</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                    <th style={{ ...thStyle, width: 36 }}></th>
                    <th style={thStyle}>品番</th>
                    <th style={thStyle}>品名</th>
                    <th style={thStyle}>仕様</th>
                    <th style={thStyle}>単位</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} onClick={() => { onSelect(item); onClose(); }}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={tdStyle}>
                        <FavoriteStar
                          isFavorite={favoriteOf(item)}
                          onToggle={() => toggleFavorite.mutate({ id: item.id, is_favorite: !favoriteOf(item) })}
                        />
                      </td>
                      <td style={tdStyle}>{item.code || '採番待ち'}</td>
                      <td style={tdStyle} data-testid="ledger-row-name">{item.name}</td>
                      <td style={tdStyle}>{item.description ?? ''}</td>
                      <td style={tdStyle}>{item.unit ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 10, padding: 20, width: 640, maxWidth: '90vw',
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8', padding: '0 4px',
};
const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 'bold',
  borderBottom: '1px solid #e2e8f0',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#1e293b',
};
