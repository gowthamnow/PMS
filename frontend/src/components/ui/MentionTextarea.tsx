import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { User } from '../../types';
import { Avatar } from './Avatar';
import { AtSign } from 'lucide-react';

interface MentionTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onValueChange: (val: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  value,
  onValueChange,
  label,
  placeholder,
  rows = 3,
  className = '',
  ...rest
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch users for mentions
  const { data: usersData } = useQuery({
    queryKey: ['users', 'mention-list'],
    queryFn: () => api.users.getUsers(1, 50),
    staleTime: 60000,
  });

  const users: User[] = usersData?.items || [];
  const filteredUsers = users.filter((u) => {
    const q = mentionQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.full_name.toLowerCase().includes(q)
    );
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    onValueChange(val);

    // Look back from current cursor to see if we are typing a mention
    const textBeforeCursor = val.slice(0, pos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check if there is space between @ and cursor (only match single word mention query)
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      if (!/\s/.test(query) && query.length <= 20) {
        setMentionStartIndex(lastAtIndex);
        setMentionQuery(query);
        setShowDropdown(true);
        setSelectedIndex(0);
        return;
      }
    }

    setShowDropdown(false);
  };

  const insertMention = (username: string) => {
    if (mentionStartIndex === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const before = value.slice(0, mentionStartIndex);
    const after = value.slice(cursor);
    const updated = `${before}@${username} ${after}`;
    onValueChange(updated);
    setShowDropdown(false);

    setTimeout(() => {
      if (textareaRef.current) {
        const nextPos = mentionStartIndex + username.length + 2;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showDropdown || filteredUsers.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredUsers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const selectedUser = filteredUsers[selectedIndex];
      if (selectedUser) {
        insertMention(selectedUser.username);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative flex flex-col gap-1 w-full">
      {label && (
        <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-text-muted flex items-center gap-1 font-normal">
            <AtSign className="w-2.5 h-2.5 text-copper-600" />
            <span>Type @ to mention team members</span>
          </span>
        </label>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Enter notes or type @ to mention an engineer...'}
          rows={rows}
          className={`w-full px-3 py-2 text-xs bg-slate-50 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 focus:bg-white transition-all font-sans leading-relaxed ${className}`}
          {...rest}
        />

        {/* Floating Autocomplete Dropdown */}
        {showDropdown && filteredUsers.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 z-50 w-64 max-h-48 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl p-1 text-xs">
            <div className="px-2 py-1 text-[10px] font-bold text-text-muted uppercase tracking-wider border-b border-slate-100 flex items-center gap-1">
              <AtSign className="w-3 h-3 text-copper-600" />
              <span>Mention Team Member</span>
            </div>
            {filteredUsers.map((u, idx) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(u.username);
                }}
                className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                  idx === selectedIndex ? 'bg-amber-50 text-copper-800' : 'hover:bg-slate-50 text-text-primary'
                }`}
              >
                <Avatar name={u.full_name || u.username} size="xs" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold block truncate leading-tight">
                    {u.full_name}
                  </span>
                  <span className="text-[10px] text-text-muted font-mono truncate block">
                    @{u.username} &bull; {u.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
