import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'claude-ui-dev-secret-change-in-production';
const MAX_USER_ID_SCAN = Number(process.env.PLAYWRIGHT_MAX_USER_ID_SCAN || 10);
const LOGIN_USERNAME = process.env.PLAYWRIGHT_USERNAME;
const LOGIN_PASSWORD = process.env.PLAYWRIGHT_PASSWORD;
const RELEASE_API_URL = /https:\/\/api\.github\.com\/repos\/OpenLAIR\/dr-claw\/releases\/latest/;
const REMINDER_STORAGE_KEY = 'dr-claw.versionReminder';

async function findValidTokenForExistingUser(request: APIRequestContext): Promise<string | null> {
  for (let userId = 1; userId <= MAX_USER_ID_SCAN; userId += 1) {
    const candidateToken = jwt.sign(
      { userId, username: `playwright-e2e-${userId}` },
      JWT_SECRET,
    );
    const response = await request.get('/api/auth/user', {
      headers: { Authorization: `Bearer ${candidateToken}` },
    });
    if (response.ok()) {
      return candidateToken;
    }
  }

  return null;
}

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const authStatusResponse = await request.get('/api/auth/status');
  expect(authStatusResponse.ok()).toBeTruthy();
  const authStatus = await authStatusResponse.json();

  if (authStatus.needsSetup) {
    const setupUsername = process.env.PLAYWRIGHT_SETUP_USERNAME || `playwright-${Date.now()}`;
    const setupPassword = process.env.PLAYWRIGHT_SETUP_PASSWORD || 'playwright-password-123';
    const registerResponse = await request.post('/api/auth/register', {
      data: { username: setupUsername, password: setupPassword },
    });
    expect(registerResponse.ok()).toBeTruthy();
    return (await registerResponse.json()).token;
  }

  if (LOGIN_USERNAME && LOGIN_PASSWORD) {
    const loginResponse = await request.post('/api/auth/login', {
      data: { username: LOGIN_USERNAME, password: LOGIN_PASSWORD },
    });
    expect(loginResponse.ok()).toBeTruthy();
    return (await loginResponse.json()).token;
  }

  const discoveredToken = await findValidTokenForExistingUser(request);
  if (discoveredToken) {
    return discoveredToken;
  }

  throw new Error(
    'Authentication required. Set PLAYWRIGHT_USERNAME/PLAYWRIGHT_PASSWORD, or provide a dev JWT secret compatible with existing users.',
  );
}

async function ensureAuthenticated(page: Page, request: APIRequestContext) {
  const token = await getAuthToken(request);

  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, REMINDER_STORAGE_KEY);

  await request.post('/api/user/complete-onboarding', {
    headers: { Authorization: `Bearer ${token}` },
  });

  await page.addInitScript((authToken) => {
    window.localStorage.setItem('auth-token', authToken);
  }, token);
}

async function mockLatestRelease(page: Page, version = '1.0.1') {
  await page.route(RELEASE_API_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
      },
      body: JSON.stringify({
        tag_name: `v${version}`,
        name: `Release ${version}`,
        body: 'Bug fixes and improvements',
        html_url: `https://github.com/OpenLAIR/dr-claw/releases/tag/v${version}`,
        published_at: '2026-03-20T12:00:00.000Z',
      }),
    });
  });
}

async function mockHealth(page: Page, installMode: 'git' | 'npm' = 'npm') {
  await page.route('**/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', installMode }),
    });
  });
}

async function openAppWithRelease(page: Page, version = '1.0.1') {
  await mockHealth(page);
  await mockLatestRelease(page, version);
  await Promise.all([
    page.waitForResponse(RELEASE_API_URL),
    page.goto('/', { waitUntil: 'domcontentloaded' }),
  ]);
}

function getVersionModal(page: Page) {
  return page.locator('div[role="dialog"], .fixed.inset-0.z-50').filter({
    has: page.locator('text=/Update Available|有可用更新|업데이트 가능/'),
  }).first();
}

function getReleaseBanner(page: Page) {
  return page.getByRole('button', {
    name: /Release 1\.0\.1.*Update available|Release 1\.0\.1.*有可用更新|Release 1\.0\.1.*업데이트 가능/i,
  });
}

test.describe('Release Update Notification', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page, page.request);
  });

  test('shows an update banner when a newer GitHub release is available', async ({ page }) => {
    await openAppWithRelease(page, '1.0.1');

    const banner = getReleaseBanner(page);
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toContainText(/Release 1\.0\.1/);
  });

  test('opens release details and stores a 24-hour reminder when snoozed', async ({ page }) => {
    await openAppWithRelease(page, '1.0.1');

    const modal = getVersionModal(page);
    await expect(modal).toBeVisible({ timeout: 15000 });
    await expect(modal).toContainText(/Release 1\.0\.1/);
    await expect(modal).toContainText(/1\.0\.0/);
    await expect(modal).toContainText(/1\.0\.1/);

    const laterButton = page.getByRole('button', {
      name: /Remind Me Later|Later|稍后提醒|나중에 다시 알림/,
    });
    await laterButton.click();
    await expect(modal).toBeHidden({ timeout: 10000 });

    const reminder = await page.evaluate((storageKey) => {
      const rawValue = window.localStorage.getItem(storageKey);
      return rawValue ? JSON.parse(rawValue) : null;
    }, REMINDER_STORAGE_KEY);

    expect(reminder?.version).toBe('1.0.1');
    expect(typeof reminder?.remindAt).toBe('number');
    expect(reminder.remindAt).toBeGreaterThan(Date.now());
  });

  test('treats closing from the backdrop as a snooze across refresh', async ({ page }) => {
    await openAppWithRelease(page, '1.0.1');

    const modal = getVersionModal(page);
    await expect(modal).toBeVisible({ timeout: 15000 });

    await page.getByLabel(/close modal|关闭弹窗|모달 닫기/i).click();
    await expect(modal).toBeHidden({ timeout: 10000 });

    const reminder = await page.evaluate((storageKey) => {
      const rawValue = window.localStorage.getItem(storageKey);
      return rawValue ? JSON.parse(rawValue) : null;
    }, REMINDER_STORAGE_KEY);

    expect(reminder?.version).toBe('1.0.1');
    expect(typeof reminder?.remindAt).toBe('number');
    expect(reminder.remindAt).toBeGreaterThan(Date.now());

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForResponse(RELEASE_API_URL);
    await expect(getVersionModal(page)).toBeHidden();
  });

  test('shows the modal again after an existing reminder expires', async ({ page }) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: '1.0.1',
          remindAt: Date.now() - 1_000,
        }),
      );
    }, REMINDER_STORAGE_KEY);

    await openAppWithRelease(page, '1.0.1');

    const modal = getVersionModal(page);
    await expect(modal).toBeVisible({ timeout: 15000 });

    const reminder = await page.evaluate((storageKey) => {
      const rawValue = window.localStorage.getItem(storageKey);
      return rawValue ? JSON.parse(rawValue) : null;
    }, REMINDER_STORAGE_KEY);

    expect(reminder).toBeNull();
  });
});
