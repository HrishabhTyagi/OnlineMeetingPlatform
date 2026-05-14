import create from 'zustand';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePictureUrl?: string;
  phoneNumber?: string;
  isEmailVerified: boolean;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const storedUser = localStorage.getItem('authUser');

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: localStorage.getItem('authToken'),
  isAuthenticated: !!localStorage.getItem('authToken'),
  setUser: (user) => {
    if (user) {
      localStorage.setItem('authUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('authUser');
    }
    set({ user });
  },
  setToken: (token) => {
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
    set({ token, isAuthenticated: !!token });
  },
  login: (user, token) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
