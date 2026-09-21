import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiHelpPage } from './AiHelpPage';
import * as api from '../services/api';
import * as breedingApi from '../services/breedingApi';

const AUTH_USER_KEY = 'farmpro.authUser';

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
  });

  it('Freeでは回答下にStandard紹介を表示する', async () => {
    setPlan('free');
    await askFreeGuideQuestion();

    expect(screen.getByText('Standardなら、農場データもAIに聞けます')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Standardを見る' })).toHaveAttribute('href', '/paid-plan');
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


describe('AiHelpPage 繁殖の同期化案内', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('「同期化って何？」に繁殖の同期化として回答する', async () => {
    setPlan('free');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('分からないことを入力');
    await user.type(input, '同期化って何？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(screen.getByRole('heading', { name: '繁殖の同期化' })).toBeInTheDocument();
    expect(screen.getByText(/発情同期化・排卵同期化などの処置予定をまとめて管理する機能です/)).toBeInTheDocument();
    expect(screen.getByText(/スマホとPCのデータをそろえる端末同期とは別の機能です/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '繁殖の同期化を開く' })).toHaveAttribute('href', '/schedules/synchronization/progress');
  });
});


describe('AiHelpPage 会話式登録の入口', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('「1234 発情を登録して」を発情登録モードとして表示する', async () => {
    setPlan('standard');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('分からないことを入力');
    await user.type(input, '1234 発情を登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(screen.getByRole('heading', { name: '発情登録を始めます' })).toBeInTheDocument();
    expect(screen.getByText(/耳標番号 1234 の牛を確認して/)).toBeInTheDocument();
    expect(screen.queryByText(/まだこの質問の案内は登録されていません/)).not.toBeInTheDocument();
  });
});


describe('AiHelpPage 会話式登録の牛確認', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('耳標番号が1頭だけ一致したら名号まで確認して表示する', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue([
      {
        id: 1,
        earTag: '1234',
        identificationNumber: '',
        name: 'ななえ',
        birthday: '',
        sex: '雌',
        sire: '',
        dam: '',
        stage: '繁殖牛',
        note: '',
      },
    ] as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('分からないことを入力');
    await user.type(input, '1234 発情を登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('1234 ななえですね。発情を登録します。')).toBeInTheDocument();
  });

  it('耳標番号が見つからない場合は警告する', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue([] as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('分からないことを入力');
    await user.type(input, '1234 発情を登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('耳標番号 1234 の牛が見つかりませんでした。')).toBeInTheDocument();
  });
});


describe('AiHelpPage 会話式発情登録の完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('牛確認から登録完了まで進める', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue([
      {
        id: 1,
        earTag: '1234',
        identificationNumber: '',
        name: 'ななえ',
        birthday: '',
        sex: '雌',
        sire: '',
        dam: '',
        stage: '繁殖牛',
        note: '',
      },
    ] as any);

    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({
      id: 'breeding-test-1',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '2026-09-21',
      estrusType: '自然発情',
      breedingMethod: '未選択',
      breedingStatus: '発情確認',
      inseminationDate: '',
      bullName: '',
      inseminatorName: '',
      transferPlannedDate: '',
      transferDate: '',
      transferCancelReason: '',
      embryoNumber: '',
      collectionDate: '',
      embryoType: '未選択',
      donorCowName: '',
      donorCowEarTag: '',
      embryoSireName: '',
      embryoGrade: '',
      strawNumber: '',
      supplierName: '',
      transferTechnician: '',
      nextHeatExpectedDate: '',
      pregnancyCheckExpectedDate: '',
      pregnancyCheckDate: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
      expectedCalvingDate: '',
      estrusSigns: ['粘液'],
      estrusSignsOther: '',
      note: '',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '1234 発情を登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('1234 ななえですね。発情を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '自然発情' }));
    await user.click(screen.getByRole('button', { name: '粘液' }));
    await user.click(screen.getByRole('button', { name: 'これで次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の発情を登録しました。完了です。')).toBeInTheDocument();
    expect(createBreeding).toHaveBeenCalledTimes(1);
    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '1234',
      cowName: 'ななえ',
      estrusType: '自然発情',
      breedingMethod: '未選択',
      breedingStatus: '発情確認',
      estrusSigns: ['粘液'],
      note: '',
    }));
  });
});
