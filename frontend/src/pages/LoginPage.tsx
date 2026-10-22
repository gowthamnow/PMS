import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { AlertCircle, Lock, Mail, Clock, CheckCircle2, Settings, Sparkles, X, KeyRound, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    google?: any;
  }
}

const loginSchema = z.object({
  email: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [authError, setAuthError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string>('');
  const [hasGoogleConfig, setHasGoogleConfig] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [customClientIdInput, setCustomClientIdInput] = useState('');
  const [quickGoogleEmail, setQuickGoogleEmail] = useState('');
  const [quickGoogleName, setQuickGoogleName] = useState('');
  const [isSavingClientId, setIsSavingClientId] = useState(false);

  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Fetch Google OAuth Config from server
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await api.auth.getGoogleConfig();
        if (config?.client_id) {
          setGoogleClientId(config.client_id);
          setHasGoogleConfig(true);
        }
      } catch (err) {
        console.warn('Could not load Google auth config:', err);
      }
    };
    fetchConfig();
  }, []);

  // Initialize official Google Identity Services button if Client ID exists
  useEffect(() => {
    if (!googleClientId) return;

    const initGoogle = () => {
      if (window.google?.accounts?.id && googleBtnContainerRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: async (response: any) => {
              if (response?.credential) {
                await processGoogleAuth({ credential: response.credential });
              }
            },
            auto_select: false,
          });

          // Render official Google button
          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: 'outline',
            size: 'large',
            width: 384,
            text: 'continue_with',
            shape: 'rectangular',
          });
        } catch (err) {
          console.error('Google Identity init error:', err);
        }
      }
    };

    // If script already loaded, init; otherwise wait for it
    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          initGoogle();
          clearInterval(interval);
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [googleClientId]);

  // Standard Username/Password Submit
  const onSubmit = async (data: LoginFormData) => {
    setAuthError(null);
    try {
      await login(data.email, data.password);
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Authentication failed. Please verify your credentials.';
      setAuthError(msg);
    }
  };

  // Process Google Auth result (both GIS JWT and direct email payload)
  const processGoogleAuth = async (payload: {
    credential?: string;
    email?: string;
    full_name?: string;
    avatar_url?: string;
  }) => {
    setAuthError(null);
    setIsGoogleLoading(true);
    try {
      const res: any = await loginWithGoogle(payload);

      // Check if user is pending approval -> redirect to Access Lobby!
      if (res?.status === 'pending_approval' || !res?.approved) {
        const email = res?.email || payload.email || '';
        sessionStorage.setItem('pending_lobby_email', email);
        toast('Account waiting in Access Lobby for Admin approval.', {
          icon: '⏳',
          style: { background: '#1E293B', color: '#F8FAFC', fontSize: '12px' },
        });
        navigate(`/lobby?email=${encodeURIComponent(email)}`, { replace: true });
        return;
      }

      // User is active & approved
      toast.success('Signed in successfully!');
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Google Authentication failed.';

      if (msg.toLowerCase().includes('pending') || msg.toLowerCase().includes('approval')) {
        const email = payload.email || '';
        sessionStorage.setItem('pending_lobby_email', email);
        navigate(`/lobby?email=${encodeURIComponent(email)}`, { replace: true });
      } else {
        setAuthError(msg);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleContinueWithGoogleClick = () => {
    if (hasGoogleConfig && window.google?.accounts?.id) {
      // Trigger Google prompt
      window.google.accounts.id.prompt();
    } else {
      // Open dialog to set Client ID or enter Google account
      setIsConfigModalOpen(true);
    }
  };

  const handleSaveGoogleClientId = async () => {
    if (!customClientIdInput.trim()) return;
    setIsSavingClientId(true);
    try {
      setGoogleClientId(customClientIdInput.trim());
      setHasGoogleConfig(true);
      setIsConfigModalOpen(false);
      toast.success('Google Client ID active! Rendering Google Sign-In...');
    } finally {
      setIsSavingClientId(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-lg p-8 flex flex-col">
        {/* Brand Header with Sleek Modern Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <Logo size="lg" showText={true} className="mb-2" />
          <p className="text-xs text-slate-500 mt-1">
            Mission-critical workspace for PCB, firmware &amp; hardware engineering
          </p>
        </div>

        {/* Global Error Banner */}
        {authError && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        {/* Official Google Identity Button OR Continue with Google */}
        <div className="flex flex-col gap-2 mb-5">
          {hasGoogleConfig ? (
            <div className="flex flex-col items-center w-full">
              <div ref={googleBtnContainerRef} className="w-full flex justify-center" />
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(true)}
                className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 self-end"
              >
                <Settings className="w-3 h-3" />
                <span>Google OAuth Config</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleContinueWithGoogleClick}
              disabled={isGoogleLoading || isSubmitting}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-all shadow-xs group cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isGoogleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>
          )}
        </div>

        <div className="relative flex items-center justify-center my-2 mb-4">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[11px] text-slate-500 font-medium tracking-wider">
            OR SIGN IN WITH PASSWORD
          </span>
          <div className="border-t border-slate-200 w-full" />
        </div>

        {/* Standard Credentials Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Username or Email"
            type="text"
            placeholder="admin, engineer, or your email"
            autoComplete="username"
            required
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors.email?.message}
            {...register('email')}
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
            leftIcon={<Lock className="w-4 h-4" />}
            error={errors.password?.message}
            {...register('password')}
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            className="w-full mt-2"
            isLoading={isSubmitting}
          >
            Sign In with Password
          </Button>
        </form>

        {/* Quick Testing Credentials */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-1.5 text-center">
          <span className="text-[11px] font-semibold text-slate-700">Quick Testing Credentials:</span>
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px]">
            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
              Admin: <strong>admin</strong> / <strong>AdminEng2026#Secure</strong>
            </span>
            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
              Engineer: <strong>engineer</strong> / <strong>Engineer2026#Secure</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1">
            New Google users will wait in the Lobby until approved by Gowtham.
          </span>
        </div>
      </div>

      {/* Google OAuth & Account Modal */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl relative">
            {/* Close button */}
            <button
              onClick={() => setIsConfigModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">Google Sign-In</h3>
                <p className="text-xs text-slate-500">Sign in with Google or connect OAuth Client ID</p>
              </div>
            </div>

            {/* Direct Google Sign-In */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3 mb-4">
              <span className="text-xs font-bold text-slate-900">
                Sign In with your Google Account:
              </span>
              <Input
                label="Google Email Address"
                placeholder="you@gmail.com"
                type="email"
                value={quickGoogleEmail}
                onChange={(e) => setQuickGoogleEmail(e.target.value)}
                leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
              />
              <Input
                label="Full Name (optional)"
                placeholder="e.g. Maya Lin"
                value={quickGoogleName}
                onChange={(e) => setQuickGoogleName(e.target.value)}
              />

              <Button
                variant="primary"
                size="sm"
                className="w-full mt-1"
                disabled={!quickGoogleEmail.trim() || isGoogleLoading}
                isLoading={isGoogleLoading}
                onClick={() =>
                  processGoogleAuth({
                    email: quickGoogleEmail.trim(),
                    full_name: quickGoogleName.trim() || quickGoogleEmail.split('@')[0],
                  })
                }
              >
                Sign In &amp; Enter Workspace / Lobby
              </Button>
              <span className="text-[10px] text-slate-500 text-center">
                New users will enter the <strong>Access Lobby</strong>; an automated email alert will be dispatched to Admin Gowtham immediately.
              </span>
            </div>

            {/* Google OAuth Client ID Section */}
            <div className="border-t border-slate-200 pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-copper-600" />
                  Connect Google Cloud Client ID
                </span>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                  Get Client ID <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <p className="text-[11px] text-slate-500">
                To show the native Google popup directly on button click, paste your Google Web Client ID below:
              </p>
              <Input
                placeholder="e.g. 123456789-xxx.apps.googleusercontent.com"
                value={customClientIdInput}
                onChange={(e) => setCustomClientIdInput(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSaveGoogleClientId}
                disabled={!customClientIdInput.trim() || isSavingClientId}
                isLoading={isSavingClientId}
              >
                Save &amp; Render Native Google Button
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
