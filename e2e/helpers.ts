import { expect, type Page } from '@playwright/test';

/** Seeded mock users (mocks/db.ts). */
export const USERS = {
  owner: '+12125550101', // Sarah Mitchell: owner of all four test workspaces
  agent: '+12125550102', // Jake Turner: agent at US Realty
  partner: '+971501234567', // Omar Haddad: partner admin of Skyline Partners
};

export const OTP = '482910';

export async function login(page: Page, phone: string, expectUrl: RegExp = /\/home/) {
  await page.goto('/login');
  await page.locator('#login-phone').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Digit 1').fill(OTP);
  await page.waitForURL(expectUrl, { timeout: 90_000 });
}

export function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1200) < 1024;
}

export async function openQuickAdd(page: Page) {
  if (isMobile(page)) await page.getByRole('button', { name: 'Add lead' }).last().click();
  else await page.getByRole('complementary').getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByRole('dialog', { name: 'Add lead' })).toBeVisible();
}
