import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjects } from '../api/projects';
import { useProjectStatuses } from '../api/projectStatuses';
import { useAllProjectSchedules, useCreateProjectScheduleFor, useUpdateProjectSchedule } from '../api/projectSchedules';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { APP_STORAGE_PREFIX } from '../lib/appId';
import { api } from '../api/client';
import type { Project } from '../types/project';
import type { ProjectSchedule } from '../types/projectSchedule';
import GanttScroll from '../components/dandori/GanttScroll';
import WrapView from '../components/dandori/WrapView';
import ProjectQuickEditModal from '../components/dandori/ProjectQuickEditModal';
import ScheduleAddModal from '../components/dandori/ScheduleAddModal';
import TodoPanel from '../components/dandori/TodoPanel';
import DataTable, { useSortState } from '../components/DataTable';
import type { DataTableColumn } from '../components/DataTable';
import {
  buildBar,
  rangeForPreset,
  todayISOLocal,
  unstartedProjects,
  scheduledProjects,
  datedProjectIds,
  productionPlacement,
  expandSegments,
  loadIntervals,
  statusCategory,
  nextFreeDay,
  nextExtraDays,
  addDaysISO,
  PRESET_DEFAULT_PX_PER_DAY,
  PRESET_LABELS,
  type RangePreset,
  type ViewMode,
} from '../components/dandori/dandoriBoardUtils';
import '../components/dandori/dandoriBoard.css';

const FONT_SCALE_KEY = `${APP_STORAGE_PREFIX}dandori_font_scale`;
const TODO_OPEN_KEY = `${APP_STORAGE_PREFIX}dandori_todo_open`;

export const SALES_CATEGORY_BORDER_COLORS: Readonly<Record<number, string>> = {
  1: '#2563eb', 2: '#38bdf8', 3: '#8b5cf6', 5: '#ffffff',
};

export function salesCategoryBorderColor(salesCategoryId: number | null | undefined): string | undefined {
  return salesCategoryId == null ? undefined : SALES_CATEGORY_BORDER_COLORS[salesCategoryId];
}
const FONT_SCALES = [0.85, 1, 1.15];
const FONT_LABELS = ['A−', 'A', 'A＋'];
const PRESETS: RangePreset[] = ['8w', '6m', '1y'];
const PROJECTS_QUERY_KEY = ['projects', {}];
const EXTRA_STEP_DAYS = 28; // R-0146: 右端接近1回あたりの延長日数

function loadFontScale(): number {
  const saved = Number(localStorage.getItem(FONT_SCALE_KEY));
  return FONT_SCALES.includes(saved) ? saved : 1;
}

