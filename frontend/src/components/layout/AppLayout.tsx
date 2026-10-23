import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { GlobalAICopilotDrawer } from '../ai/GlobalAICopilotDrawer';
import { Sparkles } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

  useEffect(() => {
    const handleOpenAi = () => setIsAiDrawerOpen(true);
    window.addEventListener('open-ai-drawer', handleOpenAi);
    return () => window.removeEventListener('open-ai-drawer', handleOpenAi);
  }, []);

  return (
    <div className="min-h-screen bg-background text-text-primary flex">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Wrapper */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
          isSidebarCollapsed ? 'pl-[64px]' : 'pl-[240px]'
        }`}
      >
        {/* TopNav */}
        <TopNav isSidebarCollapsed={isSidebarCollapsed} />

        {/* Content Area */}
        <main className="flex-1 mt-[60px] p-6 max-w-7xl w-full mx-auto animate-in fade-in duration-150">
          <Outlet />
        </main>
      </div>

      {/* Small Attachment Widget in Right-Side Corner */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center">
        <button
          onClick={() => setIsAiDrawerOpen(true)}
          className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700 text-white rounded-full shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-0.5 border border-amber-300/40 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          title="Open Engineering AI Copilot (Instant Chat, Solve Bugs & Architecture Guidance)"
        >
          <div className="relative flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-amber-200 animate-pulse group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
          </div>
          <span className="text-xs font-bold tracking-wide">AI Copilot</span>
          <span className="text-[10px] bg-slate-900/60 text-amber-200 px-2 py-0.5 rounded-full font-mono font-medium border border-amber-400/20">
            Gemini
          </span>
        </button>
      </div>

      {/* Global AI Copilot Drawer */}
      <GlobalAICopilotDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
      />
    </div>
  );
};
