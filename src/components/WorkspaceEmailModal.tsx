import React, { useState, useEffect } from 'react';
import { Mail, ArrowRightLeft, Cloud, X, Check } from 'lucide-react';
import { isValidWorkspaceEmail, normalizeWorkspaceEmail } from '../lib/workspaceId.ts';

export function WorkspaceEmailGate({
  recentEmails,
  loading,
  errorMessage,
  onSubmitEmail,
}: {
  recentEmails: string[];
  loading: boolean;
  errorMessage: string | null;
  onSubmitEmail: (email: string) => Promise<void>;
}) {
  const [emailInput, setEmailInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeWorkspaceEmail(emailInput);
    if (!isValidWorkspaceEmail(cleaned)) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    setLocalError(null);
    await onSubmitEmail(cleaned);
  };

  const displayError = localError || errorMessage;

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-dvh bg-[#09090B] text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#111115] border border-zinc-800/90 rounded-xl p-6 sm:p-7 space-y-6 shadow-2xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-red-400">
            <Cloud className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Cloud Email Workspace
            </span>
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">MUSE SALES MANAGER</h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Enter your email address to load your saved cloud workspace or create a new private
            workspace. Use the same email on any browser or device to access your records.
          </p>
        </div>

        {displayError && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg p-3"
          >
            {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="workspace-entry-email" className="block text-xs font-medium text-zinc-300">
              Your Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="workspace-entry-email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder="you@example.com"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Loading Cloud Workspace...' : 'Open Workspace'}
          </button>
        </form>

        {recentEmails.length > 0 && (
          <div className="pt-4 border-t border-zinc-800/80 space-y-2">
            <p className="text-[11px] font-medium text-zinc-500">Recent Emails on This Browser</p>
            <div className="space-y-1.5">
              {recentEmails.map((em) => (
                <button
                  key={em}
                  type="button"
                  disabled={loading}
                  onClick={() => onSubmitEmail(em)}
                  className="w-full text-left px-3 py-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/90 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors truncate"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SwitchEmailModal({
  open,
  currentEmail,
  recentEmails,
  switching,
  onSwitchEmail,
  onClose,
}: {
  open: boolean;
  currentEmail: string;
  recentEmails: string[];
  switching: boolean;
  onSwitchEmail: (email: string) => Promise<void>;
  onClose: () => void;
}) {
  const [nextEmail, setNextEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNextEmail('');
    setError(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !switching) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, switching, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeWorkspaceEmail(nextEmail);
    if (!isValidWorkspaceEmail(cleaned)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (cleaned === normalizeWorkspaceEmail(currentEmail)) {
      setError('You are already viewing this email workspace.');
      return;
    }
    setError(null);
    try {
      await onSwitchEmail(cleaned);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch email workspace.');
    }
  };

  const otherRecent = recentEmails.filter(
    (em) => normalizeWorkspaceEmail(em) !== normalizeWorkspaceEmail(currentEmail)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget && !switching) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-email-title"
        className="w-full max-w-md bg-[#111115] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden my-auto"
      >
        <div className="px-5 py-4 border-b border-zinc-800/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-red-400 shrink-0" />
            <h2 id="switch-email-title" className="text-sm font-semibold text-white">
              Switch Workspace Email
            </h2>
          </div>
          <button
            type="button"
            disabled={switching}
            onClick={onClose}
            aria-label="Close switch email dialog"
            className="p-1 text-zinc-400 hover:text-white rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-zinc-500">Current Email</p>
              <p className="text-xs font-mono font-medium text-white truncate">{currentEmail}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 shrink-0">
              <Check className="w-3 h-3" />
              Active
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg p-3"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="switch-email-input" className="block text-xs font-medium text-zinc-300">
                Enter Email Address to Load or Create
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="switch-email-input"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={nextEmail}
                  onChange={(e) => {
                    setNextEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="another@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-zinc-500"
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                Each email has its own completely separate cloud database. Switching immediately
                loads that email&apos;s saved data.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={switching}
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={switching}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                {switching ? 'Switching...' : 'Switch Email'}
              </button>
            </div>
          </form>

          {otherRecent.length > 0 && (
            <div className="pt-3 border-t border-zinc-800/80 space-y-2">
              <p className="text-[11px] font-medium text-zinc-500">Quick Switch</p>
              <div className="space-y-1.5">
                {otherRecent.map((em) => (
                  <button
                    key={em}
                    type="button"
                    disabled={switching}
                    onClick={async () => {
                      setError(null);
                      try {
                        await onSwitchEmail(em);
                        onClose();
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : 'Unable to switch email workspace.'
                        );
                      }
                    }}
                    className="w-full text-left px-3 py-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/90 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{em}</span>
                    <span className="text-[11px] text-zinc-500 shrink-0">Load</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