function loadTodoOpen(): boolean {
  try {
    return localStorage.getItem(TODO_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export default function DandoriBoard() {
  const { data: projects = [], isLoading, error } = useProjects();
  const { data: projectStatuses = [] } = useProjectStatuses();
  const { data: schedules = [] } = useAllProjectSchedules();
  const scheduleMutation = useUpdateProjectSchedule();
  const createScheduleMutation = useCreateProjectScheduleFor();
  const { settings } = useAppSettings();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<RangePreset>('8w');
  const [pxPerDay, setPxPerDay] = useState(PRESET_DEFAULT_PX_PER_DAY['8w']);
  const [mode, setMode] = useState<ViewMode>('scroll');
  const [fontScale, setFontScale] = useState(loadFontScale);
  const [showDone, setShowDone] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [extraDays, setExtraDays] = useState(0);
  const [extraBeforeDays, setExtraBeforeDays] = useState(0);
  const [todoOpen, setTodoOpen] = useState(loadTodoOpen);
  const [addingScheduleProjectId, setAddingScheduleProjectId] = useState<number | null>(null);

  const todayISO = todayISOLocal();
  const { start: presetRangeStart, end: presetRangeEnd } = useMemo(
    () => rangeForPreset(todayISO, preset),
    [todayISO, preset],
  );
  const rangeStart = useMemo(
    () => addDaysISO(presetRangeStart, -extraBeforeDays),
    [presetRangeStart, extraBeforeDays],
  );
  const rangeEnd = useMemo(() => addDaysISO(presetRangeEnd, extraDays), [presetRangeEnd, extraDays]);

  const commitMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Project> }) =>
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
    setExtraDays(0);
    setExtraBeforeDays(0);
  }

  function handleNearRightEdge() {
    setExtraDays(prev => nextExtraDays(prev, EXTRA_STEP_DAYS));
  }

  function handleNearLeftEdge() {
    setExtraBeforeDays(prev => nextExtraDays(prev, EXTRA_STEP_DAYS));
  }

  function handleCommit(id: number, patch: { delivery_date?: string }) {
    setDragError(null);
    commitMutation.mutate({ id, patch });
  }

  function placeProduction(projectId: number, date: string) {
    setDragError(null);
    const action = productionPlacement(schedules, projectId, date);
    if (action.type === 'update') {
      scheduleMutation.mutate({ id: action.id, ...action.patch });
    } else {
      createScheduleMutation.mutate({ projectId, ...action.input });
    }
  }

  const schedulesByProject = useMemo(() => {
    const map = new Map<number, ProjectSchedule[]>();
    for (const schedule of schedules) map.set(schedule.project_id, [...(map.get(schedule.project_id) ?? []), schedule]);
    return map;
  }, [schedules]);
  const visibleBars = useMemo(
    () => scheduledProjects(projects, schedules, showDone).map(p => ({
      ...buildBar(p, schedulesByProject.get(p.id) ?? [], settings.hoursPerDay),
      salesBorderColor: salesCategoryBorderColor(p.sales_category_id),
    })),
    [projects, schedules, schedulesByProject, showDone, settings.hoursPerDay],
  );
  const overCount = visibleBars.filter(b => b.delivery && b.end > b.delivery).length;
  const datedIds = useMemo(() => datedProjectIds(schedules), [schedules]);
  const unsetCount = projects.filter(p => !datedIds.has(p.id)).length;
  const unsetProjects = useMemo(
    () => unstartedProjects(projects, showDone, datedIds),
    [projects, showDone, datedIds],
  );
  const projectNames = useMemo(
    () => new Map(projects.filter(p => showDone || statusCategory(p.status) !== 'done').map(p => [p.id, p.name])),
    [projects, showDone],
  );
  const nextFreeBars = useMemo(
    () => loadIntervals(visibleBars, schedules).map(b => ({ start: b.start, end: b.end })),
    [visibleBars, schedules],
  );
  const nextFree = useMemo(
    () => nextFreeDay(nextFreeBars, todayISO),
    [nextFreeBars, todayISO],
  );

  const [unsetSort, setUnsetSort] = useSortState('dandori-unset', { key: 'delivery_date', dir: 'asc' });
  const sortedUnset = useMemo(() => {
    const key = unsetSort?.key ?? 'delivery_date';
    const dir = unsetSort?.dir ?? 'asc';
    const valueOf = (p: Project) => {
      if (key === 'hours') return p.effective_estimated_hours ?? -1;
      if (key === 'name') return p.name;
      if (key === 'customer_name') return p.customer_name ?? '';
      return p.delivery_date ?? '9999-99-99';
    };
    return [...unsetProjects].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'desc' ? -cmp : cmp;
    });
  }, [unsetProjects, unsetSort]);

  const unsetColumns: DataTableColumn<Project>[] = [
    { key: 'name', label: '案件名', sortable: true, render: p => <span onDoubleClick={() => setEditingProjectId(p.id)}>{p.name}</span> },
    { key: 'customer_name', label: '得意先', sortable: true, render: p => p.customer_name ?? '—' },
    { key: 'delivery_date', label: '納期', sortable: true, render: p => p.delivery_date ?? '—' },
    {
      key: 'hours', label: '工数(h)', align: 'right', sortable: true,
      render: p => (p.effective_estimated_hours != null ? `${p.effective_estimated_hours}h` : '—'),
    },
    {
      key: 'actions', label: '', width: 190, stopRowClick: true,
      render: p => (
        <span className="dt-actions">
          <button onClick={() => placeProduction(p.id, todayISO)}>今日に置く</button>
          <button onClick={() => placeProduction(p.id, nextFree)}>次の空きに置く</button>
        </span>
      ),
    },
  ];

  if (isLoading) return <div className="p-6">読み込み中...</div>;
  if (error) return <div className="p-6 text-red-600">エラー: {String(error)}</div>;

  return (
    <div className="dandori-board" style={{ ['--scale' as string]: fontScale } as React.CSSProperties}>
      <div className="db-header">
        <h1>段取りボード</h1>
        <span className="sub">{rangeStart} 〜 {rangeEnd}（{PRESET_LABELS[preset]}）</span>
        {unsetCount > 0 && <span className="unset-note">予定なし {unsetCount}件</span>}
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
          <input
            type="checkbox"
            checked={todoOpen}
            onChange={e => {
              setTodoOpen(e.target.checked);
              try {
                localStorage.setItem(TODO_OPEN_KEY, e.target.checked ? '1' : '0');
              } catch {
                // 保存できない環境では表示状態を覚えない
              }
            }}
          />
          やること
        </label>
        <label className="filter">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          完了・キャンセルを表示
        </label>
        <div className="filter">1日 = <b>{settings.hoursPerDay}時間</b>（設定で変更）</div>
      </div>

      <div className="board-body">
      {mode === 'scroll' ? (
        <GanttScroll
          bars={visibleBars}
          schedules={schedules}
          onScheduleMove={(id, patch) => scheduleMutation.mutate({ id, ...patch })}
          onAddSchedule={setAddingScheduleProjectId}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pxPerDay={pxPerDay}
          todayISO={todayISO}
          onCommit={handleCommit}
          onProjectDoubleClick={setEditingProjectId}
          onNearRightEdge={handleNearRightEdge}
          onNearLeftEdge={handleNearLeftEdge}
          statusOptions={[...projectStatuses]
            .filter(status => status.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(status => status.name)}
          onStatusChange={(id, status) => commitMutation.mutate({ id, patch: { status } })}
        />
      ) : (
        <WrapView bars={expandSegments(visibleBars)} rangeStart={rangeStart} rangeEnd={rangeEnd} todayISO={todayISO} onProjectDoubleClick={setEditingProjectId} />
      )}
      {todoOpen && (
        <TodoPanel
          schedules={schedules}
          projectNames={projectNames}
          todayISO={todayISO}
          onToggleDone={(id, done) => scheduleMutation.mutate({ id, done: done ? 1 : 0 })}
          onOpenProject={setEditingProjectId}
        />
      )}
      </div>

      {unsetProjects.length > 0 && (
        <>
          <h2 className="section-title">予定のない案件（{unsetProjects.length}件）</h2>
          <DataTable
            tableId="dandori-unset"
            columns={unsetColumns}
            rows={sortedUnset}
            rowKey={p => p.id}
            sortKey={unsetSort?.key}
            sortDir={unsetSort?.dir}
            onSortChange={setUnsetSort}
          />
        </>
      )}
      {addingScheduleProjectId !== null && (
        <ScheduleAddModal
          projectId={addingScheduleProjectId}
          projectName={projectNames.get(addingScheduleProjectId) ?? ''}
          defaultDate={todayISO}
          onClose={() => setAddingScheduleProjectId(null)}
        />
      )}
      {editingProjectId !== null && (
        <ProjectQuickEditModal
          projectId={editingProjectId}
          onClose={() => setEditingProjectId(null)}
          onSaved={() => setEditingProjectId(null)}
        />
      )}
    </div>
  );
}
