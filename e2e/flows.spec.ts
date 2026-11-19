import { expect, test } from '@playwright/test';
import { USERS, isMobile, login, openQuickAdd } from './helpers';

// Brief Phase 16: the seven critical flows.

test('1. login → onboarding → Home', async ({ page }) => {
  // A phone the mock backend has never seen gets no workspace, so onboarding starts.
  await login(page, '+12125559876', /\/onboarding/);
  await page.getByRole('radio', { name: /Law firm/ }).click();
  await expect(page.getByText('Consultation booked')).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Business name').fill('Harbor Legal');
  await page.getByLabel('Your name').fill('Alex Doe');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radio', { name: /Just me/ }).click();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL(/\/home/);
  await expect(page.getByText("You're looking at sample data.")).toBeVisible();
  await expect(page.getByRole('heading', { name: /Alex/ })).toBeVisible();
});

test('2. quick add warns about a duplicate phone', async ({ page }) => {
  await login(page, USERS.owner);
  await openQuickAdd(page);
  const dialog = page.getByRole('dialog', { name: 'Add lead' });
  await dialog.getByLabel('Name').fill('Duplicate Test');
  // Seeded US Realty lead (mocks/db.ts phone pattern +1212555xxxx).
  await dialog.locator('#qa-phone').fill('(212) 555-1001');
  await dialog.getByLabel('Name').click(); // blur the phone field
  await expect(dialog.getByText('This number is already a lead')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'View existing' })).toBeVisible();

  // A new number adds the lead.
  await dialog.locator('#qa-phone').fill('(212) 555-0177');
  await dialog.getByRole('button', { name: 'Add lead' }).click();
  await expect(page.getByText('Lead added')).toBeVisible();
});

test('3. moving a deal to Won always asks for a reason', async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto('/pipeline');
  // Open the first deal's lead, then use the Deals tab.
  await page.locator('a[href^="/contacts/"]').first().click();
  await page.waitForURL(/\/contacts\//);
  await page.getByRole('tab', { name: /Deals/ }).click();
  await page.getByRole('button', { name: 'Move deal' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Won', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Why did you win?' })).toBeVisible();
  await page.getByRole('button', { name: 'Fast response' }).click();
  await expect(page.getByText('Moved to Won')).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByText(/Moved to Won · Fast response/).first()).toBeVisible();
});

test('4. completing a follow-up with a call outcome', async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto('/follow-ups?tab=overdue');
  const first = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: /Call|WhatsApp|Meet|Viewing|Follow up/ }) }).first();
  const title = (await first.getByRole('link').first().textContent())!.trim();
  // Simulate "dialer opened, person came back" (the outcome sheet opens on return).
  await page.route('tel:*', (r) => r.abort());
  await first.locator('a[href^="tel:"]').click();
  await page.waitForTimeout(1700);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const sheet = page.getByRole('dialog', { name: 'How did the call go?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Answered' }).click();
  await sheet.getByLabel('Note').fill('Wants a viewing on Saturday');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Call logged')).toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
});

test('5. changing the workspace region changes money and date formats', async ({ page }) => {
  await login(page, USERS.owner);
  await page.goto('/reports');
  await expect(page.getByText(/\$[\d.,]+[KMB]?/).first()).toBeVisible();
  await page.goto('/settings/workspace');
  await page.getByLabel('Currency').click();
  await page.getByRole('option', { name: 'GBP' }).click();
  await page.getByLabel('Time format').click();
  await page.getByRole('option', { name: '24-hour' }).click();
  // The live preview follows the edited region before saving.
  await expect(page.getByText(/£1,250,000/)).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Changes saved')).toBeVisible();
  // Report totals use the workspace currency without a reload.
  if (isMobile(page)) await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByText(/£[\d.,]+[KMB]?/).first()).toBeVisible();
});

test('6. read-only mode hides write actions', async ({ page }) => {
  await login(page, USERS.owner);
  await expect(page.getByRole('button', { name: 'Add lead' }).first()).toBeVisible();
  // Flip the workspace to read-only with the dev switcher (what billing enforcement does).
  await page.getByRole('button', { name: 'Dev switcher' }).click({ force: true });
  await page.getByLabel('Workspace status').selectOption('read_only');
  await expect(page.getByText('Your workspace is read-only. Pay the open invoice to continue.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to billing' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add lead' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Mark .* done$/ })).toHaveCount(0);
});

test('7. a partner creates a client workspace and opens it', async ({ page }) => {
  await login(page, USERS.partner);
  await page.goto('/partner');
  await page.getByRole('button', { name: 'New workspace' }).click();
  const dialog = page.getByRole('dialog', { name: 'New client workspace' });
  await dialog.getByLabel('Workspace name').fill('Marina Clinic');
  await dialog.getByRole('button', { name: 'New workspace' }).click();
  await expect(page.getByText('Workspace created')).toBeVisible();
  await page.getByRole('button', { name: 'Open Marina Clinic as support' }).click();
  await page.waitForURL(/\/home/);
  await expect(page.getByText('Viewing as Marina Clinic')).toBeVisible();
  await page.getByRole('button', { name: 'Exit' }).click();
  await page.waitForURL(/\/partner/);
  if (!isMobile(page)) await expect(page.getByRole('heading', { name: 'Partner' })).toBeVisible();
});
