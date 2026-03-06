import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, MoreHorizontal, Trash2, Edit2, ArrowRight,
  AlertCircle, CheckCircle, Clock, Layers, Filter,
} from 'lucide-react';
import { JiraProject, JiraIssue, JiraUser, ProjectType } from '../types';
import { api } from '../api/client';

interface Props {
  projects: JiraProject[];
  issues: JiraIssue[];
  onSelectProject: (p: JiraProject) => void;
  onCreateProject: (p: JiraProject) => void;
  onUpdateProject: (p: JiraProject) => void;
  onDeleteProject:  (id: string) => void;
}

const PROJECT_TYPES: { id: ProjectType; label: string; desc: string; emoji: string }[] = [
  { id: 'software', label: 'Software',  desc: 'Scrum or Kanban for software teams',  emoji: '💻' },
  { id: 'business', label: 'Business',  desc: 'Track business process work',         emoji: '📊' },
  { id: 'service',  label: 'Service',   desc: 'IT service & support workflows',      emoji: '🎧' },
];

const PRESET_COLORS = [
  '#0052CC','#6554C0','#00875A','#DE350B','#FF8B00',
  '#0747A6','#403294','#006644','#BF2600','#00B8D9',
];
const PRESET_EMOJIS = ['🚀','💡','🔬','🌐','🛠️','📦','🎯','⚡','🧩','🏗️','📈','🔒'];

function Avatar({ user, size = 24 }: { user: JiraUser | undefined; size?: number }) {
  if (!user) return null;
  return (
    <div title={user.name}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.38 }}
      className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 uppercase">
      {user.avatar}
    </div>
  );
}

interface ProjectFormData {
  name: string;
  key: string;
  description: string;
  type: ProjectType;
  color: string;
  emoji: string;
  leadId: string | null;
}

