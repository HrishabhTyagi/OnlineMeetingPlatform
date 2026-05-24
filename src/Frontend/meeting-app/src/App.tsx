import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Activity from './pages/Activity';
import CreateMeeting from './pages/CreateMeeting';
import CalendarCallback from './pages/CalendarCallback';
import Meet from './pages/Meet';
import MeetingRoom from './pages/MeetingRoom';
import Chat from './pages/Chat';
import Calls from './pages/Calls';
import Teams from './pages/Teams';
import License from './pages/License';
import { useAuthStore } from './store/authStore';
import IncomingCallRinger from './components/IncomingCallRinger';
import ConversationMessageNotifier from './components/ConversationMessageNotifier';
import { ThemeProvider } from './components/ThemeProvider';
import OrganizationScope from './components/OrganizationScope';
import PersonalScope from './components/PersonalScope';
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
            <Route path="/org/:organizationSlug" element={<OrganizationScope redirectTo="/dashboard" />} />
            <Route path="/personal" element={<PersonalScope redirectTo="/dashboard" />} />
            <Route
              path="/org/:organizationSlug/activity"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <Activity />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/org/:organizationSlug/dashboard"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/org/:organizationSlug/meet"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <Meet />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/org/:organizationSlug/calls"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <Calls />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/org/:organizationSlug/create-meeting"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <CreateMeeting />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/org/:organizationSlug/chat"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/org/:organizationSlug/teams"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <Teams />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/org/:organizationSlug/meeting/:id"
              element={
                <OrganizationScope>
                  <ProtectedRoute>
                    <MeetingRoom />
                  </ProtectedRoute>
                </OrganizationScope>
              }
            />
            <Route
              path="/personal/activity"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Activity />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/personal/dashboard"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/personal/meet"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Meet />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/personal/calls"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Calls />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/personal/create-meeting"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <CreateMeeting />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/personal/chat"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/personal/teams"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Teams />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/personal/meeting/:id"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <MeetingRoom />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/activity"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Activity />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/dashboard"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/meet"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Meet />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/calls"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Calls />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/create-meeting"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <CreateMeeting />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/chat"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/teams"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <Teams />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/license"
              element={
                <ProtectedRoute>
                  <License />
                </ProtectedRoute>
              }
            />
            <Route
              path="/meeting/:id"
              element={
                <PersonalScope>
                  <ProtectedRoute>
                    <MeetingRoom />
                  </ProtectedRoute>
                </PersonalScope>
              }
            />
            <Route
              path="/calendar/callback/:provider"
              element={
                <ProtectedRoute>
                  <CalendarCallback />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/personal/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
