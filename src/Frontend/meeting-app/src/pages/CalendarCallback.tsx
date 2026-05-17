import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { calendarAPI, getOrganizationScopedPath } from '../services/api';

export default function CalendarCallback() {
  const { provider = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Finishing calendar connection...');
  const [error, setError] = useState('');

  useEffect(() => {
    const completeConnection = async () => {
      const oauthError = searchParams.get('error');
      if (oauthError) {
        setError(searchParams.get('error_description') || oauthError);
        setStatus('');
        return;
      }

      const code = searchParams.get('code');
      if (!code) {
        setError('Calendar authorization code was not returned.');
        setStatus('');
        return;
      }

      try {
        const normalizedProvider = provider.toLowerCase();
        const redirectUri = `${window.location.origin}/calendar/callback/${normalizedProvider}`;
        await calendarAPI.completeConnection(normalizedProvider, code, redirectUri);
        setStatus('Calendar connected. Syncing your meetings...');
        window.setTimeout(() => navigate(getOrganizationScopedPath('/dashboard'), { replace: true }), 900);
      } catch (err: any) {
        setError(err.response?.data?.message || err.response?.data || 'Unable to finish calendar connection.');
        setStatus('');
      }
    };

    completeConnection();
  }, [navigate, provider, searchParams]);

  return (
    <AppShell active="calendar" title="Samvaad" subtitle="Calendar sync">
      <div className="flex h-full items-center justify-center bg-slate-100 px-6">
        <section className="w-full max-w-xl rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-indigo-600 text-lg font-bold text-white">
            {provider ? provider[0]?.toUpperCase() : 'C'}
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-950">
            {error ? 'Calendar connection failed' : 'Calendar connection'}
          </h1>
          {status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
          {error && (
            <>
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={() => navigate(getOrganizationScopedPath('/dashboard'), { replace: true })}
                className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Back to calendar
              </button>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
