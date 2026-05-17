import { useEffect, useMemo, useState } from 'react';
import { calendarAPI } from '../services/api';

interface CalendarProviderConfig {
  provider: string;
  displayName: string;
  isConfigured: boolean;
  scopes: string[];
}

interface CalendarConnection {
  id: string;
  provider: string;
  accountEmail?: string;
  calendarId: string;
  isEnabled: boolean;
  lastSyncAt?: string;
  lastError?: string;
}

function CalendarProviderIcon({ provider }: { provider: string }) {
  const isGoogle = provider.toLowerCase() === 'google';
  return (
    <span
      className={`flex h-10 w-10 items-center justify-center rounded-md text-sm font-bold text-white ${
        isGoogle ? 'bg-emerald-600' : 'bg-blue-600'
      }`}
      aria-hidden="true"
    >
      {isGoogle ? 'G' : 'O'}
    </span>
  );
}

function formatLastSync(value?: string) {
  if (!value) {
    return 'Not synced yet';
  }

  return `Last synced ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))}`;
}

export default function CalendarSyncPanel() {
  const [providers, setProviders] = useState<CalendarProviderConfig[]>([]);
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const connectionByProvider = useMemo(() => {
    return connections.reduce<Record<string, CalendarConnection>>((map, connection) => {
      map[connection.provider.toLowerCase()] = connection;
      return map;
    }, {});
  }, [connections]);

  const loadCalendarSync = async () => {
    setLoading(true);
    setError('');
    try {
      const [providerResponse, connectionResponse] = await Promise.all([
        calendarAPI.getProviders(),
        calendarAPI.getConnections(),
      ]);
      setProviders(providerResponse.data || []);
      setConnections(connectionResponse.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data || 'Unable to load calendar sync settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendarSync();
  }, []);

  const connectProvider = async (provider: string) => {
    setBusyProvider(provider);
      setError('');
      setMessage('');
    try {
      const redirectUri = `${window.location.origin}/calendar/callback/${provider.toLowerCase()}`;
      const response = await calendarAPI.getAuthorizationUrl(provider, redirectUri);
      const authorizationUrl = response.data?.authorizationUrl || response.data?.AuthorizationUrl;
      if (!authorizationUrl) {
        throw new Error('Calendar authorization URL was not returned.');
      }

      window.location.assign(authorizationUrl);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data || err.message || 'Unable to start calendar connection.');
      setBusyProvider(null);
    }
  };

  const disconnectProvider = async (provider: string) => {
    setBusyProvider(provider);
    setError('');
    setMessage('');
    try {
      await calendarAPI.disconnect(provider);
      setMessage(`${provider} calendar disconnected.`);
      await loadCalendarSync();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data || 'Unable to disconnect calendar.');
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <section className="mb-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Calendar sync</h2>
          <p className="text-sm text-slate-500">
            Connect the calendar your team uses. Samvaad meetings will be created, updated, and cancelled there automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCalendarSync}
          className="self-start rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {loading ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            Loading calendar providers...
          </div>
        ) : (
          providers.map((provider) => {
            const connection = connectionByProvider[provider.provider.toLowerCase()];
            const isConnected = Boolean(connection);
            const busy = busyProvider?.toLowerCase() === provider.provider.toLowerCase();

            return (
              <div key={provider.provider} className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                <CalendarProviderIcon provider={provider.provider} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{provider.displayName}</p>
                      <p className="truncate text-sm text-slate-500">
                        {isConnected
                          ? `Connected as ${connection?.accountEmail || 'calendar account'}`
                          : provider.isConfigured ? 'Ready to connect' : 'OAuth app is not configured'}
                      </p>
                    </div>
                    {isConnected ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => disconnectProvider(provider.provider)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!provider.isConfigured || busy}
                        onClick={() => connectProvider(provider.provider)}
                        className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {busy ? 'Opening...' : 'Connect'}
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2 py-1 font-semibold ${
                      isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isConnected ? 'Connected' : 'Not connected'}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-600">
                      {provider.scopes.join(', ')}
                    </span>
                    {connection && (
                      <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-600">
                        {formatLastSync(connection.lastSyncAt)}
                      </span>
                    )}
                  </div>

                  {connection?.lastError && (
                    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {connection.lastError}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
