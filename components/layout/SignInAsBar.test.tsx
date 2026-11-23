import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const returnToMyAccount = vi.fn(async () => {});
let session: unknown = null;
vi.mock('@/lib/auth/SessionProvider', () => ({ useSession: () => ({ session, returnToMyAccount }) }));

const { SignInAsBar } = await import('./Banners');

const renderBar = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SignInAsBar />
    </NextIntlClientProvider>,
  );

describe('SignInAsBar', () => {
  it('is hidden in the owner’s own account', () => {
    session = { userId: 'owner', signInAs: null };
    const { container } = renderBar();
    expect(container).toBeEmptyDOMElement();
  });

  it('names the teammate and returns to the owner’s account', async () => {
    session = { userId: 'owner', signInAs: { id: 's', workspaceId: 'w', userId: 'ali', name: 'Ali', role: 'agent', expiresAt: '' } };
    renderBar();
    expect(screen.getByRole('status')).toHaveTextContent("You're signed in as Ali (Agent)");
    fireEvent.click(screen.getByRole('button', { name: 'Return to my account' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/settings/team'));
    expect(returnToMyAccount).toHaveBeenCalledOnce();
  });
});
