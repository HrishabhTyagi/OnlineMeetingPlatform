import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { organizationAPI, setApiWorkspace } from '../services/api';
import { storage } from '../services/storage';
import { Organization, Workspace } from '../types/api';
import { useAuth } from './AuthContext';

const personalWorkspace: Workspace = { kind: 'personal', id: 'personal', name: 'Personal', slug: 'personal' };

interface WorkspaceContextValue {
  workspace: Workspace;
  organizations: Organization[];
  refreshOrganizations: () => Promise<void>;
  usePersonal: () => Promise<void>;
  useOrganization: (organization: Organization) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace>(personalWorkspace);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  useEffect(() => {
    storage.getWorkspace().then((saved) => {
      const next = saved || personalWorkspace;
      setWorkspace(next);
      setApiWorkspace(next);
    });
  }, []);

  const selectWorkspace = async (next: Workspace) => {
    setWorkspace(next);
    setApiWorkspace(next);
    await storage.setWorkspace(next);
  };

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspace,
    organizations,
    refreshOrganizations: async () => {
      if (!isAuthenticated) {
        return;
      }

      const response = await organizationAPI.getMine();
      const list = Array.isArray(response.data) ? response.data : response.data?.items || [];
      setOrganizations(list);
    },
    usePersonal: () => selectWorkspace(personalWorkspace),
    useOrganization: (organization) => selectWorkspace({
      kind: 'organization',
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      organization,
    }),
  }), [isAuthenticated, organizations, workspace]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }

  return value;
}
