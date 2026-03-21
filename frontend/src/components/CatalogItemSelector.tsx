import { useState } from 'react';
import { useCatalogItems, type CatalogItem } from '../api/catalog';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: CatalogItem) => void;
};

export default function CatalogItemSelector({ isOpen, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const { data: items = [], isLoading } = useCatalogItems(query);

  if (!isOpen) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>カタログ品目を選択</h3>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="品名で検索..."
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', marginBottom: 12 }}
          autoFocus
        />
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {isLoading && <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>}
          {!isLoading && items.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {query ? '該当する品目がありません' : 'カタログ品目を検索してください'}
            </div>
          )}
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => { onSelect(item); onClose(); }}
              style={itemRowStyle}
              onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 13, color: '#1e293b' }}>{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modalStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 10, padding: 20,
  width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', padding: '2px 6px',
};
const itemRowStyle: React.CSSProperties = {
  padding: '10px 12px', cursor: 'pointer', borderRadius: 6,
  borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s',
};
