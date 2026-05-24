import { expect, test } from '@playwright/test';

const user = {
  id: 'user-1',
  email: 'asha@samvaad.test',
  firstName: 'Asha',
  lastName: 'Mehta',
  isEmailVerified: true,
  createdAt: '2026-05-20T00:00:00.000Z',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ seededUser }) => {
    sessionStorage.setItem('authToken', 'functional-token');
    sessionStorage.setItem('authUser', JSON.stringify(seededUser));
    sessionStorage.setItem('authAccounts', JSON.stringify([{ user: seededUser, token: 'functional-token', lastUsedAt: new Date().toISOString() }]));
    sessionStorage.setItem('activeAuthAccountId', seededUser.id);
    localStorage.setItem('samvaadActiveOrganization', JSON.stringify({ id: 'org-1', name: 'Acme', slug: 'acme' }));
  }, { seededUser: user });

  await page.route('**/api/organizations/slug/*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        localAppUrl: 'http://localhost:5173/org/acme',
        primaryDomain: 'acme.test',
      }),
    });
  });

  await page.route('**/api/meetings/calls/recent**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'call-1',
          meetingId: 'meeting-1',
          meetingTitle: 'Functional call',
          conversationId: 'chat-1',
          callerUserId: 'user-2',
          callerName: 'Alex Benton',
          recipientUserId: 'user-1',
          recipientEmail: 'asha@samvaad.test',
          recipientName: 'Asha Mehta',
          callType: 'video',
          status: 'NoResponse',
          isSeen: false,
          createdAt: '2026-05-20T08:00:00.000Z',
        },
      ]),
    });
  });
  await page.route('**/api/meetings/calls/*/seen', async (route) => route.fulfill({ contentType: 'application/json', body: '{}' }));
  await page.route('**/api/meetings/calls', async (route) => route.fulfill({ status: 204, body: '' }));
});

test('calls page shows missed call history and supports seen/clear actions', async ({ page }) => {
  await page.goto('/org/acme/calls');

  await expect(page.getByRole('heading', { name: 'Call history' })).toBeVisible();
  await expect(page.getByText('Alex Benton')).toBeVisible();
  await expect(page.getByText('1 missed, 1 unseen')).toBeVisible();

  await page.getByRole('button', { name: 'Mark shown seen' }).click();
  await expect(page.getByText('Shown calls marked seen')).toBeVisible();

  await page.getByRole('button', { name: 'Clear shown' }).click();
  await expect(page.getByText('Call history cleared')).toBeVisible();
});
