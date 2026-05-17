import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { organizationAPI, setActiveOrganization, type ActiveOrganization } from '../services/api';
import BrandMark from './BrandMark';

interface OrganizationScopeProps {
  children?: ReactNode;
  redirectTo?: string;
}

export default function OrganizationScope({ children, redirectTo }: OrganizationScopeProps) {
  const { organizationSlug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvedSlug, setResolvedSlug] = useState('');

  useEffect(() => {
    if (!organizationSlug) {
      setError('Organization link is missing.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setResolvedSlug('');

    organizationAPI.getBySlug(organizationSlug)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const organization: ActiveOrganization = {
          id: response.data.id,
          name: response.data.name,
          slug: response.data.slug,
          localAppUrl: response.data.localAppUrl,
          primaryDomain: response.data.primaryDomain,
        };
        setActiveOrganization(organization);
        setResolvedSlug(organization.slug || organizationSlug);
      })
      .catch(() => {
        if (!cancelled) {
          setError('This organization hosting link is not available.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organizationSlug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-slate-700">
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <BrandMark showName={false} markClassName="h-10 w-10" />
          <span className="text-sm font-semibold">Opening organization workspace...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-slate-950">
        <div className="max-w-md rounded-md border border-red-200 bg-white p-6 shadow-sm">
          <BrandMark markClassName="h-10 w-10" />
          <h1 className="mt-4 text-lg font-semibold">Organization not found</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (redirectTo) {
    const target = resolvedSlug && redirectTo.startsWith('/')
      ? `/org/${encodeURIComponent(resolvedSlug)}${redirectTo}`
      : redirectTo;
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
