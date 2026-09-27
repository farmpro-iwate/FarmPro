import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout';

describe('AppLayout activity registration entry', () => {
  // Regression: avoid duplicate global activity entry on animal detail pages.
  it('個体詳細では共通の「＋ 活動登録」を表示せず、個体専用の活動登録入口は残す', () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <AppLayout><div>detail</div></AppLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByText('＋ 活動登録')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '活動登録' })).toBeInTheDocument();
  });

  it('ホームでは共通の「＋ 活動登録」を表示する', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('＋ 活動登録').length).toBeGreaterThan(0);
  });
});


describe('AppLayout Farm AI current animal context', () => {
  it('個体詳細のAIに聞くへ現在画面を渡す', () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <AppLayout><div>detail</div></AppLayout>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: '✨ AIに聞く' });
    expect(links.some((link) => link.getAttribute('href') === '/ai-help?from=%2Fcattle%2F123')).toBe(true);
  });
});


describe('AppLayout Farm AI new question reset', () => {
  it('AIに聞く画面で上部のAIに聞くを押すと新規質問イベントを送る', () => {
    let dispatched = 0;
    const listener = () => { dispatched += 1; };
    window.addEventListener('farmpro:ai-help-new-question', listener);

    render(
      <MemoryRouter initialEntries={['/ai-help']}>
        <AppLayout><div>ai help</div></AppLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('link', { name: '✨ AIに聞く' })[0]);
    expect(dispatched).toBe(1);

    window.removeEventListener('farmpro:ai-help-new-question', listener);
  });
});