function ProjectFormModal({ initial, users, onSave, onClose }: {
  initial?: JiraProject;
  users: JiraUser[];
  onSave: (data: ProjectFormData) => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState(initial?.name ?? '');
  const [key, setKey]           = useState(initial?.key ?? '');
  const [desc, setDesc]         = useState(initial?.description ?? '');
  const [type, setType]         = useState<ProjectType>(initial?.type ?? 'software');
  const [color, setColor]       = useState(initial?.color ?? PRESET_COLORS[0]);
  const [emoji, setEmoji]       = useState(initial?.emoji ?? PRESET_EMOJIS[0]);
  const [leadId, setLeadId]     = useState<string | null>(initial?.leadId ?? users[0]?.id ?? null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors]     = useState<Record<string, string>>({});

  const autoKey = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || '';

  const handleNameChange = (n: string) => {
    setName(n);
    if (!keyTouched && !initial) setKey(autoKey(n));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!key.trim())  errs.key  = 'Key is required';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({
      name:        name.trim(),
      key:         key.trim().toUpperCase(),
      description: desc.trim(),
      type, color, emoji,
      leadId:      leadId || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl mx-4 overflow-hidden"
        style={{ boxShadow: '0 24px 64px rgba(9,30,66,.32)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#DFE1E6]">
          <h2 className="text-[18px] font-bold text-[#172B4D]">{initial ? 'Edit Project' : 'Create Project'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* Project Type */}
          {!initial && (
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Project Type</label>
              <div className="grid grid-cols-3 gap-2">
                {PROJECT_TYPES.map(pt => (
                  <button key={pt.id} type="button" onClick={() => setType(pt.id)}
                    className={['flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all',
                      type === pt.id ? 'border-[#0052CC] bg-[#DEEBFF]' : 'border-[#DFE1E6] hover:border-[#B3BAC5]'].join(' ')}>
                    <span className="text-2xl">{pt.emoji}</span>
                    <span className="text-[12px] font-bold text-[#172B4D]">{pt.label}</span>
                    <span className="text-[10px] text-[#8993A4] leading-snug">{pt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Emoji + Color row */}
          <div className="flex gap-5">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setEmoji(e)}
                    className={['w-9 h-9 rounded-lg text-xl flex items-center justify-center border-2 transition-all',
                      emoji === e ? 'border-[#0052CC] bg-[#DEEBFF]' : 'border-transparent hover:border-[#DFE1E6]'].join(' ')}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Color</label>
              <div className="grid grid-cols-5 gap-1.5">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    style={{ background: c }}
                    className={['w-7 h-7 rounded-full border-2 transition-all', color === c ? 'border-[#172B4D] scale-110' : 'border-transparent hover:scale-105'].join(' ')} />
                ))}
              </div>
            </div>
          </div>

          {/* Preview badge */}
          <div className="flex items-center gap-3 p-3 bg-[#F4F5F7] rounded-xl">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white flex-shrink-0" style={{ background: color }}>{emoji}</div>
            <div>
              <div className="text-[15px] font-bold text-[#172B4D]">{name || 'Project Name'}</div>
              <div className="text-[11px] font-bold text-[#8993A4] font-mono uppercase">{key || 'KEY'}</div>
            </div>
          </div>

          {/* Name + Key */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Project Name *</label>
              <input className={`atl-input text-[14px] ${errors.name ? 'border-[#DE350B]' : ''}`}
                value={name} onChange={e => handleNameChange(e.target.value)} placeholder="My Project" autoFocus />
              {errors.name && <p className="text-[11px] text-[#DE350B] mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Project Key *</label>
              <input className={`atl-input text-[14px] font-mono uppercase ${errors.key ? 'border-[#DE350B]' : ''} ${initial ? 'bg-[#F4F5F7] cursor-not-allowed' : ''}`}
                value={key}
                onChange={e => { if (!initial) { setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setKeyTouched(true); } }}
                placeholder="MYPROJ"
                disabled={!!initial} />
              {errors.key && <p className="text-[11px] text-[#DE350B] mt-1">{errors.key}</p>}
              {initial && <p className="text-[10px] text-[#8993A4] mt-1">Key cannot be changed</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Description</label>
            <textarea className="atl-input resize-none text-[14px]" rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this project about?" />
          </div>

          {/* Lead */}
          {users.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Project Lead</label>
              <div className="flex flex-wrap gap-2">
                {users.map(u => (
                  <button key={u.id} type="button" onClick={() => setLeadId(u.id)}
                    className={['flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-[12px] font-medium transition-all',
                      leadId === u.id ? 'border-[#0052CC] bg-[#DEEBFF] text-[#0052CC]' : 'border-[#DFE1E6] text-[#42526E] hover:border-[#B3BAC5]'].join(' ')}>
                    <Avatar user={u} size={20} />
                    {u.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{initial ? 'Save Changes' : 'Create Project'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProjectsPage({ projects, issues, onSelectProject, onCreateProject, onUpdateProject, onDeleteProject }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<ProjectType | 'all'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<JiraProject | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [menuOpen, setMenuOpen]     = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: ProjectFormData) => api.projects.create({ key: data.key, name: data.name, ...data }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onCreateProject(project);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectFormData }) => api.projects.update(id, data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onUpdateProject(project);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: (_v, id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onDeleteProject(id);
    },
  });

  const filtered = projects.filter(p => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSave = (data: ProjectFormData) => {
    if (editProject) {
      updateMutation.mutate({ id: editProject.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F5F7]" onClick={() => setMenuOpen(null)}>
      {/* Header */}
      <div className="bg-white border-b border-[#DFE1E6] px-8 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold text-[#172B4D]">Projects</h1>
            <p className="text-[13px] text-[#42526E] mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary gap-2 flex-shrink-0">
            <Plus size={14} strokeWidth={2.5} /> Create Project
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8993A4]" />
            <input className="atl-input pl-9 text-[13px] h-9" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1 bg-white border border-[#DFE1E6] rounded-lg p-1">
            <Filter size={12} className="text-[#8993A4] ml-1" />
            {(['all', 'software', 'business', 'service'] as const).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={['px-3 py-1 rounded text-[12px] font-semibold capitalize transition-colors',
                  typeFilter === t ? 'bg-[#DEEBFF] text-[#0052CC]' : 'text-[#42526E] hover:bg-[#F4F5F7]'].join(' ')}>
                {t === 'all' ? 'All Types' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Project Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#DEEBFF] flex items-center justify-center mb-4">
              <Layers size={36} className="text-[#0052CC]" />
            </div>
            <h3 className="text-[18px] font-bold text-[#172B4D] mb-2">
              {search || typeFilter !== 'all' ? 'No projects match your filters' : 'No projects yet'}
            </h3>
            <p className="text-[14px] text-[#42526E] mb-6 max-w-xs">
              {search || typeFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Create your first project to start tracking work.'}
            </p>
            {!search && typeFilter === 'all' && (
              <button onClick={() => setShowCreate(true)} className="btn-primary gap-2"><Plus size={14} /> Create First Project</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(project => {
              const projIssues = issues.filter(i => i.projectId === project.id);
              const doneCount   = projIssues.filter(i => i.status === 'done').length;
              const inProgress  = projIssues.filter(i => i.status === 'in-progress').length;
              const pct         = projIssues.length > 0 ? Math.round((doneCount / projIssues.length) * 100) : 0;
              const lead        = users.find(u => u.id === project.leadId);

              return (
                <div key={project.id} className="bg-white rounded-xl border border-[#DFE1E6] overflow-hidden hover:shadow-md hover:border-[#0052CC] transition-all group"
                  style={{ boxShadow: '0 1px 3px rgba(9,30,66,.08)' }}>
                  {/* Color bar */}
                  <div className="h-1.5 w-full" style={{ background: project.color }} />

                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <button onClick={() => onSelectProject(project)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                          style={{ background: `${project.color}18` }}>
                          {project.emoji}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-bold text-[#172B4D] group-hover:text-[#0052CC] transition-colors truncate">{project.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                              style={{ background: `${project.color}18`, color: project.color }}>{project.key}</span>
                            <span className="text-[11px] text-[#8993A4] capitalize">{project.type}</span>
                          </div>
                        </div>
                      </button>

                      {/* Menu */}
                      <div className="relative flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)}
                          className="w-7 h-7 rounded flex items-center justify-center text-[#8993A4] hover:bg-[#F4F5F7] transition-colors">
                          <MoreHorizontal size={14} />
                        </button>
                        {menuOpen === project.id && (
                          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-[#DFE1E6] z-20 overflow-hidden"
                            style={{ boxShadow: '0 8px 24px rgba(9,30,66,.16)', minWidth: 160 }}>
                            <button onClick={() => { setEditProject(project); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#172B4D] hover:bg-[#F4F5F7] transition-colors">
                              <Edit2 size={13} /> Edit Project
                            </button>
                            <button onClick={() => { setDeleteConfirm(project.id); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#DE350B] hover:bg-[#FFEBE6] transition-colors">
                              <Trash2 size={13} /> Delete Project
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {project.description && (
                      <p className="text-[12px] text-[#42526E] mb-4 line-clamp-2 leading-relaxed">{project.description}</p>
                    )}

                    {/* Progress */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-[#42526E]">{projIssues.length} issues</span>
                        <span className="text-[11px] font-bold text-[#172B4D]">{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#DFE1E6] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: project.color }} />
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-3 text-[11px] mb-4">
                      {doneCount > 0 && (
                        <span className="flex items-center gap-1 text-[#00875A] font-semibold">
                          <CheckCircle size={11} /> {doneCount} done
                        </span>
                      )}
                      {inProgress > 0 && (
                        <span className="flex items-center gap-1 text-[#0052CC] font-semibold">
                          <Clock size={11} /> {inProgress} in progress
                        </span>
                      )}
                      {projIssues.length === 0 && (
                        <span className="text-[#8993A4]">No issues yet</span>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#F4F5F7]">
                      {(lead || project.leadName) && (
                        <div className="flex items-center gap-1.5">
                          {lead
                            ? <Avatar user={lead} size={20} />
                            : <div className="w-5 h-5 rounded-full bg-[#DFE1E6] flex items-center justify-center text-[8px] font-bold text-[#42526E]">
                                {project.leadName?.slice(0, 2).toUpperCase()}
                              </div>
                          }
                          <span className="text-[11px] text-[#42526E]">
                            {(lead?.name ?? project.leadName ?? '').split(' ')[0]}
                          </span>
                        </div>
                      )}
                      <button onClick={() => onSelectProject(project)}
                        className="flex items-center gap-1 text-[12px] font-semibold text-[#0052CC] hover:underline">
                        Open Board <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Create project tile */}
            <button onClick={() => setShowCreate(true)}
              className="bg-white rounded-xl border-2 border-dashed border-[#DFE1E6] p-5 flex flex-col items-center justify-center gap-3 text-[#8993A4] hover:border-[#0052CC] hover:text-[#0052CC] hover:bg-[#F4F8FF] transition-all min-h-[200px]">
              <div className="w-12 h-12 rounded-xl border-2 border-current flex items-center justify-center">
                <Plus size={22} />
              </div>
              <span className="text-[14px] font-semibold">New Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {(showCreate || editProject) && (
        <ProjectFormModal
          initial={editProject ?? undefined}
          users={users}
          onSave={handleSave}
          onClose={() => { setShowCreate(false); setEditProject(null); }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm mx-4 p-6 text-center" style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }}>
            <div className="w-14 h-14 rounded-full bg-[#FFEBE6] flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={24} className="text-[#DE350B]" />
            </div>
            <h3 className="text-[16px] font-bold text-[#172B4D] mb-2">Delete Project?</h3>
            <p className="text-[13px] text-[#42526E] mb-6">This will permanently delete the project and all its issues. This action cannot be undone.</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => { deleteMutation.mutate(deleteConfirm!); setDeleteConfirm(null); }}
                className="px-4 py-2 rounded text-[13px] font-semibold bg-[#DE350B] text-white hover:bg-[#BF2600] transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
