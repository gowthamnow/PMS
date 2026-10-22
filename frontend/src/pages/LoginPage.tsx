import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertCircle, Lock, Mail } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen w-full bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white border border-border rounded-lg shadow-card p-8 flex flex-col">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-copper-600 text-white flex items-center justify-center mb-3 shadow-subtle border border-copper-700">
            {/* Hexagon / Circuit SVG */}
            <svg
              className="w-7 h-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="9" />
              <line x1="12" y1="15" x2="12" y2="22" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Engineering PMS</h1>
          <p className="text-xs text-text-secondary mt-1">
            Team workspace for hardware &amp; firmware projects
          </p>
        </div>

        {/* Global Error Banner */}
        {authError && (
          <div className="mb-5 p-3 rounded-md bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Username or Email"
            type="text"
            placeholder="admin or user@company.com"
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
            Sign In to Workspace
          </Button>
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-text-muted font-mono">
            Secure electronics &amp; embedded development system
          </p>
        </div>
      </div>
    </div>
  );
};
