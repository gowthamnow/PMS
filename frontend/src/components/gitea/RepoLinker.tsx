import React, { useState } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { GitBranch, Link2 } from 'lucide-react';

export interface RepoLinkerProps {
  onLink: (repoFullName: string, repoUrl: string) => Promise<void>;
  isLoading?: boolean;
}

export const RepoLinker: React.FC<RepoLinkerProps> = ({ onLink, isLoading = false }) => {
  const [repoFullName, setRepoFullName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoFullName.trim() || !repoUrl.trim()) {
      setError('Both repository full name (e.g. org/firmware-stm32) and URL are required.');
      return;
    }
    setError('');
    await onLink(repoFullName.trim(), repoUrl.trim());
    setRepoFullName('');
    setRepoUrl('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-4 border border-border rounded-lg flex flex-col gap-3 shadow-subtle"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-text-primary uppercase tracking-wider">
        <GitBranch className="w-4 h-4 text-copper-600" />
        Link Gitea Hardware/Firmware Repository
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          label="Repository Path (owner/repo)"
          placeholder="e.g. embedded/motor-controller-pcb"
          value={repoFullName}
          onChange={(e) => setRepoFullName(e.target.value)}
          required
        />
        <Input
          label="Clone / Browse URL"
          placeholder="http://localhost:3001/embedded/motor-controller-pcb"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          variant="primary"
          isLoading={isLoading}
          leftIcon={<Link2 className="w-3.5 h-3.5" />}
        >
          Link Repository
        </Button>
      </div>
    </form>
  );
};
