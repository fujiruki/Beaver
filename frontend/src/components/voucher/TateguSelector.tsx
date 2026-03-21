import { useState } from 'react';
import { useTateguItems } from '../../api/tateguItems';
import type { TateguItem } from '../../types/tateguItem';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: TateguItem) => void;
};

export default function TateguSelector({ isOpen, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const { data: items = [], isLoading } = useTateguItems();

  if (!isOpen) return null;

  const filtered = items.filter(item =>
    item.name.includes(search) || item.item_code.includes(search) || (item.spec ?? '').includes(search)
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>建具台帳から選択</h3>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="品番・品名・仕様で検索"
          autoFocus
          style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
            fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }}
        />

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
                      <td style={tdStyle}>{item.item_code}</td>
                      <td style={tdStyle}>{item.name}</td>
                      <td style={tdStyle}>{item.spec ?? ''}</td>
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
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
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
