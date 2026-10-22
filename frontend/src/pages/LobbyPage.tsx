import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { TOKEN_STORAGE_KEY } from '../lib/auth';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Mail,
  ShieldCheck,
  UserCheck,
  LogOut,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const LobbyPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const emailParam = searchParams.get('email') || sessionStorage.getItem('pending_lobby_email') || '';
  const [email] = useState<string>(emailParam);

  const [userInfo, setUserInfo] = useState<{
    full_name?: string;
    avatar_url?: string;
    created_at?: string;
  } | null>(null);

  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date>(new Date());

  const pollingRef = useRef<any>(null);

  // Check approval status
  const checkStatus = useCallback(
    async (isManual = false) => {
      if (!email) return;
      if (isManual) setIsChecking(true);
      try {
        const lobbyToken = sessionStorage.getItem('pms_lobby_token');
        const res = await api.auth.getLobbyStatus(email, lobbyToken);
        setLastCheckedAt(new Date());

        if (res.full_name || res.avatar_url) {
          setUserInfo({
            full_name: res.full_name,
            avatar_url: res.avatar_url,
            created_at: res.created_at,
          });
        }

        if (res.approved && res.access_token) {
          setIsApproved(true);
          localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token);
          sessionStorage.removeItem('pending_lobby_email');
          sessionStorage.removeItem('pms_lobby_token');
          toast.success('Access Approved! Entering workspace...', { duration: 4000 });
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
            window.location.reload();
          }, 1500);
        } else if (res.approved) {
          setIsApproved(true);
          sessionStorage.removeItem('pending_lobby_email');
          sessionStorage.removeItem('pms_lobby_token');
          toast.success('Access Approved! Please log in to enter your workspace.', { duration: 4000 });
          setTimeout(() => {
            navigate('/login', { replace: true });
          }, 1500);
        } else if (isManual) {
          toast('Still pending admin approval. Checked just now.', {
            icon: '⏳',
            style: { background: '#1E293B', color: '#F8FAFC', fontSize: '12px' },
          });
        }
      } catch (err: any) {
        console.warn('Lobby status check error:', err);
      } finally {
        if (isManual) setIsChecking(false);
      }
    },
    [email, navigate]
  );

  // Initial check & interval polling every 4 seconds
  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
      return;
    }
    sessionStorage.setItem('pending_lobby_email', email);
    checkStatus(false);

    pollingRef.current = setInterval(() => {
      checkStatus(false);
    }, 4000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [email, checkStatus, navigate]);

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const cd = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(cd);
  }, [resendCooldown]);

  const handleResendAlert = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await api.auth.resendLobbyAlert(email);
      toast.success('Priority alert email resent to Administrator (Gowtham)!');
      setResendCooldown(60);
    } catch (err) {
      toast.error('Failed to dispatch alert. Please try again in a moment.');
    } finally {
      setIsResending(false);
    }
  };

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 selection:bg-copper-500 selection:text-white">
      {/* Top Bar */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-800/80">
        <Logo size="md" showText={true} />
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          <span className="text-xs font-mono font-medium text-amber-400 uppercase tracking-wider">
            Live Waiting Lobby
          </span>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-xl w-full mx-auto my-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-copper-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Approved State Banner */}
          {isApproved ? (
            <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-5 text-center flex flex-col items-center gap-3 animate-in zoom-in-95 duration-300">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-emerald-300">Access Approved!</h2>
              <p className="text-xs text-emerald-200/80">
                Administrator granted your workspace authorization. Redirecting to PMS dashboard...
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-1 shadow-inner">
                  <Clock className="w-7 h-7 animate-pulse" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Awaiting Administrator Approval
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md">
                  Your Google identity is verified. The Master Administrator has received an automated email alert to activate your account.
                </p>
              </div>

              {/* User Profile Snippet */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {userInfo?.avatar_url ? (
                    <img
                      src={userInfo.avatar_url}
                      alt="Avatar"
                      className="w-10 h-10 rounded-full border border-slate-700 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-copper-600/20 border border-copper-500/30 text-copper-400 font-bold flex items-center justify-center text-sm font-mono">
                      {(userInfo?.full_name || email).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {userInfo?.full_name || 'Google User'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 truncate">{email}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 bg-amber-950/50 border border-amber-500/30 px-2 py-0.5 rounded">
                    In Lobby
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 mt-1">
                    Time: {formatElapsed(elapsedSeconds)}
                  </span>
                </div>
              </div>

              {/* Real-time Checklist */}
              <div className="flex flex-col gap-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 text-xs">
                <div className="flex items-center gap-3 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Google Authentication Successful</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>Admin Alert Email Dispatched</span>
                    <span className="text-[10px] text-slate-500">Delivered to gowthamthangaraj18@gmail.com</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-amber-300">
                  <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-semibold">Live Polling Approval Status</span>
                    <span className="text-[10px] text-slate-400">
                      Checking server every 4 seconds &bull; Last check: {lastCheckedAt.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notice text */}
              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                Please leave this tab open. As soon as Administrator Gowtham clicks <strong>Activate</strong> in the
                Admin panel, this page will automatically unlock and direct you into your engineering workspace.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full sm:flex-1"
                  onClick={() => checkStatus(true)}
                  isLoading={isChecking}
                  leftIcon={<RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />}
                >
                  Check Status Now
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  className="w-full sm:flex-1"
                  onClick={handleResendAlert}
                  disabled={resendCooldown > 0 || isResending}
                  isLoading={isResending}
                  leftIcon={<Mail className="w-4 h-4" />}
                >
                  {resendCooldown > 0 ? `Resend Alert (${resendCooldown}s)` : 'Ping Admin Again'}
                </Button>
              </div>
            </>
          )}

          {/* Footer Back Button */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <button
              onClick={() => {
                sessionStorage.removeItem('pending_lobby_email');
                navigate('/login');
              }}
              className="flex items-center gap-1.5 hover:text-slate-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Use different account</span>
            </button>
            <span className="font-mono text-[10px]">Auto-refresh: 4s</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-4xl w-full mx-auto text-center py-3 text-[11px] font-mono text-slate-600">
        Engineering PMS &bull; Hardware, Firmware & PCB Workspace &bull; Zero Trust Identity
      </div>
    </div>
  );
};

export default LobbyPage;
