import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

export const AppLayout: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
    </div>
  );
};
