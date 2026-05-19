import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandMark from './BrandMark';
import { getActiveOrganization, getOrganizationScopedPath, type ActiveOrganization } from '../services/api';

type AppSection = 'activity' | 'teams' | 'calendar' | 'chat' | 'meet' | 'license';

interface AppShellProps {
  active: AppSection;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4.5 12.5h3l2-6 4 11 2-5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 5.5v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.2 9.5A7.5 7.5 0 1 0 19 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-5 4v-4.2A3.5 3.5 0 0 1 3.5 11.5v-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 8h8M8 11h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TeamsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M8.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 20a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 10.5a3 3 0 1 0 0-6M14.5 14.2A5 5 0 0 1 21 19.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.5 9.5h5M15 7v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MeetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h7A2.5 2.5 0 0 1 17 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 5 16.5v-9Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m17 10 3.5-2v8L17 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 8.5v7M7.5 12H14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LicenseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M12 3.5 19 6v5.5c0 4.4-2.7 7.6-7 9-4.3-1.4-7-4.6-7-9V6l7-2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 12.2 10.8 14.5l4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const navItems: Array<{ id: AppSection; label: string; path: string; icon: ReactNode; global?: boolean }> = [
  { id: 'activity', label: 'Today', path: '/activity', icon: <ActivityIcon /> },
  { id: 'teams', label: 'Spaces', path: '/teams', icon: <TeamsIcon /> },
  { id: 'calendar', label: 'Plan', path: '/dashboard', icon: <CalendarIcon /> },
  { id: 'chat', label: 'Talk', path: '/chat', icon: <ChatIcon /> },
  { id: 'meet', label: 'Meet', path: '/meet', icon: <MeetIcon /> },
  { id: 'license', label: 'License', path: '/license', icon: <LicenseIcon />, global: true },
];

export default function AppShell({ active, title, subtitle, actions, children }: AppShellProps) {
  const navigate = useNavigate();
  const [activeOrganization, setActiveOrganizationState] = useState<ActiveOrganization | null>(() => getActiveOrganization());

  useEffect(() => {
    const syncOrganization = () => setActiveOrganizationState(getActiveOrganization());
    window.addEventListener('samvaad-organization-changed', syncOrganization);
    window.addEventListener('storage', syncOrganization);
    return () => {
      window.removeEventListener('samvaad-organization-changed', syncOrganization);
      window.removeEventListener('storage', syncOrganization);
    };
  }, []);

  return (
    <div className="samvaad-shell h-screen overflow-hidden text-slate-950">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <header className="samvaad-shell-header relative z-30 shrink-0 border-b border-slate-200 shadow-sm">
          <div className="flex min-h-[52px] items-center gap-3 px-3 py-2 lg:px-4">
            <button
              type="button"
              onClick={() => navigate(getOrganizationScopedPath('/dashboard', activeOrganization))}
              className="shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-300"
              title="Samvaad home"
            >
              <BrandMark markClassName="h-8 w-8" nameClassName="text-base font-bold text-slate-950" />
            </button>

            <div className="hidden min-w-[108px] border-l border-slate-200 pl-3 lg:block">
              {subtitle && <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">{subtitle}</p>}
              <h1 className="truncate text-sm font-semibold leading-5 text-slate-950">{title}</h1>
            </div>

            <nav className="samvaad-module-strip min-w-0 flex-1 overflow-x-auto rounded-md p-1" aria-label="Primary">
              <div className="flex min-w-max gap-1">
                {navItems.map((item) => {
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.global ? item.path : getOrganizationScopedPath(item.path, activeOrganization))}
                      className={`group inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-semibold transition ${
                        isActive
                          ? 'bg-slate-950 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white hover:text-slate-950'
                      }`}
                      title={item.label}
                    >
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${
                        isActive ? 'bg-white/15 text-white' : 'bg-white text-teal-700 shadow-sm group-hover:text-slate-950'
                      }`}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {activeOrganization && (
              <span className="hidden max-w-[220px] truncate rounded-md border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 xl:inline-flex">
                {activeOrganization.name}
              </span>
            )}
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="samvaad-workspace min-h-0 flex-1 overflow-hidden p-2">
          <div className="h-full min-h-0 overflow-hidden rounded-md border border-slate-200 bg-white/70 shadow-sm">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
