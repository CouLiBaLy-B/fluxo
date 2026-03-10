import React, { useState, useCallback } from 'react';
import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bug, BookOpen, CheckSquare, Zap, AlertCircle, ArrowUp, ArrowDown, Minus,
  Plus, X, ChevronDown, MessageSquare, Link2, Search,
  Filter, Flag, Edit2, Trash2, Save, RotateCcw, ArrowLeft,
  List, Layout, Map, Settings, Play, Square, Clock, Calendar,
  ChevronRight, BarChart2, Layers, User, Tag as TagIcon, Users,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { SprintAnalytics } from './SprintAnalytics';
import { AgentSelector } from './agents/AgentSelector';
import { AgentInstructionsField } from './agents/AgentInstructionsField';
import { AgentTaskPanel } from './agents/AgentTaskPanel';
import { AIIssueCard } from './kanban/AIIssueCard';
import type {
  JiraIssue, JiraProject, Sprint, Priority, IssueType, Status,
  JiraBoardView, JiraUser, IssueFormData, ReorderItem,
  AIAgent, AITaskQueue,
} from '../types';

// ─── Colonnes Kanban — configuration d'affichage uniquement ──────────────────

const COLUMNS = [
  { id: 'backlog'     as const, label: 'Backlog',     color: '#8993A4', wip: 0 },
  { id: 'todo'        as const, label: 'To Do',       color: '#97A0AF', wip: 0 },
  { id: 'in-progress' as const, label: 'In Progress', color: '#0052CC', wip: 4 },
  { id: 'in-review'   as const, label: 'In Review',   color: '#FF8B00', wip: 3 },
  { id: 'done'        as const, label: 'Done',         color: '#00875A', wip: 0 },
];

// ─── Config priorité / type ───────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  highest: { label: 'Highest', bg: '#FFEBE6', text: '#BF2600', icon: <AlertCircle size={12} strokeWidth={2.5} /> },
  high:    { label: 'High',    bg: '#FFEBE6', text: '#DE350B', icon: <ArrowUp     size={12} strokeWidth={2.5} /> },
  medium:  { label: 'Medium',  bg: '#FFF7D6', text: '#974F0C', icon: <Minus       size={12} strokeWidth={2.5} /> },
  low:     { label: 'Low',     bg: '#E3FCEF', text: '#006644', icon: <ArrowDown   size={12} strokeWidth={2.5} /> },
  lowest:  { label: 'Lowest',  bg: '#EAE6FF', text: '#403294', icon: <ArrowDown   size={12} strokeWidth={2.5} /> },
};

const TYPE_CONFIG: Record<IssueType, { label: string; icon: React.ReactNode; bg: string; color: string }> = {
  epic:    { label: 'Epic',    bg: '#EAE6FF', color: '#6554C0', icon: <Zap         size={10} strokeWidth={2.5} /> },
  story:   { label: 'Story',   bg: '#E3FCEF', color: '#00875A', icon: <BookOpen    size={10} strokeWidth={2.5} /> },
  task:    { label: 'Task',    bg: '#DEEBFF', color: '#0052CC', icon: <CheckSquare size={10} strokeWidth={2.5} /> },
  bug:     { label: 'Bug',     bg: '#FFEBE6', color: '#DE350B', icon: <Bug         size={10} strokeWidth={2.5} /> },
  subtask: { label: 'Subtask', bg: '#F4F5F7', color: '#42526E', icon: <CheckSquare size={10} strokeWidth={2.5} /> },
};

// ─── Avatar — utilise la liste utilisateurs chargée depuis l'API ──────────────

