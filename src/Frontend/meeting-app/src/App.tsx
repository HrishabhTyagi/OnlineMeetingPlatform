import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateMeeting from './pages/CreateMeeting';
import MeetingRoom from './pages/MeetingRoom';
import Chat from './pages/Chat';
import { useAuthStore } from './store/authStore';
import IncomingCallRinger from './components/IncomingCallRinger';
import ConversationMessageNotifier from './components/ConversationMessageNotifier';
import { ThemeProvider } from './components/ThemeProvider';
import './index.css';

const queryClient = new QueryClient();

function useBlockBrowserBack() {
  const location = useLocation();

  useEffect(() => {
    const lockedUrl = window.location.href;
    window.history.replaceState({ appRoute: true }, '', lockedUrl);
    window.history.pushState({ appBackGuard: true }, '', lockedUrl);

    const keepUserOnCurrentPage = () => {
      window.history.pushState({ appBackGuard: true }, '', lockedUrl);
    };

    window.addEventListener('popstate', keepUserOnCurrentPage);
    return () => window.removeEventListener('popstate', keepUserOnCurrentPage);
  }, [location.pathname, location.search, location.hash]);
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  useBlockBrowserBack();

  return isAuthenticated ? (
    <>
      {children}
      <ConversationMessageNotifier />
      <IncomingCallRinger />
    </>
  ) : <Navigate to="/login" replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-meeting"
              element={
                <ProtectedRoute>
                  <CreateMeeting />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/meeting/:id"
              element={
                <ProtectedRoute>
                  <MeetingRoom />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
