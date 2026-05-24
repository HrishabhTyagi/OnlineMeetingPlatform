import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { setPersonalWorkspace } from '../services/api';

interface PersonalScopeProps {
  children?: ReactNode;
  redirectTo?: string;
}

export default function PersonalScope({ children, redirectTo }: PersonalScopeProps) {
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setPersonalWorkspace();
    setReady(true);
  }, []);

  if (!ready) {
    return null;
  }

  if (redirectTo) {
    const target = redirectTo.startsWith('/') ? `/personal${redirectTo}` : redirectTo;
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
