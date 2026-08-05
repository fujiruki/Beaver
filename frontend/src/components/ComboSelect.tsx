import { useState, useRef, useEffect } from 'react';

export interface ComboOption {
  id: number;
  primaryText: string;
  secondaryText?: string;
  searchText: string;
}

interface Props {
  options: ComboOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  headers?: [string, string];
}

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export default function ComboSelect({ options, value, onChange, placeholder, disabled, headers }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value != null ? options.find(o => o.id === value) : null;

  const filtered = query
    ? options.filter(o => normalize(o.searchText).includes(normalize(query)))
    : options;

  useEffect(() => {
    setHighlighted(-1);
  }, [query]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleFocus() {
    if (!disabled) setOpen(true);
  }

  function handleSelect(id: number) {
    onChange(id);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && filtered[highlighted]) handleSelect(filtered[highlighted].id);
      // R-0083: 候補が1件に絞られていれば、ハイライト操作なしでもEnterで選択する
      else if (filtered.length === 1) handleSelect(filtered[0].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const displayValue = open ? query : (selected?.primaryText ?? '');

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={e => setQuery(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1',
          borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
          background: disabled ? '#f8fafc' : '#fff',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto',
        }}>
          {headers && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              padding: '4px 8px', borderBottom: '1px solid #e2e8f0',
              fontSize: 11, color: '#94a3b8', fontWeight: 'bold',
            }}>
              <span>{headers[0]}</span>
              <span>{headers[1]}</span>
            </div>
          )}
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>該当なし</div>
          )}
          {filtered.map((opt, i) => (
            <div
              key={opt.id}
              onMouseDown={() => handleSelect(opt.id)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                padding: '7px 10px', cursor: 'pointer', fontSize: 13,
                background: i === highlighted ? '#eff6ff' : 'transparent',
                borderBottom: '1px solid #f1f5f9',
              }}
              onMouseEnter={() => setHighlighted(i)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {opt.primaryText}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>
                {opt.secondaryText ?? ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
