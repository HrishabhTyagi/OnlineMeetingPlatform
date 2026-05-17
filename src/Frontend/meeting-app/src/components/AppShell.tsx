import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandMark from './BrandMark';
import { getActiveOrganization, getOrganizationScopedPath, type ActiveOrganization } from '../services/api';

type AppSection = 'activity' | 'teams' | 'calendar' | 'chat' | 'meet';

interface AppShellProps {
  active: AppSection;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M4.5 12.5h3l2-6 4 11 2-5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 5.5v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.2 9.5A7.5 7.5 0 1 0 19 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-5 4v-4.2A3.5 3.5 0 0 1 3.5 11.5v-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 8h8M8 11h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TeamsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M8.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 20a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 10.5a3 3 0 1 0 0-6M14.5 14.2A5 5 0 0 1 21 19.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.5 9.5h5M15 7v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MeetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h7A2.5 2.5 0 0 1 17 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 5 16.5v-9Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="m17 10 3.5-2v8L17 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 8.5v7M7.5 12H14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const navItems: Array<{ id: AppSection; label: string; path: string; icon: ReactNode }> = [
  { id: 'activity', label: 'Activity', path: '/activity', icon: <ActivityIcon /> },
  { id: 'teams', label: 'Teams', path: '/teams', icon: <TeamsIcon /> },
  { id: 'calendar', label: 'Calendar', path: '/dashboard', icon: <CalendarIcon /> },
  { id: 'chat', label: 'Chat', path: '/chat', icon: <ChatIcon /> },
  { id: 'meet', label: 'Meet', path: '/meet', icon: <MeetIcon /> },
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
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-950">
      <div className="grid h-full min-h-0 grid-cols-[104px_minmax(0,1fr)] overflow-hidden">
        <nav className="relative z-30 flex min-h-0 flex-col items-center gap-2 overflow-y-auto border-r border-slate-200 bg-white px-2 py-3 shadow-sm">
          <button
            type="button"
            onClick={() => navigate(getOrganizationScopedPath('/dashboard', activeOrganization))}
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
            title="Samvaad"
          >
            <BrandMark showName={false} markClassName="h-11 w-11" />
          </button>
          {navItems.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(getOrganizationScopedPath(item.path, activeOrganization))}
                className={`flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-md text-xs font-semibold transition ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
                title={item.label}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <header className="flex min-h-[72px] items-center justify-between border-b border-slate-200 bg-white px-6">
            <div className="min-w-0">
              {subtitle && <p className="text-xs font-semibold text-indigo-700">{subtitle}</p>}
              <h1 className="truncate text-xl font-semibold text-slate-950">{title}</h1>
              {activeOrganization && (
                <p className="mt-1 truncate text-xs font-medium text-slate-500">
                  Hosted for {activeOrganization.name}
                </p>
              )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
          </header>
          <main className="min-h-0 flex-1 overflow-hidden">
            {children}
          </main>
        </section>
      </div>
    </div>
  );
}
