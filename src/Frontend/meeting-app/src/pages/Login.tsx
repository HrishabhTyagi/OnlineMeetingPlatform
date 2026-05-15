import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';

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
  const isAddingAccount = new URLSearchParams(location.search).get('addAccount') === '1';
  const currentName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.email : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(formData.email, formData.password);
      const data = response.data;

      login(
        {
          id: data.userId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          profilePictureUrl: data.profilePictureUrl,
          status: data.status || 'Available',
          isEmailVerified: true,
          createdAt: new Date().toISOString(),
        },
        data.token
      );

      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h2 className="text-3xl font-bold mb-2 text-center text-gray-800">{isAddingAccount ? 'Add Account' : 'Sign In'}</h2>
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
                    navigate('/dashboard', { replace: true });
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

        <p className="mt-4 text-center text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 hover:underline">
            Create one
          </Link>
        </p>
        {currentUser && (
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="mt-3 w-full text-sm font-semibold text-gray-600 hover:text-gray-900"
          >
            Back to current account
          </button>
        )}
      </div>
    </div>
  );
}
