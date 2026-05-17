import { useEffect, useRef, useState } from 'react';
import { resolveApiAssetUrl } from '../services/api';
import { SAMVAAD_THEMES, useSamvaadTheme } from './ThemeProvider';

export type UserStatus = 'Available' | 'Busy' | 'DoNotDisturb' | 'BeRightBack' | 'Away' | 'Offline';

export const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: 'Available', label: 'Available' },
  { value: 'Busy', label: 'Busy' },
  { value: 'DoNotDisturb', label: 'Do not disturb' },
  { value: 'BeRightBack', label: 'Be right back' },
  { value: 'Away', label: 'Away' },
  { value: 'Offline', label: 'Appear offline' },
];

const STATUS_STYLES: Record<UserStatus, { dot: string; badge: string }> = {
  Available: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  Busy: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  DoNotDisturb: {
    dot: 'bg-red-600',
    badge: 'bg-red-50 text-red-700 ring-red-200',
  },
  BeRightBack: {
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  Away: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  Offline: {
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
};

export function normalizeStatus(status?: string): UserStatus {
  return STATUS_OPTIONS.some((option) => option.value === status)
    ? status as UserStatus
    : 'Available';
}

export function statusLabel(status?: string) {
  const normalized = normalizeStatus(status);
  return STATUS_OPTIONS.find((option) => option.value === normalized)?.label || 'Available';
}

export function statusDotClass(status?: string) {
  return STATUS_STYLES[normalizeStatus(status)].dot;
}

function getInitials(name?: string, email?: string) {
  const source = name?.trim() || email?.trim() || 'User';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  displayName,
  email,
  profilePictureUrl,
  status,
  showStatus = false,
  size = 'md',
  dark = false,
}: {
  displayName?: string;
  email?: string;
  profilePictureUrl?: string;
  status?: string;
  showStatus?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dark?: boolean;
}) {
  const imageUrl = resolveApiAssetUrl(profilePictureUrl);
  const sizeClass = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-14 w-14 text-lg',
    xl: 'h-24 w-24 text-3xl',
  }[size];
  const dotClass = {
    sm: 'h-2.5 w-2.5 border-2',
    md: 'h-3 w-3 border-2',
    lg: 'h-4 w-4 border-2',
    xl: 'h-5 w-5 border-[3px]',
  }[size];

  return (
    <span className={`relative flex shrink-0 items-center justify-center rounded-full font-semibold text-slate-700 ${sizeClass}`}>
      <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full bg-slate-200">
        {getInitials(displayName, email)}
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        )}
      </span>
      {showStatus && (
        <span className={`absolute bottom-0 right-0 rounded-full ${dark ? 'border-slate-800' : 'border-white'} ${dotClass} ${statusDotClass(status)}`} />
      )}
    </span>
  );
}

function StatusIcon({ status }: { status?: string }) {
  const normalized = normalizeStatus(status);
  const baseClass = 'relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full';

  if (normalized === 'Available') {
    return (
      <span className={`${baseClass} bg-emerald-600`}>
        <span className="absolute h-2.5 w-1.5 rotate-45 border-b-2 border-r-2 border-white" />
      </span>
    );
  }

  if (normalized === 'Busy') {
    return <span className={`${baseClass} bg-rose-500`} />;
  }

  if (normalized === 'DoNotDisturb') {
    return (
      <span className={`${baseClass} bg-red-600`}>
        <span className="h-0.5 w-2.5 rounded bg-white" />
      </span>
    );
  }

  if (normalized === 'BeRightBack' || normalized === 'Away') {
    return (
      <span className={`${baseClass} bg-amber-500`}>
        <span className="absolute h-2 w-0.5 -translate-y-0.5 rounded bg-white" />
        <span className="absolute h-0.5 w-2 translate-x-0.5 translate-y-1 rounded bg-white" />
      </span>
    );
  }

  return (
    <span className={`${baseClass} border border-slate-400 bg-white`}>
      <span className="absolute h-0.5 w-2.5 rotate-45 rounded bg-slate-500" />
      <span className="absolute h-0.5 w-2.5 -rotate-45 rounded bg-slate-500" />
    </span>
  );
}

export function UserStatusBadge({ status, compact = false, dark = false }: { status?: string; compact?: boolean; dark?: boolean }) {
  const normalized = normalizeStatus(status);
  const style = STATUS_STYLES[normalized];

  if (compact) {
    return <span title={statusLabel(normalized)} className={`inline-block h-2.5 w-2.5 rounded-full ${style.dot}`} />;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${dark ? 'bg-white/10 text-white ring-white/20' : style.badge}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {statusLabel(normalized)}
    </span>
  );
}

interface AccountMenuItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePictureUrl?: string;
  status?: string;
}

