import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './lib/auth';
import { App } from './App';
import './styles/globals.css';

export const ACCENT_COLOR_MAP: Record<string, { base: string; hover: string; light: string; ring: string }> = {
  copper: { base: '#D97706', hover: '#B45309', light: '#FEF3C7', ring: 'rgba(217, 119, 6, 0.35)' },
  emerald: { base: '#059669', hover: '#047857', light: '#D1FAE5', ring: 'rgba(5, 150, 105, 0.35)' },
  blue: { base: '#2563EB', hover: '#1D4ED8', light: '#DBEAFE', ring: 'rgba(37, 99, 235, 0.35)' },
  violet: { base: '#7C3AED', hover: '#6D28D9', light: '#EDE9FE', ring: 'rgba(124, 58, 237, 0.35)' },
  rose: { base: '#E11D48', hover: '#BE123C', light: '#FFE4E6', ring: 'rgba(225, 29, 72, 0.35)' },
};

export const applyThemeConfig = (mode?: 'light' | 'dark', accent?: string) => {
  const currentMode = mode || (localStorage.getItem('pms_theme_mode') as 'light' | 'dark') || 'light';
  if (currentMode === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  const currentAccent = accent || localStorage.getItem('pms_accent_color') || 'copper';
  const colors = ACCENT_COLOR_MAP[currentAccent] || ACCENT_COLOR_MAP.copper;

  document.documentElement.style.setProperty('--accent-base', colors.base);
  document.documentElement.style.setProperty('--accent-hover', colors.hover);
  document.documentElement.style.setProperty('--accent-light', colors.light);
  document.documentElement.style.setProperty('--accent-ring', colors.ring);
};

// Initialize immediately on boot
applyThemeConfig();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#FFFFFF',
                color: '#1E293B',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                fontSize: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              },
              success: {
                iconTheme: {
                  primary: '#16A34A',
                  secondary: '#FFFFFF',
                },
              },
              error: {
                iconTheme: {
                  primary: '#DC2626',
                  secondary: '#FFFFFF',
                },
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
