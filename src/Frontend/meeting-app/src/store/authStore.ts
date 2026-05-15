import create from 'zustand';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePictureUrl?: string;
  phoneNumber?: string;
  status?: string;
  isEmailVerified: boolean;
  createdAt: string;
}

export interface AuthAccount {
  user: User;
  token: string;
  lastUsedAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  accounts: AuthAccount[];
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  switchAccount: (userId: string) => void;
  removeAccount: (userId: string) => void;
  logout: () => void;
}

const ACTIVE_TOKEN_KEY = 'authToken';
const ACTIVE_USER_KEY = 'authUser';
const ACTIVE_ACCOUNT_ID_KEY = 'activeAuthAccountId';
const ACCOUNTS_KEY = 'authAccounts';

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function dedupeAccounts(accounts: AuthAccount[]) {
  const byUserId = new Map<string, AuthAccount>();
  accounts.forEach((account) => {
    if (!account.user?.id || !account.token) {
      return;
    }

    byUserId.set(account.user.id, account);
  });
  return Array.from(byUserId.values()).sort((left, right) => (
    new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime()
  ));
}

function persistActiveAccount(account: AuthAccount | null) {
  if (!account) {
    sessionStorage.removeItem(ACTIVE_ACCOUNT_ID_KEY);
    localStorage.removeItem(ACTIVE_TOKEN_KEY);
    localStorage.removeItem(ACTIVE_USER_KEY);
    return;
  }

  sessionStorage.setItem(ACTIVE_ACCOUNT_ID_KEY, account.user.id);
  localStorage.setItem(ACTIVE_TOKEN_KEY, account.token);
  localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(account.user));
}

function persistAccounts(accounts: AuthAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

const storedAccounts = readJson<AuthAccount[]>(ACCOUNTS_KEY, []);
const storedUser = readJson<User | null>(ACTIVE_USER_KEY, null);
const storedToken = localStorage.getItem(ACTIVE_TOKEN_KEY);
const sessionAccountId = sessionStorage.getItem(ACTIVE_ACCOUNT_ID_KEY);
const initialAccounts = dedupeAccounts([
  ...storedAccounts,
  ...(storedUser && storedToken ? [{ user: storedUser, token: storedToken, lastUsedAt: new Date().toISOString() }] : []),
]);
const activeAccount = (
  sessionAccountId ? initialAccounts.find((account) => account.user.id === sessionAccountId) : null
) || (
  storedUser ? initialAccounts.find((account) => account.user.id === storedUser.id) : null
) || initialAccounts[0] || null;

persistAccounts(initialAccounts);
persistActiveAccount(activeAccount);

export const useAuthStore = create<AuthState>((set) => ({
  user: activeAccount?.user || null,
  token: activeAccount?.token || null,
  accounts: initialAccounts,
  isAuthenticated: !!activeAccount?.token,
  setUser: (user) => {
    set((state) => {
      if (!user) {
        persistActiveAccount(null);
        return { user: null, token: null, isAuthenticated: false };
      }

      const existing = state.accounts.find((account) => account.user.id === user.id);
      const active = {
        user,
        token: existing?.token || state.token || '',
        lastUsedAt: existing?.lastUsedAt || new Date().toISOString(),
      };
      const accounts = dedupeAccounts([
        active,
        ...state.accounts.filter((account) => account.user.id !== user.id),
      ]);

      persistAccounts(accounts);
      persistActiveAccount(active);
      return { user, accounts };
    });
  },
  setToken: (token) => {
    set((state) => {
      if (!token || !state.user) {
        persistActiveAccount(null);
        return { user: null, token: null, isAuthenticated: false };
      }

      const active = { user: state.user, token, lastUsedAt: new Date().toISOString() };
      const accounts = dedupeAccounts([
        active,
        ...state.accounts.filter((account) => account.user.id !== state.user?.id),
      ]);
      persistAccounts(accounts);
      persistActiveAccount(active);
      return { token, accounts, isAuthenticated: true };
    });
  },
  login: (user, token) => {
    const active = { user, token, lastUsedAt: new Date().toISOString() };
    set((state) => {
      const accounts = dedupeAccounts([
        active,
        ...state.accounts.filter((account) => account.user.id !== user.id),
      ]);
      persistAccounts(accounts);
      persistActiveAccount(active);
      return { user, token, accounts, isAuthenticated: true };
    });
  },
  switchAccount: (userId) => {
    set((state) => {
      const selected = state.accounts.find((account) => account.user.id === userId);
      if (!selected) {
        return state;
      }

      const active = { ...selected, lastUsedAt: new Date().toISOString() };
      const accounts = dedupeAccounts([
        active,
        ...state.accounts.filter((account) => account.user.id !== userId),
      ]);
      persistAccounts(accounts);
      persistActiveAccount(active);
      return {
        user: active.user,
        token: active.token,
        accounts,
        isAuthenticated: true,
      };
    });
  },
  removeAccount: (userId) => {
    set((state) => {
      const accounts = state.accounts.filter((account) => account.user.id !== userId);
      const nextActive = state.user?.id === userId ? accounts[0] || null : state.accounts.find((account) => account.user.id === state.user?.id) || accounts[0] || null;
      persistAccounts(accounts);
      persistActiveAccount(nextActive);
      return {
        user: nextActive?.user || null,
        token: nextActive?.token || null,
        accounts,
        isAuthenticated: !!nextActive?.token,
      };
    });
  },
  logout: () => {
    set((state) => {
      if (!state.user) {
        persistActiveAccount(null);
        return { user: null, token: null, isAuthenticated: false };
      }

      const accounts = state.accounts.filter((account) => account.user.id !== state.user?.id);
      const nextActive = accounts[0] || null;
      persistAccounts(accounts);
      persistActiveAccount(nextActive);
      return {
        user: nextActive?.user || null,
        token: nextActive?.token || null,
        accounts,
        isAuthenticated: !!nextActive?.token,
      };
    });
  },
}));
