import React, { useMemo } from 'react';
import {
  TrendingUp, CheckCircle, Clock, AlertCircle, Users, FileText,
  BarChart2, Activity, Zap, ArrowRight, Circle, Flag,
} from 'lucide-react';
import { JiraIssue, JiraProject, ConfluenceSpace, JiraUser, Notification, AuthUser } from '../types';

const COLUMNS = [
  { id: 'backlog',     label: 'Backlog',     color: '#8993A4' },
  { id: 'todo',        label: 'To Do',       color: '#97A0AF' },
  { id: 'in-progress', label: 'In Progress', color: '#0052CC' },
  { id: 'in-review',   label: 'In Review',   color: '#FF8B00' },
  { id: 'done',        label: 'Done',        color: '#00875A' },
];

interface Props {
  issues: JiraIssue[];
  projects: JiraProject[];
  spaces: ConfluenceSpace[];
  users: JiraUser[];
  notifications: Notification[];
  currentUser: AuthUser | null;
  onSelectProject: (p: JiraProject) => void;
  onSelectPage: (pageId: string, spaceId: string) => void;
}

function relDate(s: string) {
  const d = new Date(s);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function StatCard({ label, value, sub, icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; bg: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#DFE1E6] p-5 flex items-start gap-4"
      style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: bg, color }}>
        {icon}
      </div>
      <div>
        <div className="text-[26px] font-bold text-[#172B4D] leading-none">{value}</div>
        <div className="text-[12px] font-semibold text-[#42526E] mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-[#8993A4] mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function MiniDonut({ done, total, color }: { done: number; total: number; color: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const r = 14; const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#DFE1E6" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform="rotate(-90 20 20)" style={{ transition: 'stroke-dasharray 0.4s' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[#172B4D]">{pct}%</span>
    </div>
  );
}

export function Dashboard({ issues, projects, spaces, users, notifications, currentUser, onSelectProject, onSelectPage }: Props) {
  const totalPages = spaces.reduce((a, s) => a + s.pages.length, 0);
  const doneIssues = issues.filter(i => i.status === 'done').length;
  const inProgress = issues.filter(i => i.status === 'in-progress').length;
  const overdue = 0;

  const recentPages = useMemo(() =>
    spaces.flatMap(s => s.pages.map(p => ({ ...p, spaceName: s.name, spaceColor: s.color, spaceId: s.id, spaceEmoji: s.emoji })))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5),
    [spaces]
  );

  const issuesByStatus = COLUMNS.map(col => ({
    col, count: issues.filter(i => i.status === col.id).length,
  }));

  const issuesByPriority = [
    { label: 'Highest', color: '#BF2600', count: issues.filter(i => i.priority === 'highest').length },
    { label: 'High',    color: '#DE350B', count: issues.filter(i => i.priority === 'high').length },
    { label: 'Medium',  color: '#974F0C', count: issues.filter(i => i.priority === 'medium').length },
    { label: 'Low',     color: '#006644', count: issues.filter(i => i.priority === 'low').length },
  ].filter(p => p.count > 0);

  const maxCount = Math.max(...issuesByStatus.map(s => s.count), 1);

  const recentActivity: { icon: React.ReactNode; text: string; time: string; color: string }[] = [
    ...notifications.slice(0, 6).map(n => ({
      icon: n.type === 'issue_assigned' ? <CheckCircle size={13} /> :
            n.type === 'sprint_started' ? <Zap size={13} /> :
            <FileText size={13} />,
      text: n.body,
      time: relDate(n.createdAt),
      color: n.type === 'issue_assigned' ? '#0052CC' : n.type === 'sprint_started' ? '#6554C0' : '#00875A',
    })),
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F5F7]">
      {/* Hero */}
      <div className="bg-white border-b border-[#DFE1E6] px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-bold text-[#172B4D]">Good morning, {currentUser?.name?.split(' ')[0] ?? 'there'} 👋</h1>
            <p className="text-[14px] text-[#42526E] mt-1">
              {new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {inProgress > 0 && (
              <div className="flex items-center gap-2 bg-[#DEEBFF] text-[#0052CC] px-3 py-2 rounded-lg text-[13px] font-semibold">
                <Activity size={14} /> {inProgress} in progress
              </div>
            )}
            {overdue > 0 && (
              <div className="flex items-center gap-2 bg-[#FFEBE6] text-[#DE350B] px-3 py-2 rounded-lg text-[13px] font-semibold">
                <AlertCircle size={14} /> {overdue} overdue
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Issues"    value={issues.length}   sub={`${doneIssues} completed`}  icon={<Flag size={18} />}        color="#0052CC" bg="#DEEBFF" />
          <StatCard label="Active Projects" value={projects.length} sub={`${users.length} members`}  icon={<BarChart2 size={18} />}    color="#6554C0" bg="#EAE6FF" />
          <StatCard label="Pages Created"   value={totalPages}      sub={`${spaces.length} spaces`}  icon={<FileText size={18} />}     color="#00875A" bg="#E3FCEF" />
          <StatCard label="Team Members"    value={users.length}    sub="Contributing today"          icon={<Users size={18} />}        color="#FF8B00" bg="#FFF7D6" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Issue Status Chart */}
          <div className="bg-white rounded-xl border border-[#DFE1E6] p-5" style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
            <h3 className="text-[14px] font-bold text-[#172B4D] mb-4 flex items-center gap-2">
              <BarChart2 size={15} className="text-[#0052CC]" /> Issues by Status
            </h3>
            <div className="space-y-3">
              {issuesByStatus.map(({ col, count }) => (
                <div key={col.id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-[12px] font-medium text-[#42526E] w-24 flex-shrink-0">{col.label}</span>
                  <div className="flex-1 h-2 bg-[#F4F5F7] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: maxCount ? `${(count / maxCount) * 100}%` : 0, background: col.color }} />
                  </div>
                  <span className="text-[12px] font-bold text-[#172B4D] w-6 text-right flex-shrink-0">{count}</span>
                </div>
              ))}
              {issues.length === 0 && (
                <p className="text-[13px] text-[#8993A4] text-center py-4">No issues yet</p>
              )}
            </div>
          </div>

          {/* Priority Breakdown */}
          <div className="bg-white rounded-xl border border-[#DFE1E6] p-5" style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
            <h3 className="text-[14px] font-bold text-[#172B4D] mb-4 flex items-center gap-2">
              <TrendingUp size={15} className="text-[#6554C0]" /> Priority Breakdown
            </h3>
            {issuesByPriority.length === 0 ? (
              <p className="text-[13px] text-[#8993A4] text-center py-8">No issues yet</p>
            ) : (
              <div className="space-y-3">
                {issuesByPriority.map(({ label, color, count }) => (
                  <div key={label} className="flex items-center gap-3">
                    <Circle size={10} fill={color} color={color} className="flex-shrink-0" />
                    <span className="text-[12px] font-medium text-[#42526E] w-16 flex-shrink-0">{label}</span>
                    <div className="flex-1 h-2 bg-[#F4F5F7] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(count / issues.length) * 100}%`, background: color }} />
                    </div>
                    <span className="text-[12px] font-bold text-[#172B4D] w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="bg-white rounded-xl border border-[#DFE1E6] p-5" style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
            <h3 className="text-[14px] font-bold text-[#172B4D] mb-4 flex items-center gap-2">
              <Activity size={15} className="text-[#00875A]" /> Recent Activity
            </h3>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-[13px] text-[#8993A4] text-center py-4">No recent activity</p>
              ) : recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${a.color}18`, color: a.color }}>
                    {a.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-[#172B4D] leading-snug line-clamp-2">{a.text}</p>
                    <span className="text-[10px] text-[#8993A4]">{a.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projects */}
          <div className="bg-white rounded-xl border border-[#DFE1E6] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6]">
              <h3 className="text-[14px] font-bold text-[#172B4D] flex items-center gap-2">
                <BarChart2 size={15} className="text-[#0052CC]" /> Projects
              </h3>
              <span className="text-[11px] font-semibold text-[#8993A4] bg-[#F4F5F7] px-2 py-0.5 rounded-full">{projects.length}</span>
            </div>
            <div className="divide-y divide-[#F4F5F7]">
              {projects.length === 0 ? (
                <div className="py-10 text-center text-[#8993A4]">
                  <p className="text-[13px]">No projects yet</p>
                </div>
              ) : projects.slice(0, 5).map(p => {
                const projIssues = issues.filter(i => i.projectId === p.id);
                const projDone   = projIssues.filter(i => i.status === 'done').length;
                return (
                  <button key={p.id} onClick={() => onSelectProject(p)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#F4F5F7] transition-colors text-left group">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: `${p.color}18` }}>
                      {p.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[#172B4D] group-hover:text-[#0052CC] transition-colors truncate">{p.name}</div>
                      <div className="text-[11px] text-[#8993A4]">{p.type} · {p.key} · {projIssues.length} issues</div>
                    </div>
                    <MiniDonut done={projDone} total={projIssues.length} color={p.color} />
                    <ArrowRight size={13} className="text-[#8993A4] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Pages */}
          <div className="bg-white rounded-xl border border-[#DFE1E6] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6]">
              <h3 className="text-[14px] font-bold text-[#172B4D] flex items-center gap-2">
                <FileText size={15} className="text-[#00875A]" /> Recently Updated Pages
              </h3>
              <span className="text-[11px] font-semibold text-[#8993A4] bg-[#F4F5F7] px-2 py-0.5 rounded-full">{totalPages}</span>
            </div>
            <div className="divide-y divide-[#F4F5F7]">
              {recentPages.length === 0 ? (
                <div className="py-10 text-center text-[#8993A4]">
                  <p className="text-[13px]">No pages yet</p>
                </div>
              ) : recentPages.map(page => (
                <button key={page.id} onClick={() => onSelectPage(page.id, page.spaceId)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-[#F4F5F7] transition-colors text-left group">
                  <span className="text-xl flex-shrink-0">{page.emoji ?? '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[#172B4D] group-hover:text-[#0052CC] transition-colors truncate">{page.title}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#8993A4]">
                      <span className="font-semibold" style={{ color: page.spaceColor }}>{page.spaceEmoji} {page.spaceName}</span>
                      <span>·</span>
                      <Clock size={9} />
                      <span>{relDate(page.updatedAt)}</span>
                    </div>
                  </div>
                  <ArrowRight size={13} className="text-[#8993A4] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* My Issues */}
        <div className="bg-white rounded-xl border border-[#DFE1E6] overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6]">
            <h3 className="text-[14px] font-bold text-[#172B4D] flex items-center gap-2">
              <CheckCircle size={15} className="text-[#0052CC]" /> My Open Issues
            </h3>
          </div>
          {(() => {
            const myIssues = issues.filter(i => i.assigneeId === 'u1' && i.status !== 'done').slice(0, 6);
            if (myIssues.length === 0) {
              return (
                <div className="py-10 text-center text-[#8993A4]">
                  <CheckCircle size={28} strokeWidth={1.5} className="mx-auto mb-2 text-[#00875A]" />
                  <p className="text-[13px] font-semibold">You're all caught up!</p>
                  <p className="text-[12px]">No open issues assigned to you.</p>
                </div>
              );
            }
            return (
              <div className="divide-y divide-[#F4F5F7]">
                {myIssues.map(issue => {
                  const proj = projects.find(p => p.id === issue.projectId);
                  const col  = COLUMNS.find(c => c.id === issue.status);
                  return (
                    <div key={issue.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F4F5F7] transition-colors">
                      <span className="text-[10px] font-mono font-bold text-[#8993A4] w-16 flex-shrink-0">{issue.key}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium text-[#172B4D] truncate">{issue.title}</span>
                      </div>
                      {proj && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: `${proj.color}18`, color: proj.color }}>{proj.emoji} {proj.key}</span>
                      )}
                      {col && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                          style={{ background: `${col.color}18`, color: col.color }}>{col.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
