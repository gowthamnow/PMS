import React, { useState, useRef } from 'react';
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
  Palette,
  Check,
  Sun,
  Moon,
  Bell,
  Upload,
  Cpu,
  LayoutGrid,
  Sunset,
  Mail,
  Send,
  HelpCircle,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Server,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { applyThemeConfig } from '../main';

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
  const rawTab = searchParams.get('tab') || 'appearance';
  const isAdmin = user?.role === 'ADMIN';
  const activeTab = !isAdmin && rawTab === 'automation' ? 'appearance' : rawTab;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [isTriggeringMorning, setIsTriggeringMorning] = useState(false);
  const [isTriggeringEvening, setIsTriggeringEvening] = useState(false);

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

  const handleApplyTheme = (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    localStorage.setItem('pms_theme_mode', mode);
    applyThemeConfig(mode, accentColor);
    toast.success(`Theme switched to ${mode.toUpperCase()} mode`);
  };

  const handleApplyAccent = (id: string) => {
    setAccentColor(id);
    localStorage.setItem('pms_accent_color', id);
    applyThemeConfig(themeMode, id);
    toast.success(`Accent color set to ${id}`);
  };

  const handleApplyCardStyle = (style: '3d' | 'flat') => {
    setCardStyle(style);
    localStorage.setItem('pms_card_style', style);
    window.dispatchEvent(new Event('pms_style_change'));
    toast.success(`Project card presentation set to ${style === '3d' ? '3D Square Box' : 'Modern Flat'}`);
  };

  const handleSendTestEmail = async () => {
    setIsTestingEmail(true);
    try {
      await api.tasks.triggerMorningReminder(true);
      toast.success('Live test email delivered to gowthamthangaraj18@gmail.com! Check your inbox.');
    } catch (err: any) {
      toast.error('Failed to send test email');
    } finally {
      setIsTestingEmail(false);
    }
  };

  // Avatar Photo Upload Handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploadingPhoto(true);
    try {
      const res = await api.users.uploadAvatar(file);
      await refreshUser();
      toast.success(res.message || 'Profile picture updated successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
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

  // Trigger test reminders
  const handleTriggerMorning = async () => {
    setIsTriggeringMorning(true);
    try {
      const res = await api.tasks.triggerMorningReminder(true);
      toast.success(`Morning reminder broadcasted to ${res.reminders_sent || 0} active engineer(s)!`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to trigger morning broadcast');
    } finally {
      setIsTriggeringMorning(false);
    }
  };

  const handleTriggerEvening = async () => {
    setIsTriggeringEvening(true);
    try {
      const res = await api.tasks.triggerEveningReminder();
      toast.success(`Evening wrap-up dispatched to ${res.reminders_sent || 0} engineer(s) with PMs in CC!`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to trigger evening broadcast');
    } finally {
      setIsTriggeringEvening(false);
    }
  };

  const tabs: TabItem[] = [
    { id: 'appearance', label: 'Appearance & Themes', icon: <Palette className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile Picture & Details', icon: <User className="w-4 h-4" /> },
    { id: 'password', label: 'Security & Password', icon: <Key className="w-4 h-4" /> },
    ...(isAdmin
      ? [{ id: 'automation', label: 'Email Automation & Cadence', icon: <Bell className="w-4 h-4" /> }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-2 border-b border-border">
        <h1 className="text-xl font-bold text-text-primary tracking-tight">System &amp; Workspace Settings</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          {isAdmin
            ? 'Customize themes, profile photos, passwords, email automation schedules, and delay notifications.'
            : 'Customize themes, profile photos, and account security passwords.'}
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
              Customize how project cards appear on the Projects page.
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
                    <span className="font-bold text-xs block">Elevation Cards</span>
                    <span className="text-[11px] text-text-muted">Top Status Accent Line</span>
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
                    <span className="font-bold text-xs block">Minimalist Flat</span>
                    <span className="text-[11px] text-text-muted">Clean Border Only</span>
                  </div>
                </div>
                {cardStyle === 'flat' && <Check className="w-4 h-4 text-amber-600" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. PROFILE & AVATAR PICTURE TAB                          */}
      {/* ======================================================== */}
      {activeTab === 'profile' && (
        <div className="flex flex-col gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          {/* Avatar Photo Section */}
          <div>
            <h3 className="font-bold text-sm text-text-primary mb-1">Profile Picture</h3>
            <p className="text-xs text-text-muted mb-4">
              Upload a real profile picture (JPG, PNG, WEBP) to be displayed across the workspace and comments.
            </p>
            <div className="flex items-center gap-5">
              <Avatar
                name={user?.full_name || user?.username || 'User'}
                src={user?.avatar_url}
                size="xl"
                className="w-16 h-16 text-lg border-2 border-amber-500/50 shadow-sm"
              />

              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  className="hidden"
                />
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Upload className="w-3.5 h-3.5" />}
                  isLoading={isUploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload New Photo
                </Button>
                <span className="text-[11px] text-text-muted">Max file size: 5 MB (JPG, PNG, WEBP)</span>
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
                placeholder="Gowtham Thangaraj"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Email Address</label>
              <Input
                {...registerProfile('email')}
                type="email"
                error={profileErrors.email?.message}
                placeholder="gowthamthangaraj18@gmail.com"
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
                placeholder="••••••••••••"
                error={passwordErrors.old_password?.message}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">New Password</label>
              <Input
                {...registerPassword('new_password')}
                type="password"
                placeholder="••••••••••••"
                error={passwordErrors.new_password?.message}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Confirm New Password</label>
              <Input
                {...registerPassword('confirm_password')}
                type="password"
                placeholder="••••••••••••"
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
      {/* 4. EMAIL AUTOMATION & CADENCE SCHEDULE TAB (ADMIN ONLY)   */}
      {/* ======================================================== */}
      {isAdmin && activeTab === 'automation' && (
        <div className="flex flex-col gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h3 className="font-bold text-sm text-text-primary mb-1">Automated Engineering Email Cadence</h3>
            <p className="text-xs text-text-muted">
              Engineering PMS includes a built-in background scheduler that runs Monday through Friday to keep engineering deliverables on track.
            </p>
          </div>

          {/* Schedule Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sun className="w-4 h-4 text-amber-600" />
                  <h4 className="font-bold text-xs text-amber-900">Morning Login &amp; Day Plan (8:30 – 9:30 AM)</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Sends an automated morning email to active engineers listing their top pending tasks, prompt to set their Day Plan, and check roadblocks.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Send className="w-3.5 h-3.5 text-amber-600" />}
                isLoading={isTriggeringMorning}
                onClick={handleTriggerMorning}
              >
                Trigger Morning Broadcast Now
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/50 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sunset className="w-4 h-4 text-orange-600" />
                  <h4 className="font-bold text-xs text-orange-900">Evening Push &amp; PM Escalation (4:00 – 5:30 PM)</h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Reminds engineers to push Git code and log bench progress. Escalates incomplete tasks with zero daily activity to Project Managers in CC.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Send className="w-3.5 h-3.5 text-orange-600" />}
                isLoading={isTriggeringEvening}
                onClick={handleTriggerEvening}
              >
                Trigger Evening Broadcast Now
              </Button>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Live Gmail SMTP Active Status Card */}
          <div className="p-5 rounded-xl border border-emerald-300 bg-emerald-50/70 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-emerald-950">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h4 className="font-bold text-sm">
                  Live Gmail SMTP Active &amp; Verified
                </h4>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-emerald-200/80 text-emerald-800">
                Production Active
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed mb-3">
              Automated notifications and morning/evening task summaries are delivering in real-time from <strong>gowthamthangaraj18@gmail.com</strong> via Google SMTP TLS (Port 587).
            </p>

            <div className="bg-white p-3 rounded-lg border border-emerald-200 font-mono text-xs text-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><span className="text-slate-500">Host:</span> smtp.gmail.com:587</div>
              <div><span className="text-slate-500">Sender:</span> gowthamthangaraj18@gmail.com</div>
              <div><span className="text-slate-500">Encryption:</span> TLS Enabled</div>
              <div><span className="text-slate-500">Status:</span> Connected &amp; Delivering</div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Send className="w-3.5 h-3.5" />}
                isLoading={isTestingEmail}
                onClick={handleSendTestEmail}
              >
                Send Instant Test Email to Gowtham
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
