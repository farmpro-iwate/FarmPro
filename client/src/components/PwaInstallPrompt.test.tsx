import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallPrompt } from './PwaInstallPrompt';

const dismissedKey = 'farmpro.pwaInstallPromptDismissed';

function renderPrompt(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <PwaInstallPrompt />
      <Link to="/">ホームへ</Link>
      <Link to="/cattle/123">牛の記録へ</Link>
    </MemoryRouter>,
  );
}

describe('PwaInstallPrompt compact entry', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    { name: 'iOS', agent: 'Mozilla/5.0 (iPhone)', instructions: /Safariの共有ボタン/ },
    { name: 'browser', agent: 'Mozilla/5.0', instructions: /ブラウザのメニュー/ },
  ])('keeps $name instructions collapsed until requested', ({ agent, instructions }) => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(agent);
    renderPrompt();

    const button = screen.getByRole('button', { name: 'ホーム画面に追加' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(instructions);

    fireEvent.click(button);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the available install event and hides the prompt after acceptance', async () => {
    renderPrompt();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    act(() => { window.dispatchEvent(installEvent); });
    expect(installEvent.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(dismissedKey)).toBeNull();
  });

  it('keeps the existing dismissal preference across mounts', () => {
    const view = renderPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'ホーム画面への追加案内を閉じる' }));

    expect(window.localStorage.getItem(dismissedKey)).toBe('1');
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();

    view.unmount();
    renderPrompt();
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
  });

  it('follows router navigation and stays hidden outside the home page', () => {
    renderPrompt('/cattle/123');
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'ホームへ' }));
    fireEvent.click(screen.getByRole('button', { name: 'ホーム画面に追加' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '牛の記録へ' }));
    expect(screen.queryByRole('button', { name: 'ホーム画面に追加' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'ホームへ' }));
    expect(screen.getByRole('button', { name: 'ホーム画面に追加' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
