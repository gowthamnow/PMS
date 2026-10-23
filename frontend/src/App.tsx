import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui/Spinner';

// Fast route-based code splitting: Pages are lazy loaded on demand
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const LobbyPage = lazy(() => import('./pages/LobbyPage').then((m) => ({ default: m.LobbyPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })));
const TaskBoardPage = lazy(() => import('./pages/TaskBoardPage').then((m) => ({ default: m.TaskBoardPage })));
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })));
const MyTasksPage = lazy(() => import('./pages/MyTasksPage').then((m) => ({ default: m.MyTasksPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const TimesheetPage = lazy(() => import('./pages/TimesheetPage').then((m) => ({ default: m.TimesheetPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const UsersPage = lazy(() => import('./pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const SystemPage = lazy(() => import('./pages/admin/SystemPage').then((m) => ({ default: m.SystemPage })));
const AICopilotPage = lazy(() => import('./pages/AICopilotPage').then((m) => ({ default: m.AICopilotPage })));

const PageLoader: React.FC = () => (
  <div className="py-20 flex flex-col items-center justify-center gap-3">
    <Spinner size="md" />
  </div>
);

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('UI Render Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-lg mx-auto my-12 bg-white border border-red-200 rounded-lg shadow-sm text-center">
          <h2 className="text-base font-bold text-red-600 mb-2">Engineering Workspace Error</h2>
          <p className="text-xs text-slate-600 mb-4">{this.state.error?.message || 'An unexpected rendering error occurred.'}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-4 py-2 bg-copper-600 hover:bg-copper-700 text-white text-xs font-semibold rounded shadow-sm"
          >
            Reload Workspace
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ProtectedRoute
const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
        <span className="text-xs font-mono text-text-muted">Authenticating workspace session...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// AdminRoute
const AdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export const App: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lobby" element={<LobbyPage />} />

        {/* Protected Routes wrapped in AppLayout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ErrorBoundary>
                <AppLayout />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="projects/:id/board" element={<TaskBoardPage />} />
          <Route path="tasks" element={<MyTasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="ai" element={<AICopilotPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="timesheet" element={<TimesheetPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />

          {/* Admin Routes */}
          <Route
            path="admin/users"
            element={
              <AdminRoute>
                <UsersPage />
              </AdminRoute>
            }
          />
          <Route
            path="admin/system"
            element={
              <AdminRoute>
                <SystemPage />
              </AdminRoute>
            }
          />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
