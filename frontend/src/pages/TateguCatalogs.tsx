import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useLedgerCatalogs,
  useLedgerCatalogItems,
  useCreateLedgerCatalog,
  useUpdateLedgerCatalog,
  useDeleteLedgerCatalog,
  useSaveLedgerCatalogItems,
} from '../api/ledgerCatalogs';

const btnCls = 'px-2 py-1 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent';

export default function TateguCatalogs() {
  const navigate = useNavigate();
  const { data: catalogs = [], isLoading } = useLedgerCatalogs();
  const [selectedId, setSelectedId] = useState(0);
  const [newName, setNewName] = useState('');
  const { data: items = [] } = useLedgerCatalogItems(selectedId);
  const createCatalog = useCreateLedgerCatalog();
  const updateCatalog = useUpdateLedgerCatalog();
  const deleteCatalog = useDeleteLedgerCatalog();
  const saveItems = useSaveLedgerCatalogItems();
  const selected = catalogs.find(c => c.id === selectedId);

  function saveOrder(ids: number[]) {
    saveItems.mutate({ catalogId: selectedId, ids });
  }

  function move(index: number, delta: number) {
    const ids = items.map(i => i.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    saveOrder(ids);
  }

  function moveCatalog(index: number, delta: number) {
    const other = catalogs[index + delta];
    const self = catalogs[index];
    if (!other) return;
    updateCatalog.mutate({ id: self.id, name: self.name, sort_order: other.sort_order });
    updateCatalog.mutate({ id: other.id, name: other.name, sort_order: self.sort_order });
  }

  function rename() {
    if (!selected) return;
    const name = prompt('カタログの名前', selected.name)?.trim();
    if (name) updateCatalog.mutate({ id: selected.id, name, sort_order: selected.sort_order });
  }

  function remove() {
    if (!selected || !confirm(`カタログ「${selected.name}」を削除しますか？（中の台帳は消えません）`)) return;
    deleteCatalog.mutate(selected.id, { onSuccess: () => setSelectedId(0) });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createCatalog.mutate(name, { onSuccess: () => setNewName('') });
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/tategu')} className="px-3 py-1 border border-slate-300 rounded text-sm text-slate-600 hover:bg-slate-50">
          ← 製品台帳へ
        </button>
        <h1 className="text-xl font-bold">カタログの編集</h1>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-500 mb-3">カタログ</h2>
          {isLoading ? <p className="text-sm text-slate-400">読み込み中...</p> : (
            <ul className="mb-3">
              {catalogs.map((c, i) => (
                <li key={c.id} className={`flex items-center gap-1 rounded ${c.id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <button className="flex-1 text-left px-2 py-1.5 text-sm" onClick={() => setSelectedId(c.id)}>
                    {c.name}<span className="ml-2 text-xs text-slate-400">{c.item_count}件</span>
                  </button>
                  <button className={btnCls} aria-label={`${c.name}を上へ`} disabled={i === 0} onClick={() => moveCatalog(i, -1)}>▲</button>
                  <button className={btnCls} aria-label={`${c.name}を下へ`} disabled={i === catalogs.length - 1} onClick={() => moveCatalog(i, 1)}>▼</button>
                </li>
              ))}
              {catalogs.length === 0 && <li className="text-sm text-slate-400">まだありません</li>}
            </ul>
          )}
          <form onSubmit={add} className="flex gap-2">
            <input
              aria-label="新しいカタログの名前"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="例: 障子カタログ"
              className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-md text-sm"
            />
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">追加</button>
          </form>
        </section>

        <section className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-500">{selected ? selected.name : '中の台帳'}</h2>
            {selected && (
              <div className="flex gap-1">
                <button className={btnCls} onClick={rename}>名前を変える</button>
                <button className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700" onClick={remove}>カタログを削除</button>
              </div>
            )}
          </div>
          {!selected && <p className="text-sm text-slate-400">左からカタログを選んでください</p>}
          {selected && items.length === 0 && <p className="text-sm text-slate-400">台帳はまだ入っていません（製品台帳の一覧の「カタログに追加」で入れます）</p>}
          <ul>
            {items.map((item, i) => (
              <li key={item.id} className="flex items-center gap-1 py-1 border-b border-slate-100 text-sm">
                <span className="w-16 text-xs text-slate-400">{item.code || '採番待ち'}</span>
                <span className="flex-1" data-testid="catalog-item-name">{item.name}</span>
                <button className={btnCls} aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button className={btnCls} aria-label="下へ" disabled={i === items.length - 1} onClick={() => move(i, 1)}>▼</button>
                <button className={btnCls} aria-label="外す" onClick={() => saveOrder(items.filter(x => x.id !== item.id).map(x => x.id))}>外す</button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
