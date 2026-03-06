import React from 'react';
import { X, Bell, CheckCheck, MessageSquare, UserCheck, Play, FileText, AlertCircle } from 'lucide-react';
import { Notification } from '../types';

interface Props {
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

const NOTIF_ICONS: Record<Notification['type'], React.ReactNode> = {
  issue_assigned: <UserCheck  size={14} className="text-[#0052CC]" />,
  issue_comment:  <MessageSquare size={14} className="text-[#6554C0]" />,
  issue_status:   <AlertCircle  size={14} className="text-[#FF8B00]" />,
  sprint_started: <Play         size={14} className="text-[#00875A]" />,
  page_updated:   <FileText     size={14} className="text-[#42526E]" />,
};

const NOTIF_BG: Record<Notification['type'], string> = {
  issue_assigned: '#DEEBFF',
  issue_comment:  '#EAE6FF',
  issue_status:   '#FFF7D6',
  sprint_started: '#E3FCEF',
  page_updated:   '#F4F5F7',
};

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationsPanel({ notifications, onMarkRead, onMarkAllRead, onClose }: Props) {
  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="fixed inset-0 z-[80]" onClick={onClose}>
      <div
        className="absolute top-[60px] right-4 w-[380px] bg-white rounded-xl border border-[#DFE1E6] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 8px 32px rgba(9,30,66,.20)', maxHeight: 'calc(100vh - 80px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#DFE1E6] bg-[#FAFBFC]">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-[#172B4D]" />
            <h3 className="text-[14px] font-bold text-[#172B4D]">Notifications</h3>
            {unread > 0 && (
              <span className="text-[11px] font-bold bg-[#0052CC] text-white rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {unread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                onClick={onMarkAllRead}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold text-[#0052CC] hover:bg-[#DEEBFF] transition-colors"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded flex items-center justify-center text-[#42526E] hover:bg-[#F4F5F7] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#8993A4]">
              <Bell size={32} strokeWidth={1.5} className="mb-3" />
              <p className="text-[13px] font-semibold">You're all caught up!</p>
              <p className="text-[11px] mt-1">No notifications yet</p>
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => onMarkRead(n.id)}
                className={[
                  'flex gap-3 px-4 py-3.5 border-b border-[#F4F5F7] cursor-pointer transition-colors',
                  !n.read ? 'bg-[#F8F9FF] hover:bg-[#EFF2FB]' : 'hover:bg-[#F4F5F7]',
                ].join(' ')}
              >
                {/* Icon */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: NOTIF_BG[n.type] }}
                >
                  {NOTIF_ICONS[n.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] leading-snug ${!n.read ? 'font-semibold text-[#172B4D]' : 'font-medium text-[#42526E]'}`}>
                    {n.title}
                  </p>
                  <p className="text-[12px] text-[#8993A4] mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-[#B3BAC5] mt-1 font-medium">{relativeTime(n.createdAt)}</p>
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-[#0052CC] flex-shrink-0 mt-2" />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2.5 border-t border-[#DFE1E6] bg-[#FAFBFC]">
            <button className="text-[12px] font-semibold text-[#0052CC] hover:underline w-full text-center">
              View all notifications
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
