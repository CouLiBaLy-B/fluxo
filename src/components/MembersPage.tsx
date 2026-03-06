import React, { useState } from 'react';
import { Users, Mail, Shield, ChevronDown, X, Plus, Search, MoreHorizontal } from 'lucide-react';
import { JiraUser } from '../types';

interface Props {
  users: JiraUser[];
  onAddUser: (u: JiraUser) => void;
  onUpdateUser: (u: JiraUser) => void;
}

type Role = 'Admin' | 'Member' | 'Viewer';

const ROLE_CONFIG: Record<Role, { color: string; bg: string; desc: string }> = {
  Admin:  { color: '#6554C0', bg: '#EAE6FF', desc: 'Full access, can manage members & settings' },
  Member: { color: '#0052CC', bg: '#DEEBFF', desc: 'Can create and edit issues & pages' },
  Viewer: { color: '#42526E', bg: '#F4F5F7', desc: 'Read-only access to all content' },
};

const AVATAR_COLORS = [
  '#6554C0', '#0052CC', '#00875A', '#DE350B', '#FF8B00',
  '#0747A6', '#403294', '#006644', '#BF2600', '#FF5630',
];

function InviteModal({ onInvite, onClose, existingEmails }: {
  onInvite: (u: JiraUser) => void;
  onClose: () => void;
  existingEmails: string[];
}) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState<Role>('Member');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return; }
    if (existingEmails.includes(email.toLowerCase())) { setError('This email is already a member'); return; }
    const avatar = name.trim().split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const color  = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    onInvite({ id: `u${Date.now()}`, name: name.trim(), avatar, color, email: email.toLowerCase() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-md mx-4 overflow-hidden"
        style={{ boxShadow: '0 20px 60px rgba(9,30,66,.32)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#DFE1E6]">
          <h2 className="text-[16px] font-bold text-[#172B4D]">Invite Member</h2>
          <button onClick={onClose} className="w-8 h-8 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7]"><X size={15} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 flex flex-col gap-4">
          {error && <div className="text-[12px] text-[#DE350B] bg-[#FFEBE6] rounded px-3 py-2">{error}</div>}
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Full Name *</label>
            <input className="atl-input text-[14px]" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-1.5">Email *</label>
            <input type="email" className="atl-input text-[14px]" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#42526E] uppercase tracking-wider mb-2">Role</label>
            <div className="flex flex-col gap-2">
              {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG[Role]][]).map(([r, cfg]) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={['flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all',
                    role === r ? 'border-[#0052CC] bg-[#F8FAFF]' : 'border-[#DFE1E6] hover:border-[#B3BAC5]'].join(' ')}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: role === r ? cfg.color : '#DFE1E6' }} />
                  <div>
                    <div className="text-[13px] font-semibold text-[#172B4D]">{r}</div>
                    <div className="text-[11px] text-[#8993A4]">{cfg.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#DFE1E6]">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Send Invite</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MembersPage({ users, onAddUser, onUpdateUser: _onUpdateUser }: Props) {
  const [search, setSearch]     = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const roles: Record<string, Role> = {};
  users.forEach((u, i) => { roles[u.id] = i === 0 ? 'Admin' : 'Member'; });

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F5F7]">
      {/* Header */}
      <div className="bg-white border-b border-[#DFE1E6] px-8 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-bold text-[#172B4D] mb-1">Team Members</h1>
            <p className="text-[14px] text-[#42526E]">{users.length} member{users.length !== 1 ? 's' : ''} · Manage access and roles</p>
          </div>
          <button onClick={() => setShowInvite(true)} className="btn-primary gap-2 flex-shrink-0">
            <Plus size={14} /> Invite Member
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Members', value: users.length, color: '#0052CC', bg: '#DEEBFF', icon: <Users size={16} /> },
            { label: 'Admins', value: 1, color: '#6554C0', bg: '#EAE6FF', icon: <Shield size={16} /> },
            { label: 'Active Today', value: users.length, color: '#00875A', bg: '#E3FCEF', icon: <Users size={16} /> },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-[#DFE1E6] p-4 flex items-center gap-4" style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: stat.bg, color: stat.color }}>{stat.icon}</div>
              <div>
                <div className="text-[22px] font-bold text-[#172B4D]">{stat.value}</div>
                <div className="text-[11px] text-[#8993A4] font-medium">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8993A4]" />
            <input className="atl-input pl-9 text-[13px] h-9" placeholder="Search members..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Members table */}
        <div className="bg-white rounded-xl border border-[#DFE1E6] overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_120px_80px] gap-4 px-5 py-3 border-b border-[#DFE1E6] bg-[#FAFBFC]">
            <span className="text-[11px] font-bold text-[#8993A4] uppercase tracking-wider">Member</span>
            <span className="text-[11px] font-bold text-[#8993A4] uppercase tracking-wider">Email</span>
            <span className="text-[11px] font-bold text-[#8993A4] uppercase tracking-wider">Role</span>
            <span className="text-[11px] font-bold text-[#8993A4] uppercase tracking-wider">Actions</span>
          </div>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-[#8993A4]">
              <Users size={28} strokeWidth={1.5} className="mx-auto mb-2" />
              <p className="text-[13px]">No members found</p>
            </div>
          )}

          {filtered.map((user, idx) => {
            const role: Role = idx === 0 ? 'Admin' : 'Member';
            const roleCfg = ROLE_CONFIG[role];
            return (
              <div key={user.id} className="grid grid-cols-[1fr_1fr_120px_80px] gap-4 items-center px-5 py-3.5 border-b border-[#F4F5F7] hover:bg-[#FAFBFC] transition-colors last:border-0">
                {/* Member */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    style={{ width: 36, height: 36, background: user.color, fontSize: 13 }}
                    className="rounded-full flex items-center justify-center text-white font-bold uppercase flex-shrink-0"
                  >
                    {user.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[#172B4D] truncate">{user.name}</div>
                    {idx === 0 && <div className="text-[10px] text-[#8993A4]">You</div>}
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-center gap-1.5 text-[13px] text-[#42526E] min-w-0">
                  <Mail size={11} className="text-[#8993A4] flex-shrink-0" />
                  <span className="truncate">{user.email ?? '—'}</span>
                </div>

                {/* Role */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === user.id ? null : user.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors hover:opacity-80"
                    style={{ background: roleCfg.bg, color: roleCfg.color }}
                  >
                    {role}
                    {idx !== 0 && <ChevronDown size={10} />}
                  </button>

                  {menuOpen === user.id && idx !== 0 && (
                    <div
                      className="absolute top-full left-0 mt-1 bg-white rounded-lg border border-[#DFE1E6] z-20 overflow-hidden"
                      style={{ boxShadow: '0 4px 16px rgba(9,30,66,.16)', minWidth: 160 }}
                    >
                      {(['Admin', 'Member', 'Viewer'] as Role[]).map(r => (
                        <button key={r} onClick={() => setMenuOpen(null)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#F4F5F7] text-left transition-colors">
                          <div className="w-2 h-2 rounded-full" style={{ background: ROLE_CONFIG[r].color }} />
                          <div>
                            <div className="text-[12px] font-semibold text-[#172B4D]">{r}</div>
                            <div className="text-[10px] text-[#8993A4]">{ROLE_CONFIG[r].desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center">
                  <button
                    className="w-7 h-7 rounded flex items-center justify-center text-[#8993A4] hover:bg-[#F4F5F7] hover:text-[#42526E] transition-colors"
                    title="More options"
                    onClick={() => {}}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Role legend */}
        <div className="mt-6 bg-white rounded-xl border border-[#DFE1E6] p-5" style={{ boxShadow: '0 1px 2px rgba(9,30,66,.08)' }}>
          <h3 className="text-[13px] font-bold text-[#172B4D] mb-3 flex items-center gap-2"><Shield size={14} /> Role Permissions</h3>
          <div className="grid grid-cols-3 gap-4">
            {(Object.entries(ROLE_CONFIG) as [Role, typeof ROLE_CONFIG[Role]][]).map(([r, cfg]) => (
              <div key={r} className="flex flex-col gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full w-fit" style={{ background: cfg.bg, color: cfg.color }}>
                  {r}
                </span>
                <p className="text-[12px] text-[#42526E] leading-relaxed">{cfg.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showInvite && (
        <InviteModal
          existingEmails={users.map(u => u.email ?? '').filter(Boolean)}
          onInvite={u => { onAddUser(u); setShowInvite(false); }}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}
