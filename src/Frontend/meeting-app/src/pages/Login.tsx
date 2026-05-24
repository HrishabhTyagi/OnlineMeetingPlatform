import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../components/BrandMark';
import { authAPI, getOrganizationScopedPath } from '../services/api';
import { useAuthStore } from '../store/authStore';

const MFA_REMEMBER_DEVICES_KEY = 'samvaadMfaRememberedDevices';

function getRememberedMfaToken(email: string) {
  try {
    const devices = JSON.parse(localStorage.getItem(MFA_REMEMBER_DEVICES_KEY) || '{}');
    return devices[email.trim().toLowerCase()] || null;
  } catch {
    return null;
  }
}

function saveRememberedMfaToken(email: string, token?: string | null) {
  if (!token) {
    return;
  }

  try {
    const devices = JSON.parse(localStorage.getItem(MFA_REMEMBER_DEVICES_KEY) || '{}');
    devices[email.trim().toLowerCase()] = token;
    localStorage.setItem(MFA_REMEMBER_DEVICES_KEY, JSON.stringify(devices));
  } catch {
    // Remembering a trusted device is optional; login still succeeds without local storage.
  }
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const accounts = useAuthStore((state) => state.accounts);
  const currentUser = useAuthStore((state) => state.user);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string; email: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const isAddingAccount = new URLSearchParams(location.search).get('addAccount') === '1';
  const currentName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.email : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const completeLogin = (data: any) => {
    login(
      {
        id: data.userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        profilePictureUrl: data.profilePictureUrl,
        status: data.status || 'Available',
        mfaEnabled: data.mfaEnabled,
        isEmailVerified: true,
        createdAt: new Date().toISOString(),
      },
      data.token
    );

    navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
  };

  const getErrorMessage = (err: any, fallback: string) => {
    if (typeof err.response?.data === 'string') {
      return err.response.data;
    }

    return err.response?.data?.message || fallback;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(
        formData.email,
        formData.password,
        getRememberedMfaToken(formData.email)
      );
      const data = response.data;

      if (data.requiresMfa && data.mfaToken) {
        setMfaChallenge({ token: data.mfaToken, email: data.email || formData.email });
        setMfaCode('');
        return;
      }

      completeLogin(data);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) {
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await authAPI.verifyMfa(mfaChallenge.token, mfaCode, rememberDevice);
      if (rememberDevice) {
        saveRememberedMfaToken(mfaChallenge.email, response.data.rememberDeviceToken);
      }

      completeLogin(response.data);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Unable to verify MFA code'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-violet-600 to-teal-500 px-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandMark markClassName="h-12 w-12" nameClassName="text-3xl font-bold text-slate-900" />
          <h2 className="text-xl font-semibold text-gray-800">{isAddingAccount ? 'Add account' : 'Sign in'}</h2>
        </div>
        {currentUser && (
          <p className="mb-6 text-center text-sm text-gray-600">
            {isAddingAccount ? `Current account: ${currentName}` : `Signed in as ${currentName}`}
          </p>
        )}

        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

        {accounts.length > 0 && (
          <div className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saved accounts</p>
            {accounts.map((account) => {
              const accountName = `${account.user.firstName} ${account.user.lastName}`.trim() || account.user.email;
              const isCurrent = account.user.id === currentUser?.id;
              return (
                <button
                  key={account.user.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    switchAccount(account.user.id);
                    navigate(getOrganizationScopedPath('/dashboard'), { replace: true });
                  }}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    isCurrent ? 'bg-blue-50 text-blue-900' : 'bg-white text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  <span className="block font-semibold">{accountName}</span>
                  <span className="block text-xs text-gray-500">{account.user.email}{isCurrent ? ' - current' : ''}</span>
                </button>
              );
            })}
          </div>
        )}

        {!mfaChallenge ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Enter the 6-digit authenticator code, or one of your recovery codes.
            </div>

            <input
              type="text"
              inputMode="text"
              autoFocus
              placeholder="Authenticator or recovery code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              Remember this device for 30 days
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify and sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMfaChallenge(null);
                setMfaCode('');
              }}
              className="w-full rounded-lg border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Use a different password
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 hover:underline">
            Create one
          </Link>
        </p>
        {currentUser && (
          <button
            type="button"
            onClick={() => navigate(getOrganizationScopedPath('/dashboard'), { replace: true })}
            className="mt-3 w-full text-sm font-semibold text-gray-600 hover:text-gray-900"
          >
            Back to current account
          </button>
        )}
      </div>
    </div>
  );
}
