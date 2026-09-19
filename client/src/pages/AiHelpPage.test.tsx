import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiHelpPage } from './AiHelpPage';

const AUTH_USER_KEY = 'farmpro.authUser';
const AUTH_TOKEN_KEY = 'farmpro.authToken';

function setPlan(plan: 'free' | 'standard' | 'pro') {
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify({
    id: 'test-user',
    farmId: 'test-farm',
    farmName: 'テスト農場',
    name: 'テスト',
    email: 'test@example.com',
    role: 'owner',
    active: true,
    plan,
  }));
}

async function askFreeGuideQuestion() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <AiHelpPage />
    </MemoryRouter>,
  );

  const input = screen.getByLabelText('分からないことを入力');
  await user.type(input, '牛を登録したい');
  await user.click(screen.getByRole('button', { name: 'AIに聞く' }));
}

describe('AiHelpPage Standard introduction', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Freeでは回答下にStandard紹介を表示する', async () => {
    setPlan('free');
    await askFreeGuideQuestion();

    expect(screen.getByText('Standardなら、農場データもAIに聞けます')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Standardを申し込む' })).toHaveAttribute('href', '/paid-plan');
  });

  it('StandardではStandard紹介を表示しない', async () => {
    setPlan('standard');
    await askFreeGuideQuestion();

    expect(screen.queryByText('Standardなら、農場データもAIに聞けます')).not.toBeInTheDocument();
  });

  it('ProではStandard紹介を表示しない', async () => {
    setPlan('pro');
    await askFreeGuideQuestion();

    expect(screen.queryByText('Standardなら、農場データもAIに聞けます')).not.toBeInTheDocument();
  });
});


describe('AiHelpPage Standard farm AI', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standardでは前回授精の質問を農場データAIへ送る', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '123番の前回授精は2026-08-15です。',
        source: {
          earTag: '123',
          breedingId: 'breeding-1',
          inseminationDate: '2026-08-15',
          recordType: 'breeding',
        },
        model: 'gpt-5',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '123番の前回授精は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('農場データからの回答')).toBeInTheDocument();
    expect(screen.getByText('123番の前回授精は2026-08-15です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer test-token',
      }),
    }));
  });

  it('Standardでは牛名と受精表現でも農場データAIへ送る', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: 'ふじ号の前回授精は2026-08-15です。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), 'ふじ号前回の受精は');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('ふじ号の前回授精は2026-08-15です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('Freeでは前回授精の質問を農場データAIへ送らない', async () => {
    setPlan('free');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '123番の前回授精は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe('AiHelpPage breeding stage question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends breeding stage questions to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ handled: true, answer: '現在の繁殖段階を確認しました。' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), 'さちこは今どの繁殖段階？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('現在の繁殖段階を確認しました。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({ method: 'POST' }));
  });
});
