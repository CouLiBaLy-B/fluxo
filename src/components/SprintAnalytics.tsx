import { useMemo } from 'react';
import { X, TrendingDown, BarChart2, CheckCircle, Clock, Zap, Users } from 'lucide-react';
import type { JiraIssue, Sprint } from '../types';

// Colonnes pour l'affichage de la progression
const COLUMNS = [
  { id: 'backlog',     label: 'Backlog',     color: '#8993A4' },
  { id: 'todo',        label: 'To Do',       color: '#97A0AF' },
  { id: 'in-progress', label: 'In Progress', color: '#0052CC' },
  { id: 'in-review',   label: 'In Review',   color: '#FF8B00' },
  { id: 'done',        label: 'Done',        color: '#00875A' },
];

const TYPE_COLORS: Record<string, string> = {
  task: '#0052CC', story: '#00875A', bug: '#DE350B', epic: '#6554C0', subtask: '#42526E',
};

interface Props {
  sprints: Sprint[];
  issues: JiraIssue[];
  onClose: () => void;
}

export function SprintAnalytics({ sprints, issues, onClose }: Props) {
  // Utilise le sprint actif ou le premier sprint disponible
  const sprint = sprints.find(s => s.active) ?? sprints[0];
  if (!sprint) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-2xl w-full max-w-sm mx-4 p-8 text-center"
          style={{ boxShadow: '0 24px 80px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>
          <BarChart2 size={32} className="mx-auto mb-3 text-[#8993A4]" />
          <p className="text-[14px] font-semibold text-[#172B4D] mb-1">Pas de sprint</p>
          <p className="text-[12px] text-[#8993A4]">Créez un sprint pour voir les analytics.</p>
          <button onClick={onClose} className="mt-4 btn-secondary">Fermer</button>
        </div>
      </div>
    );
  }

  // Issues du sprint courant seulement
  const sprintIssues = issues.filter(i => i.sprintId === sprint.id);

  const totalPoints = sprintIssues.reduce((a, i) => a + i.storyPoints, 0);
  const donePoints  = sprintIssues.filter(i => i.status === 'done').reduce((a, i) => a + i.storyPoints, 0);
  const doneCount   = sprintIssues.filter(i => i.status === 'done').length;

  // Données burndown (simulées car pas d'historique journalier en base)
  const start   = sprint.startDate ? new Date(sprint.startDate) : new Date();
  const end     = sprint.endDate   ? new Date(sprint.endDate)   : new Date(Date.now() + 14 * 86400000);
  const days    = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  const today   = new Date();
  const elapsed = Math.min(days, Math.max(0, Math.ceil((today.getTime() - start.getTime()) / 86400000)));

  const burndownData = useMemo(() => {
    return Array.from({ length: days + 1 }, (_, i) => {
      const ideal    = totalPoints - (totalPoints / days) * i;
      const progress = i <= elapsed
        ? Math.max(0, totalPoints - (donePoints / Math.max(elapsed, 1)) * i + (Math.sin(i) * 2))
        : null;
      return { day: i, ideal: Math.max(0, ideal), actual: progress !== null ? Math.max(0, progress) : null };
    });
  }, [days, elapsed, totalPoints, donePoints]);

  const svgW = 400; const svgH = 160;
  const pad  = { t: 10, r: 10, b: 30, l: 40 };
  const innerW = svgW - pad.l - pad.r;
  const innerH = svgH - pad.t - pad.b;

  const xScale = (d: number) => (d / days) * innerW;
  const yScale = (v: number) => innerH - (totalPoints > 0 ? (v / totalPoints) * innerH : 0);

  const idealPath  = burndownData.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.day)},${yScale(d.ideal)}`).join(' ');
  const actualData = burndownData.filter(d => d.actual !== null);
  const actualPath = actualData.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(d.day)},${yScale(d.actual!)}`).join(' ');

  // Statistiques par assigné — utilise les données dénormalisées de l'issue
  const byAssignee = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string; color: string; total: number; done: number; points: number }>();
    sprintIssues.forEach(issue => {
      if (!issue.assigneeId) return;
      const key  = issue.assigneeId;
      const name = issue.assigneeName ?? 'Utilisateur';
      const avatar = issue.assigneeAvatar ?? name.slice(0, 2).toUpperCase();
      const color  = issue.assigneeColor ?? '#DFE1E6';
      const entry  = map.get(key) ?? { name, avatar, color, total: 0, done: 0, points: 0 };
      entry.total  += 1;
      entry.done   += issue.status === 'done' ? 1 : 0;
      entry.points += issue.storyPoints;
      map.set(key, entry);
    });
    return [...map.entries()].map(([id, v]) => ({ id, ...v }));
  }, [sprintIssues]);

  // Statistiques par type
  const byType = (['task', 'story', 'bug', 'epic', 'subtask'] as const).map(type => ({
    type,
    count: sprintIssues.filter(i => i.type === type).length,
  })).filter(x => x.count > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto flex flex-col"
        style={{ boxShadow: '0 24px 80px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#DFE1E6] bg-[#FAFBFC] flex-shrink-0">
          <div>
            <h2 className="text-[18px] font-bold text-[#172B4D] flex items-center gap-2">
              <BarChart2 size={18} className="text-[#0052CC]" /> Sprint Analytics
            </h2>
            <p className="text-[12px] text-[#42526E] mt-0.5">
              {sprint.name}
              {sprint.startDate && sprint.endDate && ` · ${sprint.startDate} → ${sprint.endDate}`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]">
            <X size={15} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Issues',   value: sprintIssues.length,               icon: <BarChart2 size={14} />,   color: '#0052CC', bg: '#DEEBFF' },
              { label: 'Completed',      value: doneCount,                          icon: <CheckCircle size={14} />, color: '#00875A', bg: '#E3FCEF' },
              { label: 'Story Points',   value: `${donePoints}/${totalPoints}`,     icon: <Zap size={14} />,         color: '#6554C0', bg: '#EAE6FF' },
              { label: 'Days Remaining', value: Math.max(0, days - elapsed),        icon: <Clock size={14} />,       color: '#FF8B00', bg: '#FFF7D6' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-[#F4F5F7] rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2" style={{ color: kpi.color }}>
                  {kpi.icon}
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{kpi.label}</span>
                </div>
                <div className="text-[22px] font-bold text-[#172B4D]">{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Barre de progression */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-semibold text-[#42526E]">Sprint Progress</span>
              <span className="text-[12px] font-bold text-[#172B4D]">
                {totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0}% complete
              </span>
            </div>
            <div className="w-full h-3 bg-[#DFE1E6] rounded-full overflow-hidden">
              <div className="h-full bg-[#00875A] rounded-full transition-all duration-700"
                style={{ width: `${totalPoints > 0 ? (donePoints / totalPoints) * 100 : 0}%` }} />
            </div>
            <div className="flex items-center gap-4 mt-2">
              {COLUMNS.map(col => {
                const cnt = sprintIssues.filter(i => i.status === col.id).length;
                if (!cnt) return null;
                return (
                  <div key={col.id} className="flex items-center gap-1.5 text-[11px]">
                    <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                    <span style={{ color: col.color }} className="font-semibold">{col.label}</span>
                    <span className="text-[#8993A4]">{cnt}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Burndown Chart */}
          {totalPoints > 0 && (
            <div>
              <h3 className="text-[13px] font-bold text-[#172B4D] mb-3 flex items-center gap-2">
                <TrendingDown size={14} /> Burndown Chart
              </h3>
              <div className="bg-[#F4F5F7] rounded-xl p-4 overflow-x-auto">
                <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', width: '100%', maxWidth: svgW }}>
                  <g transform={`translate(${pad.l},${pad.t})`}>
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => (
                      <g key={pct}>
                        <line x1={0} y1={yScale(totalPoints * pct)} x2={innerW} y2={yScale(totalPoints * pct)} stroke="#DFE1E6" strokeWidth={1} />
                        <text x={-6} y={yScale(totalPoints * pct) + 4} textAnchor="end" fontSize={9} fill="#8993A4">
                          {Math.round(totalPoints * (1 - pct))}
                        </text>
                      </g>
                    ))}
                    <path d={idealPath} fill="none" stroke="#DFE1E6" strokeWidth={2} strokeDasharray="6,3" />
                    {actualPath && <path d={actualPath} fill="none" stroke="#0052CC" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
                    {elapsed > 0 && elapsed <= days && (
                      <line x1={xScale(elapsed)} y1={0} x2={xScale(elapsed)} y2={innerH}
                        stroke="#DE350B" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.6} />
                    )}
                    {[0, Math.floor(days / 4), Math.floor(days / 2), Math.floor(3 * days / 4), days].map(d => (
                      <text key={d} x={xScale(d)} y={innerH + 18} textAnchor="middle" fontSize={9} fill="#8993A4">D{d}</text>
                    ))}
                  </g>
                </svg>
                <div className="flex items-center gap-4 mt-2 px-2">
                  <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 border-t-2 border-dashed border-[#DFE1E6]" /><span className="text-[10px] text-[#8993A4]">Ideal</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-6 h-0.5 bg-[#0052CC] rounded" /><span className="text-[10px] text-[#8993A4]">Actual</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-0.5 h-3 bg-[#DE350B] opacity-60" /><span className="text-[10px] text-[#8993A4]">Today</span></div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Par assigné */}
            <div>
              <h3 className="text-[13px] font-bold text-[#172B4D] mb-3 flex items-center gap-2">
                <Users size={14} /> By Assignee
              </h3>
              {byAssignee.length === 0 ? (
                <p className="text-[12px] text-[#8993A4]">No assignments yet</p>
              ) : (
                <div className="space-y-3">
                  {byAssignee.map(({ id, name, avatar, color, total, done, points }) => (
                    <div key={id} className="flex items-center gap-3">
                      <div title={name} style={{ width: 26, height: 26, background: color, fontSize: 10 }}
                        className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 uppercase">
                        {avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold text-[#172B4D]">{name.split(' ')[0]}</span>
                          <span className="text-[11px] text-[#42526E]">{done}/{total} · {points}pts</span>
                        </div>
                        <div className="w-full h-1.5 bg-[#DFE1E6] rounded-full overflow-hidden">
                          <div className="h-full bg-[#0052CC] rounded-full"
                            style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Par type */}
            <div>
              <h3 className="text-[13px] font-bold text-[#172B4D] mb-3 flex items-center gap-2">
                <Zap size={14} /> By Type
              </h3>
              {byType.length === 0 ? (
                <p className="text-[12px] text-[#8993A4]">No issues yet</p>
              ) : (
                <div className="space-y-2.5">
                  {byType.map(({ type, count }) => (
                    <div key={type} className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: TYPE_COLORS[type] }} />
                      <span className="text-[12px] font-medium text-[#42526E] capitalize w-16">{type}</span>
                      <div className="flex-1 h-1.5 bg-[#DFE1E6] rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${sprintIssues.length ? (count / sprintIssues.length) * 100 : 0}%`, background: TYPE_COLORS[type] }} />
                      </div>
                      <span className="text-[11px] font-bold text-[#172B4D] w-4 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
