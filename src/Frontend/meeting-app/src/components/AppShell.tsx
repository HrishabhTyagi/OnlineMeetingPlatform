import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

type AppSection = 'calendar' | 'chat' | 'meet';

interface AppShellProps {
  active: AppSection;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

const navItems: Array<{ id: AppSection; label: string; path: string; short: string }> = [
  { id: 'calendar', label: 'Calendar', path: '/dashboard', short: 'Calendar' },
  { id: 'chat', label: 'Chat', path: '/chat', short: 'Chat' },
  { id: 'meet', label: 'New meeting', path: '/create-meeting', short: 'Meet' },
];

export default function AppShell({ active, title, subtitle, actions, children }: AppShellProps) {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-950">
      <div className="grid h-full grid-cols-[80px_minmax(0,1fr)]">
        <nav className="flex flex-col items-center gap-2 border-r border-slate-200 bg-slate-50 px-2 py-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white shadow-sm"
            title="Meeting Platform"
          >
            MP
          </button>
          {navItems.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                className={`flex h-12 w-full flex-col items-center justify-center rounded-md text-[11px] font-semibold transition ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-slate-600 hover:bg-white hover:text-slate-950'
                }`}
                title={item.label}
              >
                <span>{item.short}</span>
              </button>
            );
          })}
        </nav>

        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-[72px] items-center justify-between border-b border-slate-200 bg-white px-6">
            <div className="min-w-0">
              {subtitle && <p className="text-xs font-semibold text-indigo-700">{subtitle}</p>}
              <h1 className="truncate text-xl font-semibold text-slate-950">{title}</h1>
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
