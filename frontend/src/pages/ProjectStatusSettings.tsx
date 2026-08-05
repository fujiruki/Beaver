import { useState } from 'react';
import { useProjectStatuses, useCreateProjectStatus, useUpdateProjectStatus, useDeleteProjectStatus } from '../api/projectStatuses';
import type { ProjectStatusMaster } from '../api/projectStatuses';

export default function ProjectStatusSettings() {
  const { data: statuses = [], isLoading } = useProjectStatuses();
  const createMutation = useCreateProjectStatus();
  const deleteMutation = useDeleteProjectStatus();

  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editSort, setEditSort] = useState(0);

  function handleCreate() {
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim() }, {
      onSuccess: () => setNewName(''),
    });
  }

  function handleDelete(id: number) {
    if (!confirm('削除しますか？')) return;
    deleteMutation.mutate(id);
  }

  if (isLoading) return <div>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>案件ステータス 設定</h1>

      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={thStyle}>名前</th>
              <th style={thStyle}>並び順</th>
              <th style={thStyle}>有効</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {statuses.map(s => (
              <StatusRow
                key={s.id}
                status={s}
                editId={editId}
                editName={editName}
                editSort={editSort}
                setEditId={setEditId}
                setEditName={setEditName}
                setEditSort={setEditSort}
                onDelete={handleDelete}
              />
            ))}
            {statuses.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  ステータスがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 'bold', color: '#475569', marginBottom: 12 }}>新規追加</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="ステータス名（例：発注済）"
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
          />
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending || !newName.trim()}
            style={{ padding: '6px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  status, editId, editName, editSort,
  setEditId, setEditName, setEditSort, onDelete,
}: {
  status: ProjectStatusMaster;
  editId: number | null;
  editName: string;
  editSort: number;
  setEditId: (id: number | null) => void;
  setEditName: (v: string) => void;
  setEditSort: (v: number) => void;
  onDelete: (id: number) => void;
}) {
  const updateMutation = useUpdateProjectStatus(status.id);
  const isEditing = editId === status.id;

  function startEdit() {
    setEditId(status.id);
    setEditName(status.name);
    setEditSort(status.sort_order);
  }

  function handleSave() {
    updateMutation.mutate({ name: editName, sort_order: editSort }, {
      onSuccess: () => setEditId(null),
    });
  }

  if (isEditing) {
    return (
      <tr style={{ background: '#eff6ff' }}>
        <td style={tdStyle}>
          <input value={editName} onChange={e => setEditName(e.target.value)}
            style={{ padding: '4px 8px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 13, width: '100%' }} />
        </td>
        <td style={tdStyle}>
          <input type="number" value={editSort} onChange={e => setEditSort(Number(e.target.value))}
            style={{ padding: '4px 8px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 13, width: 60 }} />
        </td>
        <td style={tdStyle}>—</td>
        <td style={tdStyle}>
          <button onClick={handleSave} style={saveBtnStyle}>保存</button>
          <button onClick={() => setEditId(null)} style={cancelBtnStyle}>取消</button>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={tdStyle}>{status.name}</td>
      <td style={tdStyle}>{status.sort_order}</td>
      <td style={tdStyle}>
        <span style={{ fontSize: 12, color: status.is_active ? '#16a34a' : '#94a3b8' }}>
          {status.is_active ? '有効' : '無効'}
        </span>
      </td>
      <td style={tdStyle}>
        <button onClick={startEdit} style={editBtnStyle}>編集</button>
        <button onClick={() => onDelete(status.id)} style={deleteBtnStyle}>削除</button>
      </td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#64748b',
  fontWeight: 'bold', borderBottom: '1px solid #e2e8f0',
};
const tdStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13 };
const editBtnStyle: React.CSSProperties = {
  padding: '3px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1',
  borderRadius: 4, cursor: 'pointer', fontSize: 12, marginRight: 4,
};
const deleteBtnStyle: React.CSSProperties = {
  padding: '3px 10px', background: 'none', border: '1px solid #fca5a5',
  borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#ef4444',
};
const saveBtnStyle: React.CSSProperties = {
  padding: '3px 10px', background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 4, cursor: 'pointer', fontSize: 12, marginRight: 4,
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '3px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1',
  borderRadius: 4, cursor: 'pointer', fontSize: 12,
};
