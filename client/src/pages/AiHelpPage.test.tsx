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


describe('AiHelpPage weekly breeding tasks question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends weekly breeding task questions to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今週は2頭の対応があります。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今週、対応が必要な牛は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今週は2頭の対応があります。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({ method: 'POST' }));
  });
});


describe('AiHelpPage near calvings question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends near calving questions to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '分娩予定が近い牛は2頭います。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '分娩予定が近い牛は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('分娩予定が近い牛は2頭います。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({ method: 'POST' }));
  });
});


describe('AiHelpPage withdrawal cattle question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends withdrawal cattle questions to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '現在、休薬中の牛は1頭います。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '休薬中の牛はいる？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('現在、休薬中の牛は1頭います。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({ method: 'POST' }));
  });
});


describe('AiHelpPage monthly sales profit question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends monthly sales profit questions to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の販売利益は120,000円です。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月売った牛の利益は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の販売利益は120,000円です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({ method: 'POST' }));
  });
});


describe('AiHelpPage monthly balance question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends monthly balance summary to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の収支は300,000円です。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の収支は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の収支は300,000円です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({ method: 'POST' }));
  });
});


describe('AiHelpPage management summary wording', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends monthly management summary to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の経営状況をまとめました。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の経営状況をまとめて');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の経営状況をまとめました。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({ method: 'POST' }));
  });
});


describe('AiHelpPage monthly comparison question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends current and previous month summaries to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '先月より売上が増えています。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '先月と比べてどう？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('先月より売上が増えています。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('previousSummary'),
    }));
  });
});


describe('AiHelpPage top expense question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends top expense question to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月は飼料・敷料費が最も大きいです。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '何に一番お金がかかってる？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月は飼料・敷料費が最も大きいです。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage improvement question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends improvement question to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の登録データだけでは、改善箇所を特定できません。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月、改善するとしたらどこ？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の登録データだけでは、改善箇所を特定できません。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage monthly caution question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends monthly caution question to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の登録データから特に注意点は確認できません。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の注意点は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の登録データから特に注意点は確認できません。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage one-line management summary', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends one-line management summary to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月は売上1,376,000円、経費0円、収支1,376,000円です。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の経営を一言でまとめて');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月は売上1,376,000円、経費0円、収支1,376,000円です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage one-line monthly comparison', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends one-line current vs previous month comparison to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月は先月より売上が1,376,000円多く、経費は同額、収支は1,376,000円多いです。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月と先月の経営を一言で比べて');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月は先月より売上が1,376,000円多く、経費は同額、収支は1,376,000円多いです。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('previousSummary'),
    }));
  });
});


describe('AiHelpPage monthly sales summary question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends monthly sales count and amount question to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月は2頭販売し、売上合計は1,376,000円です。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の売上は何頭でいくら？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月は2頭販売し、売上合計は1,376,000円です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage average sale amount question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends average sale amount question to monthly balance AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の平均販売額は688,000円です。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の平均販売額はいくら？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の平均販売額は688,000円です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage previous average sale amount question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends previous month average sale amount question with previous summary', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '先月は販売実績がないため平均販売額は算出できません。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '先月の平均販売額はいくら？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('先月は販売実績がないため平均販売額は算出できません。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('previousSummary'),
    }));
  });
});


describe('AiHelpPage sales count difference question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends current vs previous sales count question with previous summary', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の販売頭数は先月より2頭増えています。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の販売頭数は先月より何頭増えた？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の販売頭数は先月より2頭増えています。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('previousSummary'),
    }));
  });
});


describe('AiHelpPage sales amount difference question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends current vs previous sales amount question with previous summary', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今月の売上は先月より1,376,000円増えています。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の売上は先月よりいくら増えた？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今月の売上は先月より1,376,000円増えています。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('previousSummary'),
    }));
  });
});


describe('AiHelpPage sales percent difference question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends current vs previous sales percent question with previous summary', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '先月売上が0円のため増減率は算出できません。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今月の売上は先月より何％増えた？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('先月売上が0円のため増減率は算出できません。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/monthly-balance', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('previousSummary'),
    }));
  });
});


describe('AiHelpPage today field tasks question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends today field tasks question to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '今日の対応は、妊娠鑑定1件と治療中1件です。',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '今日、何をすればいい？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('今日の対応は、妊娠鑑定1件と治療中1件です。')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage attention cattle question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends attention cattle question to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '【要対応】\n・はなみつ 耳標:7358：移植予定（2026-09-13）',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '注意が必要な牛をまとめて');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText(/はなみつ/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({
      method: 'POST',
    }));
  });
});


describe('AiHelpPage recent calves question', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('Standard sends recent calves question to farm AI', async () => {
    setPlan('standard');
    window.localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: '最近生まれた子牛\n・母牛:さちこ / 2026-09-18 / 雌 / 日齢2日',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<MemoryRouter><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('分からないことを入力'), '最近生まれた子牛は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText(/母牛:さちこ/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/farm-ai/question', expect.objectContaining({
      method: 'POST',
    }));
  });
});
