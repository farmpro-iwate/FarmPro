import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AiHelpPage } from './AiHelpPage';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('AI相談の質問例UI', () => {
  it('入力例を押すと質問欄に反映され、送信できる状態になる', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/ai-help']}><AiHelpPage /></MemoryRouter>);

    const question = screen.getByRole('textbox', { name: '聞きたいことを入力' });
    const send = screen.getByRole('button', { name: 'AI相談' });
    expect(send).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '2660の過去の産子成績は？' }));
    expect(question).toHaveValue('2660の過去の産子成績は？');
    expect(send).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /繁殖・授精 発情未確認の牛は？/ }));
    expect(question).toHaveValue('発情未確認の牛は？');
    expect(send).toBeEnabled();
  });

  it('AIで記録モードでは相談専用の質問カードを表示しない', () => {
    render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><AiHelpPage /></MemoryRouter>);
    expect(screen.queryByText('よくある質問')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AIで記録' })).toBeInTheDocument();
  });
});
