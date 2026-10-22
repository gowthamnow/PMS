import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Conversation, Message } from '../types';
import { Avatar } from '../components/ui/Avatar';
import { MentionTextarea } from '../components/ui/MentionTextarea';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, formatRelativeTime } from '../lib/utils';
import {
  Send,
  MessageSquare,
  Hash,
  Search,
  Users,
  CheckCircle2,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const MessagesPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Fetch Conversations
  const { data: conversations = [], isLoading: isLoadingConversations } = useQuery({
    queryKey: ['messages', 'conversations'],
    queryFn: () => api.messages.getConversations(),
    refetchInterval: 5000,
  });

  // Select first conversation by default once loaded
  useEffect(() => {
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    } else if (selectedConversation) {
      // Keep selected conversation up to date
      const updated = conversations.find((c) => c.id === selectedConversation.id);
      if (updated) setSelectedConversation(updated);
    }
  }, [conversations]);

  // 2. Fetch Active Conversation Messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: [
      'messages',
      'thread',
      selectedConversation?.project_id,
      selectedConversation?.recipient_id,
    ],
    queryFn: () => {
      if (!selectedConversation) return [];
      return api.messages.getMessages({
        project_id: selectedConversation.project_id || undefined,
        recipient_id: selectedConversation.recipient_id || undefined,
        limit: 100,
      });
    },
    enabled: !!selectedConversation,
    refetchInterval: 3000,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Send Message Mutation
  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.messages.sendMessage({
        content,
        project_id: selectedConversation?.project_id,
        recipient_id: selectedConversation?.recipient_id,
      }),
    onSuccess: () => {
      setInputText('');
      queryClient.invalidateQueries({
        queryKey: [
          'messages',
          'thread',
          selectedConversation?.project_id,
          selectedConversation?.recipient_id,
        ],
      });
      queryClient.invalidateQueries({ queryKey: ['messages', 'conversations'] });
    },
    onError: () => {
      toast.error('Failed to send message.');
    },
  });

  const handleSend = () => {
    if (!inputText.trim() || sendMutation.isPending) return;
    sendMutation.mutate(inputText.trim());
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const channelConversations = filteredConversations.filter((c) => c.type === 'channel');
  const directConversations = filteredConversations.filter((c) => c.type === 'direct');

  // Render text with styled @mentions
  const renderFormattedContent = (content: string) => {
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={i}
            className="font-bold text-copper-700 bg-copper-50 px-1 py-0.5 rounded border border-copper-200/60"
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col gap-3">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Team Communications</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time direct messaging, project team channels, and engineer @mentions.
          </p>
        </div>
      </div>

      {/* Main Two-Pane Chat Container */}
      <div className="flex-1 flex bg-white border border-border rounded-xl shadow-card overflow-hidden">
        {/* Left Pane: Conversations & Channels */}
        <div className="w-80 border-r border-border flex flex-col bg-slate-50/50">
          {/* Search Bar */}
          <div className="p-3 border-b border-border bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search teammates or channels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-border rounded-md text-text-primary focus:outline-none focus:ring-1 focus:ring-copper-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-3">
            {isLoadingConversations ? (
              <div className="p-6 text-center">
                <Spinner size="sm" />
              </div>
            ) : (
              <>
                {/* Channels */}
                {channelConversations.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-text-muted uppercase">
                      Project Channels
                    </span>
                    {channelConversations.map((conv) => {
                      const isSelected = selectedConversation?.id === conv.id;
                      return (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => setSelectedConversation(conv)}
                          className={`w-full text-left p-2 rounded-lg flex items-center gap-2.5 transition-all ${
                            isSelected
                              ? 'bg-copper-50 border border-copper-200 text-copper-900 shadow-xs'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="w-7 h-7 rounded-md bg-slate-200/80 flex items-center justify-center text-slate-600 font-bold shrink-0">
                            <Hash className="w-4 h-4 text-copper-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold truncate">{conv.title}</span>
                            </div>
                            <p className="text-[11px] text-text-muted truncate mt-0.5">
                              {conv.last_message}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Direct Messages */}
                <div className="flex flex-col gap-1 mt-1">
                  <span className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-text-muted uppercase flex items-center justify-between">
                    <span>Direct Messages</span>
                    <Users className="w-3 h-3 text-slate-400" />
                  </span>

                  {directConversations.length === 0 ? (
                    <span className="px-2.5 py-2 text-xs text-text-muted italic">
                      No matching team members.
                    </span>
                  ) : (
                    directConversations.map((conv) => {
                      const isSelected = selectedConversation?.id === conv.id;
                      return (
                        <button
                          key={conv.id}
                          type="button"
                          onClick={() => setSelectedConversation(conv)}
                          className={`w-full text-left p-2 rounded-lg flex items-center gap-2.5 transition-all ${
                            isSelected
                              ? 'bg-copper-50 border border-copper-200 text-copper-900 shadow-xs'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <Avatar
                              name={conv.title}
                              src={conv.avatar_url}
                              size="sm"
                            />
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold truncate">{conv.title}</span>
                              {conv.unread_count > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full bg-copper-600 text-white font-mono text-[10px] font-bold">
                                  {conv.unread_count}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-text-muted truncate mt-0.5">
                              {conv.last_message}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Pane: Active Thread Chat */}
        <div className="flex-1 flex flex-col bg-white">
          {selectedConversation ? (
            <>
              {/* Thread Header */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  {selectedConversation.type === 'channel' ? (
                    <div className="w-8 h-8 rounded-lg bg-copper-100 border border-copper-200 flex items-center justify-center text-copper-800">
                      <Hash className="w-4 h-4 font-bold" />
                    </div>
                  ) : (
                    <Avatar
                      name={selectedConversation.title}
                      src={selectedConversation.avatar_url}
                      size="sm"
                    />
                  )}
                  <div>
                    <h2 className="text-xs font-bold text-text-primary flex items-center gap-2">
                      <span>{selectedConversation.title}</span>
                      {selectedConversation.type === 'direct' && (
                        <span className="text-[10px] font-normal text-emerald-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] text-text-muted">
                      {selectedConversation.subtitle || 'Engineering Workspace Thread'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5 bg-slate-50/30">
                {isLoadingMessages ? (
                  <div className="m-auto text-center">
                    <Spinner size="md" />
                    <p className="text-xs text-text-muted mt-2">Loading message stream...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="m-auto text-center max-w-sm">
                    <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <h3 className="text-xs font-bold text-slate-700">No Messages Yet</h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Start the collaboration by sending the first message or typing @ to mention a
                      teammate.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isSelf = msg.sender_id === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-2.5 max-w-[80%] ${
                          isSelf ? 'self-end flex-row-reverse' : 'self-start'
                        }`}
                      >
                        <Avatar
                          name={msg.sender?.full_name || 'Team Member'}
                          src={msg.sender?.avatar_url}
                          size="xs"
                        />
                        <div
                          className={`flex flex-col ${
                            isSelf ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                            <span className="font-semibold text-slate-700">
                              {isSelf ? 'You' : msg.sender?.full_name}
                            </span>
                            <span>•</span>
                            <span>{formatRelativeTime(msg.created_at)}</span>
                          </div>

                          <div
                            className={`p-3 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words shadow-xs ${
                              isSelf
                                ? 'bg-copper-600 text-white rounded-tr-xs'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                            }`}
                          >
                            {renderFormattedContent(msg.content)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box with @ Mention Autocomplete */}
              <div className="p-3.5 border-t border-border bg-white flex flex-col gap-2">
                <MentionTextarea
                  placeholder={`Message ${selectedConversation.title} (type @ to mention a teammate)...`}
                  value={inputText}
                  onValueChange={setInputText}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    Press <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px]">Enter</kbd> to
                    send, <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px]">Shift+Enter</kbd> for
                    new line.
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                    disabled={!inputText.trim() || sendMutation.isPending}
                    isLoading={sendMutation.isPending}
                    onClick={handleSend}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="m-auto text-center">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Select a conversation or channel to begin chatting.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessagesPage;