function Avatar({ userId, users, size = 24 }: { userId: string | null; users: JiraUser[]; size?: number }) {
  if (!userId) return null;
  const user = users.find(u => u.id === userId);
  if (!user) return (
    <div title="Utilisateur inconnu"
      style={{ width: size, height: size, background: '#DFE1E6', fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-[#42526E] font-semibold flex-shrink-0">
      ?
    </div>
  );
  return (
    <div title={user.name}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 uppercase">
      {user.avatar}
    </div>
  );
}

// Avatar inline utilisant les données dénormalisées de l'issue (sans liste users)
function AssigneeAvatar({ issue, size = 22 }: { issue: JiraIssue; size?: number }) {
  if (!issue.assigneeId) return null;
  const initials = issue.assigneeAvatar
    ?? (issue.assigneeName ? issue.assigneeName.split(' ').map(n => n[0]).join('').slice(0, 2) : '?');
  const color = issue.assigneeColor ?? '#DFE1E6';
  return (
    <div title={issue.assigneeName ?? 'Assigné'}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 uppercase">
      {initials}
    </div>
  );
}

function TypeBadge({ type }: { type: IssueType }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span style={{ background: cfg.bg, color: cfg.color }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold">
      {cfg.icon}{cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const col = COLUMNS.find(c => c.id === status);
  if (!col) return null;
  return (
    <span style={{ background: `${col.color}22`, color: col.color, border: `1px solid ${col.color}44` }}
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
      {col.label}
    </span>
  );
}

// ─── Issue Card (Board) ───────────────────────────────────────────────────────

function IssueCard({ issue, onClick, overlay, aiAgent, aiTask, onOpenPanel }: {
  issue: JiraIssue;
  onClick: () => void;
  overlay?: boolean;
  aiAgent?: AIAgent | null;
  aiTask?: AITaskQueue | null;
  onOpenPanel?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const pCfg = PRIORITY_CONFIG[issue.priority];

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}
      className={['issue-card group', isDragging ? 'opacity-20' : '', overlay ? 'drag-overlay' : ''].join(' ')}>
      <div className="flex items-center justify-between mb-2">
        <TypeBadge type={issue.type} />
        <span title={pCfg.label} style={{ color: pCfg.text }}>{pCfg.icon}</span>
      </div>
      <p className="text-[13px] font-semibold text-[#172B4D] leading-snug mb-3 line-clamp-2">{issue.title}</p>
      {issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {issue.labels.slice(0, 3).map(l => (
            <span key={l} className="text-[10px] bg-[#F4F5F7] text-[#42526E] rounded px-1.5 py-0.5 font-medium">{l}</span>
          ))}
          {issue.labels.length > 3 && <span className="text-[10px] text-[#8993A4]">+{issue.labels.length - 3}</span>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#8993A4]">
          <span className="text-[10px] font-mono font-semibold">{issue.key}</span>
          {issue.comments.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px]"><MessageSquare size={10} /> {issue.comments.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-[#42526E]"
            style={{ background: '#F4F5F7', border: '1px solid #DFE1E6' }} title="Story points">
            {issue.storyPoints}
          </span>
          <AssigneeAvatar issue={issue} size={22} />
        </div>
      </div>
      {aiAgent && (
        <AIIssueCard
          agent={aiAgent}
          task={aiTask}
          aiProgress={issue.aiProgress}
          onOpenPanel={onOpenPanel}
        />
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({ col, issues, onCardClick, isDraggingOver, agentMap, taskByIssue, onOpenAIPanel }: {
  col: typeof COLUMNS[0];
  issues: JiraIssue[];
  onCardClick: (i: JiraIssue) => void;
  isDraggingOver: boolean;
  agentMap?: Record<string, AIAgent>;
  taskByIssue?: Record<string, AITaskQueue>;
  onOpenAIPanel?: (i: JiraIssue) => void;
}) {
  const { setNodeRef } = useDroppable({ id: col.id });
  const wipExceeded = col.wip > 0 && issues.length > col.wip;

  return (
    <div className="flex flex-col w-[272px] flex-shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
        <span className="text-[13px] font-semibold text-[#172B4D] uppercase tracking-wide">{col.label}</span>
        <span className="ml-1 text-[11px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center"
          style={{ background: wipExceeded ? '#FFEBE6' : '#F4F5F7', color: wipExceeded ? '#DE350B' : '#42526E' }}>
          {issues.length}
        </span>
        {col.wip > 0 && <span className="text-[10px] text-[#8993A4] ml-0.5">/{col.wip}</span>}
      </div>
      <div ref={setNodeRef}
        className={['flex-1 rounded-lg min-h-[80px] transition-colors duration-150 p-1',
          isDraggingOver ? 'bg-[#DEEBFF] ring-2 ring-[#0052CC] ring-opacity-40' : 'bg-[#F4F5F7]'].join(' ')}>
        <SortableContext items={issues.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {issues.map(issue => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onClick={() => onCardClick(issue)}
                aiAgent={issue.assignedAgentId ? agentMap?.[issue.assignedAgentId] : null}
                aiTask={taskByIssue?.[issue.id]}
                onOpenPanel={onOpenAIPanel ? () => onOpenAIPanel(issue) : undefined}
              />
            ))}
          </div>
        </SortableContext>
        {issues.length === 0 && !isDraggingOver && (
          <div className="flex flex-col items-center justify-center py-8 text-[#C1C7D0]">
            <Flag size={20} strokeWidth={1.5} className="mb-1.5" />
            <span className="text-[11px] font-medium">No issues</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Issue Detail Modal ───────────────────────────────────────────────────────

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold text-[#8993A4] uppercase tracking-wider mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function SelectField({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select className="atl-select text-[13px] pr-7" value={value} onChange={e => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#42526E] pointer-events-none" />
    </div>
  );
}

function IssueDetail({ issue, project, sprints, users, onClose, onUpdate, onDelete, onAddComment }: {
  issue: JiraIssue;
  project: JiraProject;
  sprints: Sprint[];
  users: JiraUser[];
  onClose: () => void;
  onUpdate: (data: Partial<IssueFormData>) => void;
  onDelete: () => void;
  onAddComment: (body: string) => void;
}) {
  const { user: currentUser } = useAuth();
  const [editing, setEditing]       = useState(false);
  const [draft, setDraft]           = useState<Partial<IssueFormData>>({});
  const [newComment, setNewComment] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab]   = useState<'details' | 'activity'>('details');

  // Initialise le brouillon à partir de l'issue courante
  const startEdit = () => {
    setDraft({
      title:       issue.title,
      description: issue.description,
      type:        issue.type,
      priority:    issue.priority,
      status:      issue.status,
      assigneeId:  issue.assigneeId,
      storyPoints: issue.storyPoints,
      labels:      [...issue.labels],
      sprintId:    issue.sprintId,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setDraft({}); setEditing(false); };

  const saveEdit = () => {
    onUpdate(draft);
    setEditing(false);
  };

  const submitComment = () => {
    const body = newComment.trim();
    if (!body) return;
    onAddComment(body);
    setNewComment('');
  };

  const setField = <K extends keyof IssueFormData>(k: K, v: IssueFormData[K]) =>
    setDraft(p => ({ ...p, [k]: v }));

  // Valeurs affichées (brouillon si en édition, sinon issue réelle)
  const cur = editing ? { ...issue, ...draft } : issue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden mx-4"
        style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DFE1E6] flex-shrink-0 bg-[#FAFBFC]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded flex items-center justify-center text-sm" style={{ background: `${project.color}18` }}>
              {project.emoji}
            </div>
            <div className="flex items-center gap-2">
              <TypeBadge type={cur.type as IssueType ?? issue.type} />
              <span className="text-[12px] font-bold text-[#0052CC] font-mono">{issue.key}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!editing ? (
              <>
                <button onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-[#42526E] hover:bg-[#F4F5F7] transition-colors">
                  <Edit2 size={13} /> Edit
                </button>
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-[#DE350B] hover:bg-[#FFEBE6] transition-colors">
                  <Trash2 size={13} /> Delete
                </button>
              </>
            ) : (
              <>
                <button onClick={cancelEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-[#42526E] hover:bg-[#F4F5F7] transition-colors">
                  <RotateCcw size={13} /> Discard
                </button>
                <button onClick={saveEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold bg-[#0052CC] text-white hover:bg-[#0065FF] transition-colors">
                  <Save size={13} /> Save changes
                </button>
              </>
            )}
            <button onClick={onClose} className="ml-1 w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Bandeau confirmation suppression */}
        {confirmDelete && (
          <div className="flex items-center justify-between px-6 py-3 bg-[#FFEBE6] border-b border-[#FFBDAD] flex-shrink-0">
            <span className="text-[13px] font-semibold text-[#BF2600]">Delete this issue permanently?</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded text-[12px] font-semibold text-[#42526E] hover:bg-white/60">Cancel</button>
              <button onClick={() => { onDelete(); onClose(); }} className="px-3 py-1.5 rounded text-[12px] font-semibold bg-[#DE350B] text-white hover:bg-[#BF2600]">Delete</button>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Contenu principal */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {editing ? (
              <input className="w-full text-[20px] font-bold text-[#172B4D] leading-snug mb-4 outline-none border-2 border-[#0052CC] rounded-lg px-3 py-2 bg-[#F8F9FF]"
                value={(draft.title ?? issue.title)} onChange={e => setField('title', e.target.value)} />
            ) : (
              <h1 className="text-[20px] font-bold text-[#172B4D] leading-snug mb-4">{issue.title}</h1>
            )}

            {/* Onglets */}
            <div className="flex border-b border-[#DFE1E6] mb-4">
              {(['details', 'activity'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={['px-4 py-2 text-[13px] font-semibold capitalize border-b-2 -mb-px transition-colors',
                    activeTab === tab ? 'border-[#0052CC] text-[#0052CC]' : 'border-transparent text-[#42526E] hover:text-[#172B4D]'].join(' ')}>
                  {tab}
                </button>
              ))}
            </div>

            {activeTab === 'details' && (
              <div className="space-y-5">
                {/* Description */}
                <div>
                  <h3 className="text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Description</h3>
                  {editing ? (
                    <textarea className="w-full atl-input resize-none text-[14px] leading-relaxed min-h-[100px]"
                      value={draft.description ?? issue.description}
                      onChange={e => setField('description', e.target.value)} rows={4} />
                  ) : (
                    <p className="text-[14px] text-[#172B4D] leading-relaxed whitespace-pre-wrap">
                      {issue.description || <span className="text-[#8993A4] italic">No description provided.</span>}
                    </p>
                  )}
                </div>

                {/* Labels */}
                <div>
                  <h3 className="text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Labels</h3>
                  {editing ? (
                    <input className="atl-input text-[13px]"
                      value={(draft.labels ?? issue.labels).join(', ')}
                      onChange={e => setField('labels', e.target.value.split(',').map(l => l.trim()).filter(Boolean))}
                      placeholder="frontend, backend, bug, ..." />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {issue.labels.length > 0
                        ? issue.labels.map(l => (
                            <span key={l} className="flex items-center gap-1 text-[11px] bg-[#DEEBFF] text-[#0052CC] rounded px-2 py-0.5 font-medium">
                              <TagIcon size={9} /> {l}
                            </span>
                          ))
                        : <span className="text-[13px] text-[#8993A4] italic">No labels</span>
                      }
                    </div>
                  )}
                </div>

                {/* Epic */}
                {issue.epicKey && (
                  <div>
                    <h3 className="text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">
                      <span className="flex items-center gap-1"><Link2 size={10} /> Epic</span>
                    </h3>
                    <span className="text-[11px] font-mono bg-[#EAE6FF] text-[#6554C0] rounded px-2 py-0.5">{issue.epicKey}</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div>
                <h3 className="text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-3">
                  Comments · {issue.comments.length}
                </h3>
                <div className="flex flex-col gap-4 mb-4">
                  {issue.comments.length === 0 && (
                    <p className="text-[13px] text-[#8993A4] italic">No comments yet.</p>
                  )}
                  {issue.comments.map(c => {
                    const author = users.find(u => u.id === c.authorId);
                    const initials = author ? author.avatar : c.authorId.slice(0, 2).toUpperCase();
                    const color = author?.color ?? '#DFE1E6';
                    return (
                      <div key={c.id} className="flex gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                          style={{ background: color }}>
                          {initials}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-[13px] font-semibold text-[#172B4D]">{author?.name ?? 'Utilisateur'}</span>
                            <span className="text-[11px] text-[#8993A4]">{c.createdAt}</span>
                          </div>
                          <p className="text-[13px] text-[#172B4D] leading-relaxed bg-[#F4F5F7] rounded-lg px-3 py-2">{c.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Zone de saisie commentaire */}
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: currentUser?.color ?? '#DFE1E6' }}>
                    {currentUser?.avatar ?? '?'}
                  </div>
                  <div className="flex-1">
                    <textarea className="atl-input resize-none text-[13px]" rows={2}
                      placeholder="Add a comment… (Cmd+Enter to save)" value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submitComment(); }} />
                    {newComment.trim() && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={submitComment} className="btn-primary text-[12px] py-1">Save</button>
                        <button onClick={() => setNewComment('')} className="btn-subtle text-[12px] py-1">Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-[230px] flex-shrink-0 border-l border-[#DFE1E6] overflow-y-auto px-4 py-5 bg-[#FAFBFC]">

            <SidebarField label="Status">
              {editing ? (
                <SelectField value={(draft.status ?? issue.status) as string} onChange={v => setField('status', v as Status)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </SelectField>
              ) : <StatusBadge status={issue.status} />}
            </SidebarField>

            <SidebarField label="Assignee">
              {editing ? (
                <SelectField value={draft.assigneeId ?? issue.assigneeId ?? ''} onChange={v => setField('assigneeId', v || null)}>
                  <option value="">Non assigné</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </SelectField>
              ) : (
                <div className="flex items-center gap-2">
                  <Avatar userId={issue.assigneeId} users={users} size={20} />
                  <span className="text-[12px] text-[#172B4D]">{issue.assigneeName ?? '—'}</span>
                </div>
              )}
            </SidebarField>

            <SidebarField label="Reporter">
              <div className="flex items-center gap-2">
                <Avatar userId={issue.reporterId} users={users} size={20} />
                <span className="text-[12px] text-[#172B4D]">{issue.reporterName ?? '—'}</span>
              </div>
            </SidebarField>

            <SidebarField label="Priority">
              {editing ? (
                <SelectField value={draft.priority ?? issue.priority} onChange={v => setField('priority', v as Priority)}>
                  {(['highest', 'high', 'medium', 'low', 'lowest'] as Priority[]).map(p => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </SelectField>
              ) : (
                <div className="flex items-center gap-1.5" style={{ color: PRIORITY_CONFIG[issue.priority].text }}>
                  {PRIORITY_CONFIG[issue.priority].icon}
                  <span className="text-[12px] font-semibold">{PRIORITY_CONFIG[issue.priority].label}</span>
                </div>
              )}
            </SidebarField>

            <SidebarField label="Type">
              {editing ? (
                <SelectField value={draft.type ?? issue.type} onChange={v => setField('type', v as IssueType)}>
                  {(['task', 'story', 'bug', 'epic', 'subtask'] as IssueType[]).map(t => (
                    <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
                  ))}
                </SelectField>
              ) : <TypeBadge type={issue.type} />}
            </SidebarField>

            <SidebarField label="Story Points">
              {editing ? (
                <input type="number" min={0} max={100} className="atl-input text-[13px]"
                  value={draft.storyPoints ?? issue.storyPoints}
                  onChange={e => setField('storyPoints', Number(e.target.value))} />
              ) : (
                <span className="text-[14px] font-bold text-[#172B4D]">{issue.storyPoints} pts</span>
              )}
            </SidebarField>

            <SidebarField label="Sprint">
              {editing ? (
                <SelectField value={draft.sprintId ?? issue.sprintId ?? ''} onChange={v => setField('sprintId', v || null)}>
                  <option value="">No sprint</option>
                  {sprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </SelectField>
              ) : (
                <span className="text-[12px] text-[#172B4D]">
                  {sprints.find(s => s.id === issue.sprintId)?.name ?? <span className="text-[#8993A4] italic">No sprint</span>}
                </span>
              )}
            </SidebarField>

            <SidebarField label="Created">
              <span className="text-[12px] text-[#42526E]">{issue.createdAt}</span>
            </SidebarField>
            <SidebarField label="Updated">
              <span className="text-[12px] text-[#42526E]">{issue.updatedAt}</span>
            </SidebarField>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Create Issue Modal ───────────────────────────────────────────────────────

function CreateIssueModal({ project, sprints, users, currentUserId, defaultStatus, defaultSprintId, onClose, onCreated }: {
  project: JiraProject;
  sprints: Sprint[];
  users: JiraUser[];
  currentUserId: string;
  defaultStatus?: Status;
  defaultSprintId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle]         = useState('');
  const [type, setType]           = useState<IssueType>('task');
  const [priority, setPriority]   = useState<Priority>('medium');
  const [assigneeId, setAssignee] = useState(currentUserId);
  const [storyPoints, setPoints]  = useState(3);
  const [description, setDesc]    = useState('');
  const [labels, setLabels]       = useState('');
  const [status, setStatus]       = useState<Status>(defaultStatus ?? 'todo');
  const [sprintId, setSprintId]   = useState(defaultSprintId ?? sprints.find(s => s.active)?.id ?? '');
  const [agentId, setAgentId]     = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [autoStart, setAutoStart] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: IssueFormData & { assignedAgentId?: string; aiInstructions?: string; autoStart?: boolean }) =>
      api.issues.create(data),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate({
      projectId:   project.id,
      type, title: title.trim(), description: description.trim(),
      priority, status,
      assigneeId:  assigneeId || null,
      reporterId:  currentUserId,
      storyPoints,
      labels:      labels.split(',').map(l => l.trim()).filter(Boolean),
      sprintId:    sprintId || null,
      assignedAgentId: agentId || undefined,
      aiInstructions:  aiInstructions || undefined,
      autoStart,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 overflow-hidden"
        style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6] bg-[#FAFBFC]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-base" style={{ background: `${project.color}18` }}>
              {project.emoji}
            </div>
            <h2 className="text-[16px] font-bold text-[#172B4D]">Create Issue · <span className="text-[#0052CC]">{project.name}</span></h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Type</label>
              <div className="relative">
                <select className="atl-select pr-8 text-[13px]" value={type} onChange={e => setType(e.target.value as IssueType)}>
                  {(['task', 'story', 'bug', 'epic', 'subtask'] as IssueType[]).map(t => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#42526E] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Priority</label>
              <div className="relative">
                <select className="atl-select pr-8 text-[13px]" value={priority} onChange={e => setPriority(e.target.value as Priority)}>
                  {(['highest', 'high', 'medium', 'low', 'lowest'] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#42526E] pointer-events-none" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Summary *</label>
            <input className="atl-input text-[14px]" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Brief description of the issue" required autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Description</label>
            <textarea className="atl-input resize-none text-[14px]" rows={3} value={description}
              onChange={e => setDesc(e.target.value)} placeholder="Add more detail..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Assignee</label>
              <div className="relative">
                <select className="atl-select pr-8 text-[13px]" value={assigneeId} onChange={e => setAssignee(e.target.value)}>
                  <option value="">Non assigné</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#42526E] pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Status</label>
              <div className="relative">
                <select className="atl-select pr-8 text-[13px]" value={status} onChange={e => setStatus(e.target.value as Status)}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#42526E] pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Story Points</label>
              <input type="number" min={0} max={100} className="atl-input text-[14px]"
                value={storyPoints} onChange={e => setPoints(Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Sprint</label>
              <div className="relative">
                <select className="atl-select pr-8 text-[13px]" value={sprintId} onChange={e => setSprintId(e.target.value)}>
                  <option value="">No sprint (Backlog)</option>
                  {sprints.map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? ' (Active)' : ''}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#42526E] pointer-events-none" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Labels</label>
            <input className="atl-input text-[14px]" value={labels} onChange={e => setLabels(e.target.value)} placeholder="frontend, api, ..." />
          </div>
          {/* ── Section Agent AI ── */}
          <div className="border-t border-[#DFE1E6] pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🤖</span>
              <span className="text-[11px] font-semibold text-[#42526E] uppercase tracking-wider">Assign AI Agent (optional)</span>
            </div>
            <AgentSelector value={agentId} onChange={setAgentId} />
            {agentId && (
              <div className="mt-3 space-y-3">
                <AgentInstructionsField value={aiInstructions} onChange={setAiInstructions} />
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={e => setAutoStart(e.target.checked)}
                    className="w-4 h-4 rounded border-[#B3BAC5] text-[#0052CC] accent-[#0052CC]"
                  />
                  <span className="text-[12px] text-[#42526E]">Start agent immediately after creation</span>
                </label>
              </div>
            )}
          </div>
          {createMutation.error && (
            <p className="text-[12px] text-[#DE350B]">Erreur : {(createMutation.error as Error).message}</p>
          )}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#DFE1E6] mt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? 'Creating…' : 'Create Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sprint Modal ─────────────────────────────────────────────────────────────

function SprintModal({ projectId, initial, onSave, onClose }: {
  projectId: string;
  initial?: Sprint;
  onSave: (data: { name: string; goal: string; startDate: string; endDate: string }) => void;
  onClose: () => void;
}) {
  const [name, setName]           = useState(initial?.name ?? `Sprint ${new Date().toISOString().slice(0, 10)}`);
  const [goal, setGoal]           = useState(initial?.goal ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate]     = useState(initial?.endDate ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));

  // projectId utilisé pour le contexte (passé au parent)
  void projectId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, goal, startDate: startDate ?? '', endDate: endDate ?? '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md mx-4 overflow-hidden"
        style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6]">
          <h2 className="text-[16px] font-bold text-[#172B4D]">{initial ? 'Edit Sprint' : 'Create Sprint'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Sprint Name *</label>
            <input className="atl-input text-[14px]" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Sprint Goal</label>
            <textarea className="atl-input resize-none text-[14px]" rows={2} value={goal} onChange={e => setGoal(e.target.value)} placeholder="What does the team aim to achieve?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Start Date</label>
              <input type="date" className="atl-input text-[14px]" value={startDate ?? ''} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">End Date</label>
              <input type="date" className="atl-input text-[14px]" value={endDate ?? ''} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#DFE1E6]">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{initial ? 'Save Changes' : 'Create Sprint'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Backlog View ─────────────────────────────────────────────────────────────

function BacklogView({ project: _proj, issues, sprints, onCreateIssue, onSelectIssue, onCreateSprint, onStartSprint, onCloseSprint, onDeleteSprint }: {
  project: JiraProject;
  issues: JiraIssue[];
  sprints: Sprint[];
  onCreateIssue: (s?: Status, sprintId?: string) => void;
  onSelectIssue: (i: JiraIssue) => void;
  onCreateSprint: () => void;
  onStartSprint:  (id: string) => void;
  onCloseSprint:  (id: string) => void;
  onDeleteSprint: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const backlogIssues = issues.filter(i => !i.sprintId || !sprints.find(s => s.id === i.sprintId));
  const sprintIssues  = (sid: string) => issues.filter(i => i.sprintId === sid);

  // Ligne d'issue — utilise les données dénormalisées de l'assigné
  const IssueRow = ({ issue }: { issue: JiraIssue }) => {
    const pCfg = PRIORITY_CONFIG[issue.priority];
    const tCfg = TYPE_CONFIG[issue.type];
    return (
      <div onClick={() => onSelectIssue(issue)}
        className="flex items-center gap-3 px-3 py-2 hover:bg-[#F4F5F7] rounded cursor-pointer group transition-colors">
        <span style={{ color: tCfg.color, background: tCfg.bg }} className="rounded p-0.5 flex-shrink-0">{tCfg.icon}</span>
        <span className="text-[12px] font-mono font-semibold text-[#8993A4] flex-shrink-0 w-20">{issue.key}</span>
        <span className="flex-1 text-[13px] font-medium text-[#172B4D] truncate">{issue.title}</span>
        <div className="flex items-center gap-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {issue.labels.slice(0, 2).map(l => <span key={l} className="text-[10px] bg-[#DEEBFF] text-[#0052CC] rounded px-1.5 py-0.5">{l}</span>)}
        </div>
        <span title={pCfg.label} style={{ color: pCfg.text }} className="flex-shrink-0">{pCfg.icon}</span>
        <StatusBadge status={issue.status} />
        <AssigneeAvatar issue={issue} size={20} />
        <span className="text-[11px] font-bold text-[#42526E] bg-[#F4F5F7] rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">{issue.storyPoints}</span>
      </div>
    );
  };

  const SprintSection = ({ sprint }: { sprint: Sprint }) => {
    const sIssues    = sprintIssues(sprint.id);
    const done       = sIssues.filter(i => i.status === 'done').length;
    const pts        = sIssues.reduce((a, i) => a + i.storyPoints, 0);
    const isCollapsed = collapsed.has(sprint.id);
    const dateRange  = sprint.startDate && sprint.endDate
      ? `${sprint.startDate} → ${sprint.endDate}`
      : sprint.startDate ? `Depuis ${sprint.startDate}` : '';

    return (
      <div className="mb-4">
        <div className="flex items-center gap-3 py-2 px-1 group">
          <button onClick={() => toggle(sprint.id)} className="text-[#42526E] hover:text-[#172B4D]">
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[14px] font-bold text-[#172B4D]">{sprint.name}</span>
            {sprint.active && <span className="text-[10px] font-bold bg-[#00875A] text-white px-2 py-0.5 rounded uppercase tracking-wide">Active</span>}
            {dateRange && <span className="text-[12px] text-[#8993A4]">{dateRange}</span>}
            <span className="text-[12px] text-[#42526E] font-medium">{done}/{sIssues.length} issues · {pts} pts</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!sprint.active && sIssues.length > 0 && (
              <button onClick={() => onStartSprint(sprint.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-[#0052CC] text-white hover:bg-[#0065FF] transition-colors">
                <Play size={10} /> Start Sprint
              </button>
            )}
            {sprint.active && (
              <button onClick={() => onCloseSprint(sprint.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-[#DFE1E6] text-[#172B4D] hover:bg-[#C1C7D0] transition-colors">
                <Square size={10} /> Close Sprint
              </button>
            )}
            <button onClick={() => onCreateIssue('backlog', sprint.id)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-[#42526E] hover:bg-[#F4F5F7] transition-colors">
              <Plus size={11} /> Issue
            </button>
            <button onClick={() => onDeleteSprint(sprint.id)}
              className="p-1 rounded text-[#8993A4] hover:text-[#DE350B] hover:bg-[#FFEBE6] transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <div className="ml-8 border border-[#DFE1E6] rounded-lg overflow-hidden bg-white">
            {sIssues.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-[#8993A4]">Plan your sprint — no issues yet.</div>
            ) : sIssues.map(i => <IssueRow key={i.id} issue={i} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {sprints.map(s => <SprintSection key={s.id} sprint={s} />)}

      <button onClick={onCreateSprint}
        className="flex items-center gap-2 px-3 py-2 rounded text-[13px] font-semibold text-[#0052CC] hover:bg-[#DEEBFF] transition-colors mb-6">
        <Plus size={14} /> Create Sprint
      </button>

      <div>
        <div className="flex items-center gap-3 py-2 px-1 mb-2">
          <span className="text-[14px] font-bold text-[#172B4D]">Backlog</span>
          <span className="text-[12px] font-semibold text-[#42526E] bg-[#F4F5F7] rounded-full px-2">{backlogIssues.length}</span>
          <button onClick={() => onCreateIssue('backlog')}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-[#42526E] hover:bg-[#F4F5F7] transition-colors">
            <Plus size={11} /> Issue
          </button>
        </div>
        <div className="border border-[#DFE1E6] rounded-lg overflow-hidden bg-white">
          {backlogIssues.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[#8993A4]">No issues in the backlog.</div>
          ) : backlogIssues.map(i => <IssueRow key={i.id} issue={i} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Roadmap View ─────────────────────────────────────────────────────────────

function RoadmapView({ issues, sprints }: { issues: JiraIssue[]; sprints: Sprint[] }) {
  const epics  = issues.filter(i => i.type === 'epic');
  const today  = new Date();

  const validSprints = sprints.filter(s => s.startDate && s.endDate);
  const dates = [
    ...validSprints.flatMap(s => [new Date(s.startDate!), new Date(s.endDate!)]),
  ];
  const minDate  = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
  const maxDate  = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date(Date.now() + 30 * 86400000);
  const totalDays = Math.max(30, Math.ceil((maxDate.getTime() - minDate.getTime()) / 86400000) + 7);

  const dayWidth = 28;
  const left  = (date: Date) => Math.max(0, Math.ceil((date.getTime() - minDate.getTime()) / 86400000)) * dayWidth;
  const width = (start: Date, end: Date) => Math.max(dayWidth, Math.ceil((end.getTime() - start.getTime()) / 86400000) * dayWidth);
  const todayLeft = left(today);

  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      <div className="bg-white rounded-xl border border-[#DFE1E6] overflow-auto" style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
        <div style={{ minWidth: totalDays * dayWidth + 200 }}>
          {/* En-tête timeline */}
          <div className="flex border-b border-[#DFE1E6] sticky top-0 bg-white z-10">
            <div className="w-48 flex-shrink-0 px-3 py-2 text-[11px] font-semibold text-[#42526E] uppercase border-r border-[#DFE1E6]">Epic / Sprint</div>
            <div className="flex-1 overflow-hidden relative" style={{ height: 36 }}>
              {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, wi) => {
                const d = new Date(minDate.getTime() + wi * 7 * 86400000);
                return (
                  <div key={wi} className="absolute top-0 h-full flex items-center"
                    style={{ left: wi * 7 * dayWidth, width: 7 * dayWidth, borderRight: '1px solid #DFE1E6' }}>
                    <span className="text-[10px] font-semibold text-[#8993A4] px-2">
                      {d.toLocaleDateString('fr', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
              <div className="absolute top-0 bottom-0 w-0.5 bg-[#DE350B]/60 z-20" style={{ left: todayLeft }} />
            </div>
          </div>

          {/* Lignes sprints */}
          {validSprints.map(s => (
            <div key={s.id} className="flex border-b border-[#DFE1E6] hover:bg-[#F8F9FF]">
              <div className="w-48 flex-shrink-0 px-3 py-2 flex items-center gap-2 border-r border-[#DFE1E6]">
                <Layers size={12} className="text-[#0052CC] flex-shrink-0" />
                <span className="text-[12px] font-semibold text-[#172B4D] truncate">{s.name}</span>
                {s.active && <span className="text-[8px] font-bold bg-[#00875A] text-white px-1 py-0.5 rounded">ACT</span>}
              </div>
              <div className="flex-1 relative" style={{ height: 36 }}>
                <div className="absolute top-0 bottom-0 w-0.5 bg-[#DE350B]/30 z-10" style={{ left: todayLeft }} />
                <div className="absolute top-1 bottom-1 rounded flex items-center px-2 text-[11px] font-semibold text-white"
                  style={{ left: left(new Date(s.startDate!)), width: width(new Date(s.startDate!), new Date(s.endDate!)), background: '#0052CC', opacity: 0.85 }}>
                  <span className="truncate">{s.startDate} → {s.endDate}</span>
                </div>
              </div>
            </div>
          ))}

          {/* Lignes epics */}
          {epics.map(epic => (
            <div key={epic.id} className="flex border-b border-[#DFE1E6] hover:bg-[#F8F9FF]">
              <div className="w-48 flex-shrink-0 px-3 py-2 flex items-center gap-2 border-r border-[#DFE1E6]">
                <Zap size={12} className="text-[#6554C0] flex-shrink-0" />
                <span className="text-[12px] font-semibold text-[#172B4D] truncate">{epic.title}</span>
              </div>
              <div className="flex-1 relative" style={{ height: 36 }}>
                <div className="absolute top-0 bottom-0 w-0.5 bg-[#DE350B]/30 z-10" style={{ left: todayLeft }} />
              </div>
            </div>
          ))}

          {epics.length === 0 && validSprints.length === 0 && (
            <div className="py-16 text-center text-[#8993A4]">
              <Map size={32} className="mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-[14px] font-semibold">No roadmap data yet</p>
              <p className="text-[12px]">Create sprints and epics to see them here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Settings View ────────────────────────────────────────────────────────────

function SettingsView({ project, users, onUpdate }: { project: JiraProject; users: JiraUser[]; onUpdate: (p: Partial<JiraProject>) => void }) {
  const [name, setName]        = useState(project.name);
  const [description, setDesc] = useState(project.description);
  const [leadId, setLeadId]    = useState(project.leadId ?? '');
  const [saved, setSaved]      = useState(false);

  const handleSave = () => {
    onUpdate({ name, description, leadId: leadId || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-2xl">
        <h2 className="text-[18px] font-bold text-[#172B4D] mb-6">Project Settings</h2>

        <div className="bg-white rounded-xl border border-[#DFE1E6] p-6 space-y-5" style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Project Name</label>
            <input className="atl-input text-[14px]" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Project Key</label>
            <input className="atl-input text-[14px] font-mono bg-[#F4F5F7] cursor-not-allowed" value={project.key} disabled />
            <p className="text-[11px] text-[#8993A4] mt-1">The project key cannot be changed.</p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Description</label>
            <textarea className="atl-input resize-none text-[14px]" rows={3} value={description} onChange={e => setDesc(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Project Lead</label>
            <div className="flex flex-wrap gap-3">
              {users.map(u => (
                <button key={u.id} type="button" onClick={() => setLeadId(u.id)}
                  className={['flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-[12px] font-medium transition-all',
                    leadId === u.id ? 'border-[#0052CC] bg-[#DEEBFF] text-[#0052CC]' : 'border-[#DFE1E6] text-[#42526E] hover:border-[#B3BAC5]'].join(' ')}>
                  <Avatar userId={u.id} users={users} size={20} />
                  {u.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-2 border-t border-[#DFE1E6]">
            <button onClick={handleSave} className="btn-primary gap-1.5">
              {saved ? <><Save size={13} /> Saved!</> : <><Save size={13} /> Save Changes</>}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          {[
            { label: 'Project Type', value: project.type, icon: <TagIcon size={14} /> },
            { label: 'Created', value: project.createdAt, icon: <Calendar size={14} /> },
            { label: 'Project Key', value: project.key, icon: <User size={14} /> },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-[#DFE1E6] p-4" style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
              <div className="flex items-center gap-1.5 text-[#42526E] mb-2">{stat.icon}<span className="text-[11px] font-semibold uppercase tracking-wide">{stat.label}</span></div>
              <p className="text-[14px] font-bold text-[#172B4D] capitalize">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function VelocityBar({ issues }: { issues: JiraIssue[] }) {
  const byStatus = COLUMNS.map(col => ({
    col, count: issues.filter(i => i.status === col.id).length,
  }));
  const total = issues.length;

  return (
    <div className="flex items-center gap-2 bg-[#F4F5F7] rounded-lg px-3 py-2">
      <BarChart2 size={13} className="text-[#42526E] flex-shrink-0" />
      <div className="flex items-center gap-1">
        {byStatus.map(({ col, count }) => count > 0 && (
          <span key={col.id} title={`${col.label}: ${count}`}
            className="text-[11px] font-semibold" style={{ color: col.color }}>
            {count}
          </span>
        ))}
      </div>
      <div className="w-24 h-1.5 bg-[#DFE1E6] rounded-full overflow-hidden flex">
        {byStatus.map(({ col, count }) => count > 0 && (
          <div key={col.id} title={col.label}
            style={{ background: col.color, width: total ? `${(count / total) * 100}%` : 0 }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

interface Props {
  project: JiraProject;
  onBack: () => void;
  onUpdateProject: (p: JiraProject) => void;
}

export function JiraBoard({ project, onBack, onUpdateProject }: Props) {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [activeId, setActiveId]           = useState<string | null>(null);
  const [overColId, setOverColId]         = useState<string | null>(null);
  const [selectedIssue, setSelected]      = useState<JiraIssue | null>(null);
  const [showCreate, setShowCreate]       = useState(false);
  const [createStatus, setCreateStatus]   = useState<Status>('todo');
  const [createSprintId, setCreateSprintId] = useState<string | undefined>(undefined);
  const [search, setSearch]               = useState('');
  const [filterType, setFilterType]       = useState<IssueType | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<string | 'all'>('all');
  const [activeView, setActiveView]       = useState<JiraBoardView>('board');
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [swimlaneMode, setSwimlaneMode]   = useState(false);
  const [aiPanelIssue, setAiPanelIssue]  = useState<JiraIssue | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: issues = [] } = useQuery({
    queryKey: ['issues', project.id],
    queryFn:  () => api.projects.issues(project.id),
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints', project.id],
    queryFn:  () => api.projects.sprints(project.id),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  api.users.list,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn:  () => api.agents.list(),
    refetchInterval: 10000,
  });

  const { data: globalQueue = [] } = useQuery({
    queryKey: ['global-queue'],
    queryFn:  () => api.agents.globalQueue(),
    refetchInterval: 5000,
  });

  // Build lookup maps for fast access in IssueCard
  const agentMap = React.useMemo(() =>
    Object.fromEntries((agents as AIAgent[]).map(a => [a.id, a])),
    [agents]
  );

  const taskByIssue = React.useMemo(() =>
    Object.fromEntries(
      (globalQueue as AITaskQueue[])
        .filter(t => t.status === 'running' || t.status === 'pending' || t.status === 'paused')
        .map(t => [t.issueId, t])
    ),
    [globalQueue]
  );

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidateIssues  = () => queryClient.invalidateQueries({ queryKey: ['issues', project.id] });
  const invalidateSprints = () => queryClient.invalidateQueries({ queryKey: ['sprints', project.id] });

  const updateIssueMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IssueFormData> }) => api.issues.update(id, data),
    onSuccess:  () => { invalidateIssues(); setSelected(null); },
  });

  const deleteIssueMutation = useMutation({
    mutationFn: (id: string) => api.issues.delete(id),
    onSuccess:  () => { invalidateIssues(); setSelected(null); },
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ issueId, body }: { issueId: string; body: string }) => api.issues.comment(issueId, { body }),
    onSuccess:  () => invalidateIssues(),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: ReorderItem[]) => api.issues.reorder(items),
    onError:    () => invalidateIssues(), // Revert optimiste en cas d'erreur
  });

  const updateProjectMutation = useMutation({
    mutationFn: (data: Partial<JiraProject>) => api.projects.update(project.id, data),
    onSuccess:  (updated) => onUpdateProject(updated),
  });

  const createSprintMutation = useMutation({
    mutationFn: (data: { name: string; goal: string; startDate: string; endDate: string }) =>
      api.sprints.create({ projectId: project.id, ...data }),
    onSuccess: () => invalidateSprints(),
  });

  const startSprintMutation = useMutation({
    mutationFn: (id: string) => api.sprints.start(id),
    onSuccess:  () => invalidateSprints(),
  });

  const closeSprintMutation = useMutation({
    mutationFn: (id: string) => api.sprints.close(id),
    onSuccess:  () => { invalidateSprints(); invalidateIssues(); },
  });

  const deleteSprintMutation = useMutation({
    mutationFn: (id: string) => api.sprints.delete(id),
    onSuccess:  () => invalidateSprints(),
  });

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const sensors    = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const activeIssue = issues.find(i => i.id === activeId) ?? null;

  const projectIssues = issues.filter(i => i.projectId === project.id);
  const activeSprint  = sprints.find(s => s.active) ?? sprints[0] ?? null;

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(active.id as string);

  const handleDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over) { setOverColId(null); return; }
    const overId    = over.id as string;
    const isCol     = COLUMNS.some(c => c.id === overId);
    const overIssue = projectIssues.find(i => i.id === overId);
    const targetCol = isCol ? overId : overIssue?.status ?? null;
    setOverColId(targetCol);
    const activeItem = projectIssues.find(i => i.id === active.id);
    if (!activeItem || !targetCol || activeItem.status === targetCol) return;

    // Mise à jour optimiste du cache react-query
    queryClient.setQueryData<JiraIssue[]>(['issues', project.id], prev =>
      (prev ?? []).map(i => i.id === active.id ? { ...i, status: targetCol as Status } : i)
    );
  }, [projectIssues, project.id, queryClient]);

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveId(null); setOverColId(null);
    if (!over) return;

    const overIssue = projectIssues.find(i => i.id === over.id);
    if (overIssue && active.id !== over.id) {
      // Réordonnement dans le cache
      queryClient.setQueryData<JiraIssue[]>(['issues', project.id], prev => {
        if (!prev) return prev;
        const oldIdx = prev.findIndex(i => i.id === active.id);
        const newIdx = prev.findIndex(i => i.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return prev;
        return arrayMove(prev, oldIdx, newIdx);
      });
    }

    // Persistance en base de données
    const updatedIssues = queryClient.getQueryData<JiraIssue[]>(['issues', project.id]) ?? [];
    const reorderItems: ReorderItem[] = updatedIssues.map((issue, idx) => ({
      id:         issue.id,
      boardOrder: idx,
      status:     issue.status,
    }));
    reorderMutation.mutate(reorderItems);
  }, [projectIssues, project.id, queryClient, reorderMutation]);

  // ── Filtres ────────────────────────────────────────────────────────────────

  const filteredIssues = projectIssues.filter(issue => {
    if (search && !issue.title.toLowerCase().includes(search.toLowerCase()) && !issue.key.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== 'all' && issue.type !== filterType) return false;
    if (filterAssignee !== 'all' && issue.assigneeId !== filterAssignee) return false;
    return true;
  });

  const boardIssues = filteredIssues.filter(i =>
    i.sprintId ? i.sprintId === activeSprint?.id : i.status !== 'backlog'
  );

  const total = projectIssues.length;

  const VIEWS: { id: JiraBoardView; label: string; icon: React.ReactNode }[] = [
    { id: 'board',    label: 'Board',    icon: <Layout size={14} /> },
    { id: 'backlog',  label: 'Backlog',  icon: <List size={14} /> },
    { id: 'roadmap',  label: 'Roadmap',  icon: <Map size={14} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
  ];

  const handleCreateIssue = (status?: Status, sid?: string) => {
    setCreateStatus(status ?? 'todo');
    setCreateSprintId(sid);
    setShowCreate(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* En-tête projet */}
      <div className="flex-shrink-0 bg-white border-b border-[#DFE1E6] px-6 py-3">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-4">
            <button onClick={onBack}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-[#42526E] hover:text-[#172B4D] hover:bg-[#F4F5F7] px-2.5 py-1.5 rounded transition-colors">
              <ArrowLeft size={14} /> Projects
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xl flex-shrink-0" style={{ background: `${project.color}18` }}>
                {project.emoji}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-[#172B4D]">{project.name}</h2>
                  <span className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded" style={{ background: `${project.color}18`, color: project.color }}>{project.key}</span>
                </div>
                {activeSprint && activeView === 'board' && (
                  <p className="text-[11px] text-[#42526E]">
                    {activeSprint.name}
                    {activeSprint.startDate && activeSprint.endDate && ` · ${activeSprint.startDate} → ${activeSprint.endDate}`}
                    {activeSprint.goal && ` · ${activeSprint.goal}`}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <VelocityBar issues={projectIssues} />
            <button onClick={() => setShowAnalytics(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold text-[#42526E] hover:bg-[#F4F5F7] border border-[#DFE1E6] transition-colors">
              <BarChart2 size={13} /> Analytics
            </button>
            <button onClick={() => setSwimlaneMode(m => !m)}
              className={['flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold border transition-colors',
                swimlaneMode ? 'bg-[#DEEBFF] text-[#0052CC] border-[#0052CC]' : 'text-[#42526E] hover:bg-[#F4F5F7] border-[#DFE1E6]'].join(' ')}>
              <Users size={13} /> Swimlanes
            </button>
            {/* Avatars de l'équipe */}
            <div className="flex items-center -space-x-1.5">
              {users.map(u => (
                <div key={u.id} title={u.name}
                  style={{ width: 28, height: 28, background: u.color, fontSize: 10 }}
                  className="rounded-full flex items-center justify-center text-white font-semibold border-2 border-white uppercase cursor-pointer">
                  {u.avatar}
                </div>
              ))}
            </div>
            <button onClick={() => handleCreateIssue()} className="btn-primary gap-1.5">
              <Plus size={14} strokeWidth={2.5} /> Create
            </button>
          </div>
        </div>

        {/* Sélecteur de vue + filtres */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => setActiveView(v.id)}
                className={['flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-semibold transition-colors',
                  activeView === v.id ? 'bg-[#DEEBFF] text-[#0052CC]' : 'text-[#42526E] hover:bg-[#F4F5F7]'].join(' ')}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          {(activeView === 'board' || activeView === 'backlog') && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8993A4]" />
                <input className="atl-input text-[12px] pl-8 h-7 w-40" placeholder="Search issues…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {/* Filtre par assigné */}
              <div className="flex items-center gap-1">
                {users.map(u => (
                  <button key={u.id} title={u.name}
                    onClick={() => setFilterAssignee(filterAssignee === u.id ? 'all' : u.id)}
                    style={{ width: 24, height: 24, background: u.color, fontSize: 9,
                      opacity: filterAssignee !== 'all' && filterAssignee !== u.id ? 0.3 : 1,
                      outline: filterAssignee === u.id ? `2px solid ${u.color}` : 'none', outlineOffset: 2 }}
                    className="rounded-full flex items-center justify-center text-white font-semibold uppercase transition-opacity">
                    {u.avatar}
                  </button>
                ))}
              </div>
              {/* Filtre par type */}
              <div className="flex items-center gap-0.5">
                {(['all', 'bug', 'story', 'task', 'epic'] as const).map(t => (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={['px-2 py-1 rounded text-[11px] font-semibold transition-colors',
                      filterType === t ? 'bg-[#DEEBFF] text-[#0052CC]' : 'text-[#42526E] hover:bg-[#F4F5F7]'].join(' ')}>
                    {t === 'all' ? 'All' : TYPE_CONFIG[t].label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-[#8993A4]">
                <Filter size={11} /><span>{filteredIssues.length}/{total}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Vue Board ──────────────────────────────────────────────────────── */}
      {activeView === 'board' && !swimlaneMode && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full px-6 py-5">
              {COLUMNS.map(col => (
                <Column key={col.id} col={col}
                  issues={boardIssues.filter(i => i.status === col.id)}
                  onCardClick={setSelected}
                  isDraggingOver={overColId === col.id}
                  agentMap={agentMap}
                  taskByIssue={taskByIssue}
                  onOpenAIPanel={setAiPanelIssue} />
              ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
              {activeIssue && <IssueCard issue={activeIssue} onClick={() => {}} overlay />}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* ── Vue Swimlanes ───────────────────────────────────────────────────── */}
      {activeView === 'board' && swimlaneMode && (
        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="min-w-max">
            {/* En-tête colonnes */}
            <div className="flex items-center gap-4 mb-3 pl-36">
              {COLUMNS.map(col => (
                <div key={col.id} className="w-[272px] flex items-center gap-2 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-[12px] font-semibold text-[#172B4D] uppercase tracking-wide">{col.label}</span>
                  <span className="text-[10px] font-bold bg-[#F4F5F7] text-[#42526E] rounded-full px-1.5">
                    {boardIssues.filter(i => i.status === col.id).length}
                  </span>
                </div>
              ))}
            </div>
            {/* Lignes par assigné */}
            {users.map(user => {
              const userIssues = boardIssues.filter(i => i.assigneeId === user.id);
              if (userIssues.length === 0) return null;
              return (
                <div key={user.id} className="flex items-start gap-4 mb-4">
                  <div className="w-32 flex-shrink-0 flex items-center gap-2 pt-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: user.color }}>{user.avatar}</div>
                    <span className="text-[12px] font-semibold text-[#42526E] truncate">{user.name.split(' ')[0]}</span>
                  </div>
                  {COLUMNS.map(col => {
                    const colIssues = userIssues.filter(i => i.status === col.id);
                    return (
                      <div key={col.id} className="w-[272px] flex-shrink-0 bg-[#F4F5F7] rounded-lg min-h-[80px] p-2 flex flex-col gap-2">
                        {colIssues.length === 0 ? (
                          <div className="flex items-center justify-center h-12 text-[#C1C7D0]">
                            <Flag size={14} strokeWidth={1.5} />
                          </div>
                        ) : colIssues.map(issue => (
                          <div key={issue.id} onClick={() => setSelected(issue)} className="issue-card cursor-pointer">
                            <p className="text-[12px] font-semibold text-[#172B4D] leading-snug mb-1 line-clamp-2">{issue.title}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-semibold text-[#8993A4]">{issue.key}</span>
                              <span className="text-[10px] font-bold bg-[#F4F5F7] text-[#42526E] rounded-full w-5 h-5 flex items-center justify-center">{issue.storyPoints}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {/* Ligne non assigné */}
            {(() => {
              const userIds    = new Set(users.map(u => u.id));
              const unassigned = boardIssues.filter(i => !i.assigneeId || !userIds.has(i.assigneeId));
              if (unassigned.length === 0) return null;
              return (
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-32 flex-shrink-0 flex items-center gap-2 pt-2">
                    <div className="w-7 h-7 rounded-full bg-[#DFE1E6] flex items-center justify-center flex-shrink-0">
                      <User size={14} className="text-[#8993A4]" />
                    </div>
                    <span className="text-[12px] font-semibold text-[#42526E]">None</span>
                  </div>
                  {COLUMNS.map(col => {
                    const colIssues = unassigned.filter(i => i.status === col.id);
                    return (
                      <div key={col.id} className="w-[272px] flex-shrink-0 bg-[#F4F5F7] rounded-lg min-h-[80px] p-2 flex flex-col gap-2">
                        {colIssues.length === 0 ? (
                          <div className="flex items-center justify-center h-12 text-[#C1C7D0]">
                            <Flag size={14} strokeWidth={1.5} />
                          </div>
                        ) : colIssues.map(issue => (
                          <div key={issue.id} onClick={() => setSelected(issue)} className="issue-card cursor-pointer">
                            <p className="text-[12px] font-semibold text-[#172B4D] leading-snug mb-1 line-clamp-2">{issue.title}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-semibold text-[#8993A4]">{issue.key}</span>
                              <span className="text-[10px] font-bold bg-[#F4F5F7] text-[#42526E] rounded-full w-5 h-5 flex items-center justify-center">{issue.storyPoints}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Vue Backlog ─────────────────────────────────────────────────────── */}
      {activeView === 'backlog' && (
        <BacklogView
          project={project}
          issues={filteredIssues}
          sprints={sprints}
          onCreateIssue={handleCreateIssue}
          onSelectIssue={setSelected}
          onCreateSprint={() => setShowSprintModal(true)}
          onStartSprint={id => startSprintMutation.mutate(id)}
          onCloseSprint={id => closeSprintMutation.mutate(id)}
          onDeleteSprint={id => deleteSprintMutation.mutate(id)}
        />
      )}

      {/* ── Vue Roadmap ─────────────────────────────────────────────────────── */}
      {activeView === 'roadmap' && (
        <RoadmapView issues={filteredIssues} sprints={sprints} />
      )}

      {/* ── Vue Settings ────────────────────────────────────────────────────── */}
      {activeView === 'settings' && (
        <SettingsView
          project={project}
          users={users}
          onUpdate={data => updateProjectMutation.mutate(data)}
        />
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {selectedIssue && (
        <IssueDetail
          issue={selectedIssue}
          project={project}
          sprints={sprints}
          users={users}
          onClose={() => setSelected(null)}
          onUpdate={data => updateIssueMutation.mutate({ id: selectedIssue.id, data })}
          onDelete={() => deleteIssueMutation.mutate(selectedIssue.id)}
          onAddComment={body => addCommentMutation.mutate({ issueId: selectedIssue.id, body })}
        />
      )}

      {showCreate && currentUser && (
        <CreateIssueModal
          project={project}
          sprints={sprints}
          users={users}
          currentUserId={currentUser.id}
          defaultStatus={createStatus}
          defaultSprintId={createSprintId}
          onClose={() => setShowCreate(false)}
          onCreated={invalidateIssues}
        />
      )}

      {showSprintModal && (
        <SprintModal
          projectId={project.id}
          onSave={data => createSprintMutation.mutate(data)}
          onClose={() => setShowSprintModal(false)}
        />
      )}

      {showAnalytics && (
        <SprintAnalytics
          issues={projectIssues}
          sprints={sprints}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {/* ── AI Task Panel ────────────────────────────────────────────────── */}
      {aiPanelIssue && (() => {
        const panelAgent = aiPanelIssue.assignedAgentId ? agentMap[aiPanelIssue.assignedAgentId] : null;
        const panelTask  = taskByIssue[aiPanelIssue.id];
        if (!panelAgent || !panelTask) return null;
        return (
          <div className="fixed bottom-4 right-4 z-50 w-[420px]">
            <AgentTaskPanel
              issueId={aiPanelIssue.id}
              issueKey={aiPanelIssue.key}
              issueTitle={aiPanelIssue.title}
              agent={panelAgent}
              task={panelTask}
              onClose={() => setAiPanelIssue(null)}
            />
          </div>
        );
      })()}

      {/* Indicateur de synchronisation drag & drop */}
      {reorderMutation.isPending && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-white border border-[#DFE1E6] rounded-lg px-3 py-2 shadow-lg text-[12px] text-[#42526E]">
          <Clock size={12} className="animate-spin" /> Saving order…
        </div>
      )}
    </div>
  );
}
