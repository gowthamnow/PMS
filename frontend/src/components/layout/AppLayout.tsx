import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { GlobalAICopilotDrawer } from '../ai/GlobalAICopilotDrawer';
import { Sparkles } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);

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

      {/* Floating Global Engineering AI Button */}
      <button
        onClick={() => setIsAiDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 border border-amber-400/30 group cursor-pointer"
        title="Open Engineering AI Copilot (Solve Bugs, Circuit Roadblocks, Datasheets)"
      >
        <Sparkles className="w-5 h-5 text-amber-200 animate-pulse group-hover:rotate-12 transition-transform" />
        <span className="text-xs font-bold tracking-wide">Ask AI Copilot</span>
        <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded-full font-mono">
          Gemini
        </span>
      </button>

      {/* Global AI Copilot Drawer */}
      <GlobalAICopilotDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
      />
    </div>
  );
};
