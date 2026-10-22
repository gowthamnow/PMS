import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Tabs, TabItem } from '../components/ui/Tabs';
import { Avatar } from '../components/ui/Avatar';
import {
  User,
  Key,
  Shield,
  Palette,
  Check,
  Sun,
  Moon,
  Sparkles,
  Bell,
  Send,
  Upload,
  Cpu,
  LayoutGrid,
  Sunset,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

const passwordSchema = z
  .object({
    old_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'New password must be at least 8 characters'),
    confirm_password: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const ACCENT_COLORS = [
  { id: 'copper', name: 'Amber Copper', bg: 'bg-amber-600', ring: 'ring-amber-500', hex: '#D97706' },
  { id: 'emerald', name: 'Emerald PCB', bg: 'bg-emerald-600', ring: 'ring-emerald-500', hex: '#059669' },
  { id: 'blue', name: 'Firmware Blue', bg: 'bg-blue-600', ring: 'ring-blue-500', hex: '#2563EB' },
  { id: 'violet', name: 'Digital Violet', bg: 'bg-violet-600', ring: 'ring-violet-500', hex: '#7C3AED' },
  { id: 'rose', name: 'Telemetry Rose', bg: 'bg-rose-600', ring: 'ring-rose-500', hex: '#E11D48' },
];

export const SettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'appearance';

  // Theme states (persisted in localStorage)
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('pms_theme_mode') as 'light' | 'dark') || 'light';
  });
  const [accentColor, setAccentColor] = useState<string>(() => {
    return localStorage.getItem('pms_accent_color') || 'copper';
  });
  const [cardStyle, setCardStyle] = useState<'3d' | 'flat'>(() => {
    return (localStorage.getItem('pms_card_style') as '3d' | 'flat') || '3d';
  });

  // Selected avatar icon / picture
  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState<string>(() => {
    return localStorage.getItem(`pms_avatar_${user?.id}`) || user?.full_name || 'Engineer';
  });

  const handleApplyTheme = (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    localStorage.setItem('pms_theme_mode', mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    toast.success(`Theme switched to ${mode.toUpperCase()} mode`);
  };

  const handleApplyAccent = (id: string) => {
    setAccentColor(id);
    localStorage.setItem('pms_accent_color', id);
    toast.success(`Accent color set to ${id}`);
  };

  const handleApplyCardStyle = (style: '3d' | 'flat') => {
    setCardStyle(style);
    localStorage.setItem('pms_card_style', style);
    toast.success(`Project card presentation set to ${style === '3d' ? '3D Square Box' : 'Modern Flat'}`);
  };

  const handleSelectAvatarSeed = (seed: string) => {
    setSelectedAvatarSeed(seed);
    if (user) {
      localStorage.setItem(`pms_avatar_${user.id}`, seed);
      toast.success('Avatar updated');
    }
  };

  // Profile Form
  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    formState: { errors: profileErrors, isSubmitting: isSubmittingProfile },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: user?.full_name || '',
      email: user?.email || '',
    },
  });

  // Password Form
  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors, isSubmitting: isSubmittingPassword },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      old_password: '',
      new_password: '',
      confirm_password: '',
    },
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    try {
      await api.auth.updateProfile(data);
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update profile');
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    try {
      await api.auth.changePassword(data.old_password, data.new_password);
      resetPasswordForm();
      toast.success('Password changed successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to change password');
    }
  };

  const tabs: TabItem[] = [
    { id: 'appearance', label: 'Appearance & Themes', icon: <Palette className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile & Avatar', icon: <User className="w-4 h-4" /> },
    { id: 'password', label: 'Security & Password', icon: <Key className="w-4 h-4" /> },
    { id: 'reminders', label: 'Automated Reminders', icon: <Bell className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-2 border-b border-border">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">System &amp; Workspace Settings</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Customize themes, dark/light modes, project card presentation, profile pictures, and notification schedules.
        </p>
      </div>

      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setSearchParams({ tab: tabId })}
      />

      {/* ======================================================== */}
      {/* 1. APPEARANCE & THEMES TAB                               */}
      {/* ======================================================== */}
      {activeTab === 'appearance' && (
        <div className="flex flex-col gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          {/* Light / Dark Mode */}
          <div>
            <h3 className="font-bold text-sm text-text-primary mb-1">Color Theme Mode</h3>
            <p className="text-xs text-text-muted mb-4">
              Choose between high-clarity technical light mode or eye-saving dark mode.
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <button
                type="button"
                onClick={() => handleApplyTheme('light')}
                className={`p-4 rounded-xl border-2 flex items-center justify-between text-left transition-all ${
                  themeMode === 'light'
                    ? 'border-amber-500 bg-amber-50/40 text-text-primary shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 text-text-secondary bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs block">Warm White (Light)</span>
                    <span className="text-[11px] text-text-muted">Engineering Slate</span>
                  </div>
                </div>
                {themeMode === 'light' && <Check className="w-4 h-4 text-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => handleApplyTheme('dark')}
                className={`p-4 rounded-xl border-2 flex items-center justify-between text-left transition-all ${
                  themeMode === 'dark'
                    ? 'border-amber-500 bg-slate-900 text-white shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 text-text-secondary bg-slate-900/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-amber-400">
                    <Moon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs block">Obsidian (Dark)</span>
                    <span className="text-[11px] text-text-muted">Navy Charcoal</span>
                  </div>
                </div>
                {themeMode === 'dark' && <Check className="w-4 h-4 text-amber-400" />}
              </button>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Accent Color Palette */}
          <div>
            <h3 className="font-bold text-sm text-text-primary mb-1">Brand &amp; Accent Color</h3>
            <p className="text-xs text-text-muted mb-4">
              Select the primary accent color used for badges, buttons, and visual highlights.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleApplyAccent(c.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all text-xs font-semibold ${
                    accentColor === c.id
                      ? 'border-slate-900 bg-slate-50 text-text-primary shadow-xs ring-2 ring-slate-900/10'
                      : 'border-slate-200 hover:border-slate-300 text-text-secondary bg-white'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full ${c.bg}`} />
                  <span>{c.name}</span>
                  {accentColor === c.id && <Check className="w-3.5 h-3.5 text-text-primary" />}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Project Box Presentation Customizer */}
          <div>
            <h3 className="font-bold text-sm text-text-primary mb-1">Project Deck Card Visuals</h3>
            <p className="text-xs text-text-muted mb-4">
              Customize how project squares appear on the My Projects page.
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <button
                type="button"
                onClick={() => handleApplyCardStyle('3d')}
                className={`p-4 rounded-xl border-2 flex items-center justify-between text-left transition-all ${
                  cardStyle === '3d'
                    ? 'border-amber-500 bg-amber-50/40 text-text-primary shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-text-secondary bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs block">3D Square Box</span>
                    <span className="text-[11px] text-text-muted">Elevation &amp; Depth Hover</span>
                  </div>
                </div>
                {cardStyle === '3d' && <Check className="w-4 h-4 text-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => handleApplyCardStyle('flat')}
                className={`p-4 rounded-xl border-2 flex items-center justify-between text-left transition-all ${
                  cardStyle === 'flat'
                    ? 'border-amber-500 bg-amber-50/40 text-text-primary shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-text-secondary bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs block">Modern Flat</span>
                    <span className="text-[11px] text-text-muted">Minimalist Clean</span>
                  </div>
                </div>
                {cardStyle === 'flat' && <Check className="w-4 h-4 text-amber-600" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PROFILE & AVATAR TAB                                  */}
      {/* ======================================================== */}
      {activeTab === 'profile' && (
        <div className="flex flex-col gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          {/* Avatar Selector */}
          <div>
            <h3 className="font-bold text-sm text-text-primary mb-1">Profile Picture &amp; Avatar</h3>
            <p className="text-xs text-text-muted mb-4">
              Select your customized engineering avatar badge or upload a profile image.
            </p>
            <div className="flex items-center gap-4">
              <Avatar name={selectedAvatarSeed} size="lg" />
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-text-secondary">Avatar Presets:</span>
                <div className="flex items-center gap-2">
                  {['Engineer', 'Lead Architect', 'Firmware Lead', 'Hardware Specialist', 'Admin Tech'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectAvatarSeed(preset)}
                      className={`px-3 py-1 rounded-lg border text-xs font-medium transition-all ${
                        selectedAvatarSeed === preset
                          ? 'border-copper-600 bg-copper-50 text-copper-800 font-semibold'
                          : 'border-slate-200 hover:bg-slate-50 text-text-secondary'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Profile Details Form */}
          <form onSubmit={handleSubmitProfile(onProfileSubmit)} className="flex flex-col gap-4 max-w-md">
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Full Name</label>
              <Input
                {...registerProfile('full_name')}
                error={profileErrors.full_name?.message}
                placeholder="e.g. Subasri M"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Email Address</label>
              <Input
                {...registerProfile('email')}
                type="email"
                error={profileErrors.email?.message}
                placeholder="engineer@company.com"
              />
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" size="sm" isLoading={isSubmittingProfile}>
                Save Profile Changes
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SECURITY & PASSWORD TAB                               */}
      {/* ======================================================== */}
      {activeTab === 'password' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h3 className="font-bold text-sm text-text-primary mb-1">Update Password</h3>
          <p className="text-xs text-text-muted mb-4">
            Ensure your account is protected with a strong password (minimum 8 characters).
          </p>
          <form onSubmit={handleSubmitPassword(onPasswordSubmit)} className="flex flex-col gap-4 max-w-md">
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Current Password</label>
              <Input
                {...registerPassword('old_password')}
                type="password"
                error={passwordErrors.old_password?.message}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">New Password</label>
              <Input
                {...registerPassword('new_password')}
                type="password"
                error={passwordErrors.new_password?.message}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Confirm New Password</label>
              <Input
                {...registerPassword('confirm_password')}
                type="password"
                error={passwordErrors.confirm_password?.message}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" variant="primary" size="sm" isLoading={isSubmittingPassword}>
                Update Password
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. AUTOMATED REMINDERS & NOTIFICATION SCHEDULE TAB       */}
      {/* ======================================================== */}
      {activeTab === 'reminders' && (
        <div className="flex flex-col gap-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h3 className="font-bold text-sm text-text-primary mb-1">Automated Engineering Reminders</h3>
            <p className="text-xs text-text-muted">
              Scheduled notification system designed to keep engineers aligned on daily goals and bench progress.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50">
              <div className="flex items-center gap-2 mb-2">
                <Sun className="w-4 h-4 text-amber-600" />
                <h4 className="font-bold text-xs text-amber-900">Morning Login &amp; Day Plan (8:30 – 9:30 AM)</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Sends an automated reminder to all engineers who have not logged in by 9:30 AM, directing them to open their Day Plan, check priority tasks, and set their focus agenda.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/50">
              <div className="flex items-center gap-2 mb-2">
                <Sunset className="w-4 h-4 text-orange-600" />
                <h4 className="font-bold text-xs text-orange-900">Evening Push &amp; Bench Notes (4:00 – 5:30 PM)</h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Reminds engineers to push all local Git commits and document today's bench progress. At 5:30 PM, pending tasks with zero updates are escalated with Project Managers in CC.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
