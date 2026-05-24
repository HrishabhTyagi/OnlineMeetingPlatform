import { describe, expect, it } from 'vitest';
import {
  buildLocalAppUrl,
  defaultForm,
  estimateMonthlyStorage,
  memberRoleOptions,
  normalizeMember,
  normalizeOrganization,
  normalizeSettings,
  normalizeUsage,
  providerOptions,
  slugifyUrlName,
} from './main';

describe('organization admin helpers', () => {
  it('normalizes organization settings with safe defaults', () => {
    const settings = normalizeSettings({
      name: '',
      storageProvider: 'CustomerPremises',
      recordingRetentionDays: 90,
      allowExternalGuests: false,
    });

    expect(settings.name).toBe(defaultForm.name);
    expect(settings.storageProvider).toBe('CustomerPremises');
    expect(settings.recordingRetentionDays).toBe(90);
    expect(settings.attachmentRetentionDays).toBe(defaultForm.attachmentRetentionDays);
    expect(settings.allowExternalGuests).toBe(false);
  });

  it('normalizes organization records and local tenant urls', () => {
    expect(slugifyUrlName('Wipro Demo Pvt Ltd')).toBe('wipro-demo-pvt-ltd');
    expect(buildLocalAppUrl(undefined, 'Wipro Demo')).toBe('http://localhost:5173/org/wipro-demo');

    const organization = normalizeOrganization({
      id: 'org-1',
      name: 'Wipro Demo',
      slug: 'wipro',
      primaryDomain: 'wipro.test',
    });

    expect(organization.localAppUrl).toBe('http://localhost:5173/org/wipro');
    expect(organization.primaryDomain).toBe('wipro.test');
  });

  it('normalizes member, usage, and option metadata', () => {
    const member = normalizeMember({
      id: 'member-1',
      organizationId: 'org-1',
      userId: 'user-1',
      email: 'owner@samvaad.test',
    });
    const usage = normalizeUsage({
      organizationId: 'org-1',
      organizationName: 'Wipro',
      roleCounts: [{ role: 'Owner', count: 1 }],
    });

    expect(member.displayName).toBe('owner@samvaad.test');
    expect(member.role).toBe('Member');
    expect(usage.storageProvider).toBe('ApplicationLocal');
    expect(providerOptions.map((option) => option.value)).toEqual(['ApplicationLocal', 'CustomerPremises', 'CloudMounted']);
    expect(memberRoleOptions).toEqual(['Owner', 'Admin', 'Member', 'Guest']);
  });

  it('estimates monthly storage from recording and attachment limits', () => {
    expect(estimateMonthlyStorage({
      ...defaultForm,
      maxRecordingMegabytes: 1024,
      maxAttachmentMegabytes: 100,
      recordingRetentionDays: 60,
      attachmentRetentionDays: 30,
    })).toBeGreaterThan(1);
  });
});
