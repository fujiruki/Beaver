import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjects } from '../api/projects';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { api } from '../api/client';
import type { Project } from '../types/project';
import GanttScroll from '../components/dandori/GanttScroll';
import WrapView from '../components/dandori/WrapView';
import {
  buildBar,
  rangeForPreset,
  todayISOLocal,
  PRESET_DEFAULT_PX_PER_DAY,
  PRESET_LABELS,
  type RangePreset,
  type ViewMode,
} from '../components/dandori/dandoriBoardUtils';
import '../components/dandori/dandoriBoard.css';

const FONT_SCALE_KEY = 'bv_dandori_font_scale';
const FONT_SCALES = [0.85, 1, 1.15];
const FONT_LABELS = ['A−', 'A', 'A＋'];
const PRESETS: RangePreset[] = ['8w', '6m', '1y'];
const PROJECTS_QUERY_KEY = ['projects', {}];

function loadFontScale(): number {
  const saved = Number(localStorage.getItem(FONT_SCALE_KEY));
  return FONT_SCALES.includes(saved) ? saved : 1;
}

export default function DandoriBoard() {
  const { data: projects = [], isLoading, error } = useProjects();
  const { settings } = useAppSettings();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<RangePreset>('8w');
  const [pxPerDay, setPxPerDay] = useState(PRESET_DEFAULT_PX_PER_DAY['8w']);
  const [mode, setMode] = useState<ViewMode>('scroll');
  const [fontScale, setFontScale] = useState(loadFontScale);
  const [showDone, setShowDone] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);

  const todayISO = todayISOLocal();
  const { start: rangeStart, end: rangeEnd } = useMemo(() => rangeForPreset(todayISO, preset), [todayISO, preset]);

  const commitMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { start_date?: string; delivery_date?: string } }) =>
      api.put<Project>(`/projects/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY });
      const prev = queryClient.getQueryData<Project[]>(PROJECTS_QUERY_KEY);
      queryClient.setQueryData<Project[]>(PROJECTS_QUERY_KEY, old =>
        old?.map(p => (p.id === id ? { ...p, ...patch } : p)),
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(PROJECTS_QUERY_KEY, context.prev);
      setDragError('保存に失敗しました。元の位置に戻しました。');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  function handlePreset(next: RangePreset) {
    setPreset(next);
    setPxPerDay(PRESET_DEFAULT_PX_PER_DAY[next]);
  }

  function handleCommit(id: number, patch: { start_date?: string; delivery_date?: string }) {
    setDragError(null);
    commitMutation.mutate({ id, patch });
  }

  const unsetCount = projects.filter(p => !p.start_date).length;
  const allBars = useMemo(
    () => projects.filter(p => p.start_date).map(p => buildBar(p as Project & { start_date: string }, settings.hoursPerDay)),
    [projects, settings.hoursPerDay],
  );
  const visibleBars = useMemo(() => allBars.filter(b => showDone || b.category !== 'done'), [allBars, showDone]);
  const overCount = visibleBars.filter(b => b.delivery && b.end > b.delivery).length;

  if (isLoading) return <div className="p-6">読み込み中...</div>;
  if (error) return <div className="p-6 text-red-600">エラー: {String(error)}</div>;

  return (
    <div className="dandori-board" style={{ ['--scale' as string]: fontScale } as React.CSSProperties}>
      <div className="db-header">
        <h1>段取りボード</h1>
        <span className="sub">{rangeStart} 〜 {rangeEnd}（{PRESET_LABELS[preset]}）</span>
        {unsetCount > 0 && <span className="unset-note">開始日未設定 {unsetCount}件</span>}
        {overCount > 0 && <span className="alert-badge">⚠ 納期注意 {overCount}件</span>}
      </div>

      {dragError && (
        <div style={{ color: '#c2453a', fontSize: 13, margin: '4px 0' }}>{dragError}</div>
      )}

      <div className="toolbar">
        <span className="lbl">表示期間</span>
        <div className="toggle">
          {PRESETS.map(p => (
            <button key={p} className={preset === p ? 'on' : ''} onClick={() => handlePreset(p)}>{PRESET_LABELS[p]}</button>
          ))}
        </div>

        <span className="lbl">モード</span>
        <div className="toggle">
          <button className={mode === 'scroll' ? 'on' : ''} onClick={() => setMode('scroll')}>横スクロール</button>
          <button className={mode === 'wrap' ? 'on' : ''} onClick={() => setMode('wrap')}>折り返し</button>
        </div>

        {mode === 'scroll' && (
          <div className="zoom">
            ズーム
            <input
              type="range"
              min={2}
              max={40}
              value={pxPerDay}
              onChange={e => setPxPerDay(Number(e.target.value))}
            />
          </div>
        )}

        <span className="lbl">文字</span>
        <div className="toggle">
          {FONT_SCALES.map((scale, i) => (
            <button
              key={scale}
              className={fontScale === scale ? 'on' : ''}
              onClick={() => { setFontScale(scale); localStorage.setItem(FONT_SCALE_KEY, String(scale)); }}
            >{FONT_LABELS[i]}</button>
          ))}
        </div>

        <label className="filter">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          完了・キャンセルを表示
        </label>
        <div className="filter">1日 = <b>{settings.hoursPerDay}時間</b>（設定で変更）</div>
      </div>

      {mode === 'scroll' ? (
        <GanttScroll
          bars={visibleBars}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pxPerDay={pxPerDay}
          todayISO={todayISO}
          onCommit={handleCommit}
        />
      ) : (
        <WrapView bars={visibleBars} rangeStart={rangeStart} rangeEnd={rangeEnd} todayISO={todayISO} />
      )}
    </div>
  );
}