export function ProfileStatusMenu({
  displayName,
  email,
  profilePictureUrl,
  status,
  currentUserId,
  accounts = [],
  onChange,
  disabled,
  dark = false,
  avatarUploading = false,
  onSignOut,
  onSwitchAccount,
  onAddAccount,
  onAvatarChange,
  onAvatarRemove,
}: {
  displayName: string;
  email?: string;
  profilePictureUrl?: string;
  status?: string;
  currentUserId?: string;
  accounts?: AccountMenuItem[];
  onChange: (status: UserStatus) => void;
  disabled?: boolean;
  dark?: boolean;
  avatarUploading?: boolean;
  onSignOut?: () => void;
  onSwitchAccount?: (userId: string) => void;
  onAddAccount?: () => void;
  onAvatarChange?: (file: File) => void | Promise<void>;
  onAvatarRemove?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const normalized = normalizeStatus(status);
  const { theme, setTheme } = useSamvaadTheme();

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', closeOnOutsideClick);
    return () => window.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  const chooseStatus = (nextStatus: UserStatus) => {
    onChange(nextStatus);
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm shadow-sm disabled:opacity-50 ${
          dark
            ? 'border-white/10 bg-slate-800 text-white hover:bg-slate-700'
            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
        }`}
      >
        <UserAvatar
          displayName={displayName}
          email={email}
          profilePictureUrl={profilePictureUrl}
          status={normalized}
          showStatus
          dark={dark}
        />
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[150px] truncate font-semibold">{displayName}</span>
          <span className={`block text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{statusLabel(normalized)}</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[calc(100vh-7rem)] w-80 overflow-y-auto overscroll-contain rounded-md border border-slate-200 bg-white py-3 text-slate-900 shadow-2xl sm:max-h-[calc(100vh-6rem)]">
          <div className="flex items-center justify-between px-4">
            <p className="text-sm font-semibold">Personal</p>
            {onSignOut && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="text-sm text-slate-600 hover:text-slate-950"
              >
                Sign out
              </button>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3 px-4">
            <UserAvatar
              displayName={displayName}
              email={email}
              profilePictureUrl={profilePictureUrl}
              status={normalized}
              showStatus
              size="lg"
            />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{displayName}</p>
              {email && <p className="truncate text-sm text-slate-600">{email}</p>}
              {(onAvatarChange || onAvatarRemove) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {onAvatarChange && (
                    <>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void Promise.resolve(onAvatarChange(file)).catch(() => undefined);
                          }
                          event.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        disabled={avatarUploading}
                        onClick={() => avatarInputRef.current?.click()}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {avatarUploading ? 'Uploading...' : profilePictureUrl ? 'Change avatar' : 'Upload avatar'}
                      </button>
                    </>
                  )}
                  {onAvatarRemove && profilePictureUrl && (
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={() => void Promise.resolve(onAvatarRemove()).catch(() => undefined)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {(accounts.length > 0 || onAddAccount) && (
            <div className="mt-5 border-t border-slate-100 pt-2">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts</p>
              <div className="space-y-1 px-3">
                {accounts.map((account) => {
                  const accountName = `${account.firstName} ${account.lastName}`.trim() || account.email;
                  const isCurrent = account.id === currentUserId;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => {
                        setOpen(false);
                        onSwitchAccount?.(account.id);
                      }}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm ${
                        isCurrent ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-100'
                      }`}
                    >
                      <UserAvatar
                        displayName={accountName}
                        email={account.email}
                        profilePictureUrl={account.profilePictureUrl}
                        status={account.status}
                        showStatus
                        size="md"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{accountName}</span>
                        <span className="block truncate text-xs text-slate-500">{account.email}</span>
                      </span>
                      {isCurrent && <span className="text-xs font-semibold text-blue-700">Current</span>}
                    </button>
                  );
                })}

                {onAddAccount && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onAddAccount();
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-lg">+</span>
                    Add another account
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-slate-100 pt-3">
            <div className="px-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appearance</p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 px-3">
              {SAMVAAD_THEMES.map((option) => {
                const selected = option.id === theme;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTheme(option.id)}
                    className={`rounded-md border px-3 py-2 text-left transition ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                    aria-pressed={selected}
                  >
                    <span className="mb-2 flex items-center gap-1.5">
                      {option.swatches.map((color) => (
                        <span
                          key={color}
                          className="h-4 w-4 rounded-full border border-slate-200"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-2">
            <div className="flex items-center justify-between px-4 py-2 text-base">
              <span className="flex items-center gap-3">
                <StatusIcon status={normalized} />
                {statusLabel(normalized)}
              </span>
              <span className="text-xl text-slate-500">{'>'}</span>
            </div>

            <div className="mx-3 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
              {STATUS_OPTIONS.map((option) => {
                const selected = option.value === normalized;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => chooseStatus(option.value)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-base hover:bg-slate-100 ${
                      selected ? 'bg-slate-100 font-medium outline outline-2 outline-slate-900' : ''
                    }`}
                  >
                    <StatusIcon status={option.value} />
                    {option.label}
                  </button>
                );
              })}

              <div className="mt-2 border-t border-slate-200 pt-2">
                <button
                  type="button"
                  onClick={() => chooseStatus('Available')}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-base text-slate-700 hover:bg-slate-100"
                >
                  <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-400">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-slate-500 border-r-transparent" />
                  </span>
                  Reset status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
