import { useEffect, useRef, useState } from 'react';

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

export function ProfileStatusMenu({
  displayName,
  email,
  status,
  onChange,
  disabled,
  dark = false,
  onSignOut,
}: {
  displayName: string;
  email?: string;
  status?: string;
  onChange: (status: UserStatus) => void;
  disabled?: boolean;
  dark?: boolean;
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const normalized = normalizeStatus(status);

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
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
          {getInitials(displayName, email)}
          <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 ${dark ? 'border-slate-800' : 'border-white'} ${statusDotClass(normalized)}`} />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[150px] truncate font-semibold">{displayName}</span>
          <span className={`block text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{statusLabel(normalized)}</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-slate-200 bg-white py-3 text-slate-900 shadow-2xl">
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
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-700">
              {getInitials(displayName, email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{displayName}</p>
              {email && <p className="truncate text-sm text-slate-600">{email}</p>}
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
