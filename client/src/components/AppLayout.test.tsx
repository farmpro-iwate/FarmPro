import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppLayout } from './AppLayout';

afterEach(() => {
  cleanup();
});

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
  it('個体詳細のAI相談へ現在画面を渡す', () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <AppLayout><div>detail</div></AppLayout>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: '✨ AI相談' });
    expect(links.some((link) => link.getAttribute('href') === '/ai-help?from=%2Fcattle%2F123')).toBe(true);
  });
});


describe('AppLayout Farm AI new question reset', () => {
  it('AI相談画面で上部のAI相談を押すと新規質問イベントを送る', () => {
    let dispatched = 0;
    const listener = () => { dispatched += 1; };
    window.addEventListener('farmpro:ai-help-new-question', listener);

    render(
      <MemoryRouter initialEntries={['/ai-help']}>
        <AppLayout><div>ai help</div></AppLayout>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: '✨ AI相談' });
    links.forEach((link) => fireEvent.click(link));
    expect(dispatched).toBeGreaterThan(0);

    window.removeEventListener('farmpro:ai-help-new-question', listener);
  });
});


describe('AppLayout past data entry navigation', () => {
  it('その他の管理から過去データ入力を開ける', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole('button', { name: 'その他の管理' });
    fireEvent.click(buttons[0]);

    const link = screen.getByRole('menuitem', { name: '過去データ入力' });
    expect(link).toHaveAttribute('href', '/past-data-entry');
  });
});


describe('AppLayout other management grouping', () => {
  it('主要機能のリンク先を変えずに整理されたカテゴリで表示する', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole('button', { name: 'その他の管理' });
    fireEvent.click(buttons[0]);

    expect(screen.getByText('牛・繁殖')).toBeInTheDocument();
    expect(screen.getByText('健康・飼養')).toBeInTheDocument();
    expect(screen.getByText('販売・経営')).toBeInTheDocument();
    expect(screen.getByText('データ・設定')).toBeInTheDocument();

    expect(screen.getByRole('menuitem', { name: '繁殖管理' })).toHaveAttribute('href', '/breedings');
    expect(screen.getByRole('menuitem', { name: '出荷販売' })).toHaveAttribute('href', '/sales');
    expect(screen.getByRole('menuitem', { name: '販売済み牛一覧' })).toHaveAttribute('href', '/cattle/sold');
    expect(screen.getByRole('menuitem', { name: '経費管理' })).toHaveAttribute('href', '/expenses');
    expect(screen.getByRole('menuitem', { name: '過去データ入力' })).toHaveAttribute('href', '/past-data-entry');
  });
});
