import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiHelpPage } from './AiHelpPage';
import * as api from '../services/api';
import * as calfApi from '../services/calfApi';
import * as breedingApi from '../services/breedingApi';
import * as settingsApi from '../services/settingsApi';
import * as calvingsApi from '../services/calvingsApi';
import * as motherCattleLink from '../services/motherCattleLink';
import * as masterApi from '../services/masterApi';
import * as treatmentApi from '../services/treatmentApi';
import * as vaccineApi from '../services/vaccineApi';
import * as feedInventoryApi from '../services/feedInventoryApi';
import * as feedCostingSnapshot from '../services/feedCostingSnapshot';
import * as farmAiClient from '../services/farmAiClient';

const AUTH_USER_KEY = 'farmpro.authUser';

afterEach(() => {
  cleanup();
});

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
    expect(screen.queryByText(/まだこの質問の案内は登録されていません/)).not.toBeInTheDocument();
  });
});



describe('AiHelpPage AIで記録の飼料入庫入口', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('「123番、入庫」を農場データ質問へ流さず飼料入庫として開始する', async () => {
    setPlan('standard');
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, '123番、入庫');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料入庫を始めます' })).toBeInTheDocument();
    expect(screen.getByText(/入庫する飼料名・数量・単位を入力してください/)).toBeInTheDocument();
    expect(screen.queryByLabelText('入庫金額（税込）')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'この内容で入庫登録' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '農場データからの回答' })).not.toBeInTheDocument();
  });

  it('飼料名・数量・単位が揃うと入庫金額の確認へ進む', async () => {
    setPlan('standard');
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, '腹づくりを10袋入庫');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料入庫の登録候補' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '飼料名：腹づくり')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '数量：10袋')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /入庫金額（税込）/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'この内容で入庫登録' })).toBeInTheDocument();
  });

  it('1袋重量と入庫金額を複数桁で入力できる', async () => {
    setPlan('standard');
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, '腹づくりを10袋入庫');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    const bagWeight = screen.getByRole('spinbutton', { name: '1袋の重量（kg）' });
    const totalPrice = screen.getByRole('spinbutton', { name: '入庫金額（税込）' });

    await user.type(bagWeight, '20');
    await user.type(totalPrice, '15000');

    expect(bagWeight).toHaveValue(20);
    expect(totalPrice).toHaveValue(15000);
  });

});

describe('AiHelpPage AIで記録の自然文入口', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('「はなみつ、今日発情」を名号から発情登録へつなぐ', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue([
      {
        id: 1,
        earTag: '7358',
        identificationNumber: '',
        name: 'はなみつ',
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
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, 'はなみつ、今日発情');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('7358 はなみつですね。発情を登録します。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '発情登録を始めます' })).toBeInTheDocument();
  });
});


describe('AiHelpPage モード切替の状態分離', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('AIで記録からAIに聞くへ切り替えると登録途中状態を消す', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue([
      {
        id: 1,
        earTag: '7358',
        identificationNumber: '',
        name: 'はなみつ',
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
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
        <Link to="/ai-help?mode=ask">AIに聞くへ切替</Link>
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, 'はなみつ、今日発情');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByRole('heading', { name: '発情登録を始めます' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'AIに聞くへ切替' }));

    expect(await screen.findByRole('heading', { name: 'AIに聞く' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '発情登録を始めます' })).not.toBeInTheDocument();
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


describe('AiHelpPage 会話式授精登録の完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('牛確認から授精登録完了まで進める', async () => {
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

    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({
      estrousCycleDays: 21,
    } as any);

    vi.spyOn(masterApi, 'getMasterList').mockResolvedValue([
      {
        id: 101,
        category: 'sire',
        name: '福之姫',
        code: 'FUKU',
        active: true,
      },
    ] as any);

    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({
      id: 'breeding-test-2',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-09-21',
      bullName: '福之姫',
      bullMasterId: 101,
      inseminatorName: '佐藤',
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
      estrusSigns: [],
      estrusSignsOther: '',
      note: '',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '1234 授精を登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('1234 ななえですね。授精を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByRole('combobox', { name: '種雄牛' }), '福之姫');
    await user.click(await screen.findByRole('option', { name: /福之姫/ }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('授精師'), '佐藤');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();
    expect(screen.getByText(/種雄牛：/)).toBeInTheDocument();
    expect(screen.getByText(/福之姫/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の授精を登録しました。完了です。')).toBeInTheDocument();
    expect(createBreeding).toHaveBeenCalledTimes(1);
    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '1234',
      cowName: 'ななえ',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      bullName: '福之姫',
      inseminatorName: '佐藤',
      note: '',
    }));
  });
});


describe('AiHelpPage 会話式受精卵移植登録の完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('牛確認から受精卵移植登録完了まで進める', async () => {
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

    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({
      estrousCycleDays: 21,
    } as any);

    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({
      id: 'breeding-test-3',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '',
      breedingMethod: '受精卵移植',
      breedingStatus: '移植実施',
      inseminationDate: '',
      bullName: '',
      inseminatorName: '',
      transferPlannedDate: '',
      transferDate: '2026-09-21',
      transferCancelReason: '',
      embryoNumber: 'ET-001',
      collectionDate: '',
      embryoType: '未選択',
      donorCowName: 'みどり',
      donorCowEarTag: '',
      embryoSireName: '福之姫',
      embryoGrade: '',
      strawNumber: '',
      supplierName: '',
      transferTechnician: '佐藤',
      nextHeatExpectedDate: '',
      pregnancyCheckExpectedDate: '',
      pregnancyCheckDate: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
      expectedCalvingDate: '',
      estrusSigns: [],
      estrusSignsOther: '',
      note: '',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '1234 ETを登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('1234 ななえですね。受精卵移植を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByLabelText('受精卵番号・管理番号'), 'ET-001');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('供卵牛名'), 'みどり');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('受精卵の父牛'), '福之姫');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('移植担当者'), '佐藤');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の受精卵移植を登録しました。完了です。')).toBeInTheDocument();
    expect(createBreeding).toHaveBeenCalledTimes(1);
    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '1234',
      cowName: 'ななえ',
      breedingMethod: '受精卵移植',
      breedingStatus: '移植実施',
      embryoNumber: 'ET-001',
      donorCowName: 'みどり',
      embryoSireName: '福之姫',
      transferTechnician: '佐藤',
      note: '',
    }));
  });
});


describe('AiHelpPage 会話式妊娠鑑定登録の完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('牛確認から妊娠鑑定登録完了まで進める', async () => {
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

    const existingBreeding = {
      id: 'breeding-existing-1',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '2026-08-01',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-08-02',
      inseminationCost: '',
      bullName: '福之姫',
      bullMasterId: undefined,
      inseminatorName: '佐藤',
      inseminatorMasterId: undefined,
      transferPlannedDate: '',
      transferDate: '',
      transferCost: '',
      transferCancelReason: '',
      embryoNumber: '',
      collectionDate: '',
      embryoType: '未選択',
      donorCowName: '',
      donorCowEarTag: '',
      embryoSireName: '',
      embryoSireMasterId: undefined,
      embryoGrade: '',
      strawNumber: '',
      supplierName: '',
      supplierMasterId: undefined,
      transferTechnician: '',
      transferTechnicianMasterId: undefined,
      nextHeatExpectedDate: '2026-08-23',
      pregnancyCheckExpectedDate: '2026-09-13',
      pregnancyCheckDate: '',
      pregnancyCheckCost: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
      expectedCalvingDate: '2027-05-14',
      estrusSigns: [],
      estrusSignsOther: '',
      synchronizationProgramId: undefined,
      synchronizationProgramName: undefined,
      sourceScheduleId: undefined,
      note: '既存メモ',
    };

    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([existingBreeding] as any);
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({
      ...existingBreeding,
      pregnancyCheckDate: '2026-09-21',
      pregnancyResult: '受胎',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '1234 妊娠鑑定を登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('1234 ななえですね。妊娠鑑定を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '受胎' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の妊娠鑑定を登録しました。完了です。')).toBeInTheDocument();
    expect(updateBreeding).toHaveBeenCalledTimes(1);
    expect(updateBreeding).toHaveBeenCalledWith(
      'breeding-existing-1',
      expect.objectContaining({
        cowEarTag: '1234',
        cowName: 'ななえ',
        breedingMethod: '種付',
        breedingStatus: '種付実施',
        pregnancyResult: '受胎',
        recheckExpectedDate: '',
        note: '既存メモ',
      }),
    );
  });
});


describe('AiHelpPage 会話式分娩登録の完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('牛確認から分娩と子牛台帳登録完了まで進める', async () => {
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

    const existingBreeding = {
      id: 'breeding-existing-2',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '2025-12-10',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2025-12-11',
      bullName: '福之姫',
      inseminatorName: '佐藤',
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
      pregnancyCheckDate: '2026-01-20',
      pregnancyResult: '受胎',
      recheckExpectedDate: '',
      expectedCalvingDate: '2026-09-22',
      estrusSigns: [],
      estrusSignsOther: '',
      note: '',
    };

    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([existingBreeding] as any);

    const createCalving = vi.spyOn(calvingsApi, 'createCalving').mockResolvedValue({
      id: 'calving-test-1',
      cowId: '1234',
      cowName: 'ななえ',
      expectedCalvingDate: '2026-09-22',
      actualCalvingDate: '2026-09-21',
      calfName: '5678',
      calfSex: 'メス',
      birthWeightKg: 32,
      calvingResult: '自然分娩',
      colostrumStatus: '未確認',
      memo: '',
      registeredToCalfLedger: false,
      breedingId: 'breeding-existing-2',
    } as any);

    vi.spyOn(motherCattleLink, 'ensureCalvingMotherCattle').mockResolvedValue({
      id: 'calving-test-1',
      cowId: '1234',
      cowName: 'ななえ',
      actualCalvingDate: '2026-09-21',
      calfName: '5678',
      calfSex: 'メス',
      birthWeightKg: 32,
      calvingResult: '自然分娩',
      breedingId: 'breeding-existing-2',
    } as any);

    const registerCalf = vi.spyOn(calvingsApi, 'registerCalvingToCalfLedger').mockResolvedValue({
      ok: true,
      calf: { id: 1, earTag: '5678' },
      calving: { id: 'calving-test-1' },
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '1234 分娩を登録して');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByText('1234 ななえですね。分娩を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '正常' }));
    await user.type(screen.getByLabelText('子牛耳標番号'), '5678');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メス' }));
    await user.type(screen.getByLabelText('出生体重（kg）'), '32');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の分娩と子牛台帳への登録が完了しました。')).toBeInTheDocument();
    expect(createCalving).toHaveBeenCalledTimes(1);
    expect(createCalving).toHaveBeenCalledWith(expect.objectContaining({
      cowId: '1234',
      cowName: 'ななえ',
      expectedCalvingDate: '2026-09-22',
      calfName: '5678',
      calfSex: 'メス',
      birthWeightKg: 32,
      calvingResult: '正常',
      breedingId: 'breeding-existing-2',
    }));
    expect(registerCalf).toHaveBeenCalledWith('calving-test-1');
  });
});


describe('AiHelpPage Standard farm-data AI integration', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('「さちこの最終発情日は？」を農場データAIへ送り回答を表示する', async () => {
    setPlan('standard');
    window.localStorage.setItem('farmpro.authToken', 'test-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        handled: true,
        answer: [
          'さちこ 耳標:9084の最終発情日は2026-09-01です。',
          '',
          'こんな聞き方もできます。',
          '・さちこの直近の種付日は？',
          '・さちこの今の状況を教えて',
        ].join('\n'),
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), 'さちこの最終発情日は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/farm-ai/question',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText(/さちこ 耳標:9084の最終発情日は2026-09-01です/)).toBeInTheDocument();
    expect(screen.getByText(/こんな聞き方もできます/)).toBeInTheDocument();
  });
});


describe('AiHelpPage AIで記録の治療入口', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('「1234 治療を登録して」を対象牛確認から治療登録へつなぐ', async () => {
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
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, '1234 治療を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。治療を登録します。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '治療登録を始めます' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'はい、今日です' })).toBeInTheDocument();
  });
});


describe('AiHelpPage AIで記録のワクチン入口', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('「1234 ワクチンを登録して」を対象牛確認からワクチン登録へつなぐ', async () => {
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
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, '1234 ワクチンを登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。ワクチンを登録します。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ワクチン登録を始めます' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'はい、今日です' })).toBeInTheDocument();
  });
});


describe('AiHelpPage AIで記録の治療登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('対象牛確認から治療登録完了まで進める', async () => {
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

    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment').mockResolvedValue({
      id: 'treatment-test-1',
      recordType: '治療',
      targetNumber: '1234',
      targetName: 'ななえ',
      symptom: '発熱、食欲低下',
      treatmentDate: '2026-09-26',
      medicine: '',
      medicineCost: '',
      medicalFee: '',
      withdrawalEndDate: '',
      progress: '治療中',
      note: '',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 治療を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。治療を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByLabelText('症状・治療内容'), '発熱、食欲低下');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '薬剤なし・不明' }));
    await user.click(screen.getByRole('button', { name: '費用なし・不明' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の治療を登録しました。完了です。')).toBeInTheDocument();
    expect(createTreatment).toHaveBeenCalledTimes(1);
    expect(createTreatment).toHaveBeenCalledWith(expect.objectContaining({
      recordType: '治療',
      targetNumber: '1234',
      targetName: 'ななえ',
      symptom: '発熱、食欲低下',
      medicine: '',
      medicineCost: '',
      medicalFee: '',
      progress: '治療中',
    }));
  });
});


describe('AiHelpPage AIで記録のワクチン登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('対象牛確認からワクチン登録完了まで進める', async () => {
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

    const createVaccine = vi.spyOn(vaccineApi, 'createVaccine').mockResolvedValue({
      id: 'vaccine-test-1',
      targetType: '成牛',
      targetNumber: '1234',
      targetName: 'ななえ',
      vaccineName: '5種混合',
      vaccineCost: '',
      vaccinationDate: '2026-09-26',
      nextDueDate: '',
      status: '接種済み',
      note: '',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 ワクチンを登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。ワクチンを登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByRole('combobox'), '5種混合');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '予定なし・不明' }));
    await user.click(screen.getByRole('button', { name: '費用なし・不明' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ のワクチン接種を登録しました。完了です。')).toBeInTheDocument();
    expect(createVaccine).toHaveBeenCalledTimes(1);
    expect(createVaccine).toHaveBeenCalledWith(expect.objectContaining({
      targetType: '成牛',
      targetNumber: '1234',
      targetName: 'ななえ',
      vaccineName: '5種混合',
      vaccineCost: '',
      nextDueDate: '',
      status: '接種済み',
    }));
  });
});


describe('AiHelpPage AIで記録の発情登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('対象牛確認から発情登録完了まで進める', async () => {
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
      id: 'breeding-test-record-heat',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '2026-09-26',
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
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 発情を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

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


describe('AiHelpPage AIで記録の授精登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('対象牛確認から授精登録完了まで進める', async () => {
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

    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({
      estrousCycleDays: 21,
    } as any);

    vi.spyOn(masterApi, 'getMasterList').mockResolvedValue([
      {
        id: 101,
        category: 'sire',
        name: '福之姫',
        code: 'FUKU',
        active: true,
      },
    ] as any);

    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({
      id: 'breeding-test-record-insemination',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-09-26',
      bullName: '福之姫',
      bullMasterId: 101,
      inseminatorName: '佐藤',
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
      estrusSigns: [],
      estrusSignsOther: '',
      note: '',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 授精を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。授精を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByRole('combobox', { name: '種雄牛' }), '福之姫');
    await user.click(await screen.findByRole('option', { name: /福之姫/ }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('授精師'), '佐藤');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の授精を登録しました。完了です。')).toBeInTheDocument();
    expect(createBreeding).toHaveBeenCalledTimes(1);
    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '1234',
      cowName: 'ななえ',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      bullName: '福之姫',
      inseminatorName: '佐藤',
      note: '',
    }));
  });
});


describe('AiHelpPage AIで記録の受精卵移植登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('対象牛確認から受精卵移植登録完了まで進める', async () => {
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

    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({
      estrousCycleDays: 21,
    } as any);

    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({
      id: 'breeding-test-record-transfer',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '',
      breedingMethod: '受精卵移植',
      breedingStatus: '移植実施',
      inseminationDate: '',
      bullName: '',
      inseminatorName: '',
      transferPlannedDate: '',
      transferDate: '2026-09-26',
      transferCancelReason: '',
      embryoNumber: 'ET-001',
      collectionDate: '',
      embryoType: '未選択',
      donorCowName: 'みどり',
      donorCowEarTag: '',
      embryoSireName: '福之姫',
      embryoGrade: '',
      strawNumber: '',
      supplierName: '',
      transferTechnician: '佐藤',
      nextHeatExpectedDate: '',
      pregnancyCheckExpectedDate: '',
      pregnancyCheckDate: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
      expectedCalvingDate: '',
      estrusSigns: [],
      estrusSignsOther: '',
      note: '',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 ETを登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。受精卵移植を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByLabelText('受精卵番号・管理番号'), 'ET-001');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('供卵牛名'), 'みどり');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('受精卵の父牛'), '福之姫');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('移植担当者'), '佐藤');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の受精卵移植を登録しました。完了です。')).toBeInTheDocument();
    expect(createBreeding).toHaveBeenCalledTimes(1);
    expect(createBreeding).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '1234',
      cowName: 'ななえ',
      breedingMethod: '受精卵移植',
      breedingStatus: '移植実施',
      embryoNumber: 'ET-001',
      donorCowName: 'みどり',
      embryoSireName: '福之姫',
      transferTechnician: '佐藤',
      note: '',
    }));
  });
});


describe('AiHelpPage AIで記録の妊娠鑑定登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('対象牛確認から妊娠鑑定登録完了まで進める', async () => {
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

    const existingBreeding = {
      id: 'breeding-existing-record-pregnancy',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '2026-08-01',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-08-02',
      inseminationCost: '',
      bullName: '福之姫',
      bullMasterId: undefined,
      inseminatorName: '佐藤',
      inseminatorMasterId: undefined,
      transferPlannedDate: '',
      transferDate: '',
      transferCost: '',
      transferCancelReason: '',
      embryoNumber: '',
      collectionDate: '',
      embryoType: '未選択',
      donorCowName: '',
      donorCowEarTag: '',
      embryoSireName: '',
      embryoSireMasterId: undefined,
      embryoGrade: '',
      strawNumber: '',
      supplierName: '',
      supplierMasterId: undefined,
      transferTechnician: '',
      transferTechnicianMasterId: undefined,
      nextHeatExpectedDate: '2026-08-23',
      pregnancyCheckExpectedDate: '2026-09-13',
      pregnancyCheckDate: '',
      pregnancyCheckCost: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
      expectedCalvingDate: '2027-05-14',
      estrusSigns: [],
      estrusSignsOther: '',
      synchronizationProgramId: undefined,
      synchronizationProgramName: undefined,
      sourceScheduleId: undefined,
      note: '既存メモ',
    };

    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([existingBreeding] as any);
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({
      ...existingBreeding,
      pregnancyCheckDate: '2026-09-26',
      pregnancyResult: '受胎',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 妊娠鑑定を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。妊娠鑑定を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '受胎' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の妊娠鑑定を登録しました。完了です。')).toBeInTheDocument();
    expect(updateBreeding).toHaveBeenCalledTimes(1);
    expect(updateBreeding).toHaveBeenCalledWith(
      'breeding-existing-record-pregnancy',
      expect.objectContaining({
        cowEarTag: '1234',
        cowName: 'ななえ',
        breedingMethod: '種付',
        breedingStatus: '種付実施',
        pregnancyResult: '受胎',
        recheckExpectedDate: '',
        note: '既存メモ',
      }),
    );
  });
});


describe('AiHelpPage AIで記録の分娩登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('対象牛確認から分娩と子牛台帳登録完了まで進める', async () => {
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

    const existingBreeding = {
      id: 'breeding-existing-record-calving',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '2025-12-10',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2025-12-11',
      bullName: '福之姫',
      inseminatorName: '佐藤',
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
      pregnancyCheckDate: '2026-01-20',
      pregnancyResult: '受胎',
      recheckExpectedDate: '',
      expectedCalvingDate: '2026-09-27',
      estrusSigns: [],
      estrusSignsOther: '',
      note: '',
    };

    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([existingBreeding] as any);

    const createCalving = vi.spyOn(calvingsApi, 'createCalving').mockResolvedValue({
      id: 'calving-test-record-1',
      cowId: '1234',
      cowName: 'ななえ',
      expectedCalvingDate: '2026-09-27',
      actualCalvingDate: '2026-09-26',
      calfName: '5678',
      calfSex: 'メス',
      birthWeightKg: 32,
      calvingResult: '正常',
      colostrumStatus: '未確認',
      memo: '',
      registeredToCalfLedger: false,
      breedingId: 'breeding-existing-record-calving',
    } as any);

    vi.spyOn(motherCattleLink, 'ensureCalvingMotherCattle').mockResolvedValue({
      id: 'calving-test-record-1',
      cowId: '1234',
      cowName: 'ななえ',
      actualCalvingDate: '2026-09-26',
      calfName: '5678',
      calfSex: 'メス',
      birthWeightKg: 32,
      calvingResult: '正常',
      breedingId: 'breeding-existing-record-calving',
    } as any);

    const registerCalf = vi.spyOn(calvingsApi, 'registerCalvingToCalfLedger').mockResolvedValue({
      ok: true,
      calf: { id: 1, earTag: '5678' },
      calving: { id: 'calving-test-record-1' },
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 分娩を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('1234 ななえですね。分娩を登録します。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '正常' }));
    await user.type(screen.getByLabelText('子牛耳標番号'), '5678');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メス' }));
    await user.type(screen.getByLabelText('出生体重（kg）'), '32');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('1234 ななえ の分娩と子牛台帳への登録が完了しました。')).toBeInTheDocument();
    expect(createCalving).toHaveBeenCalledTimes(1);
    expect(createCalving).toHaveBeenCalledWith(expect.objectContaining({
      cowId: '1234',
      cowName: 'ななえ',
      expectedCalvingDate: '2026-09-27',
      calfName: '5678',
      calfSex: 'メス',
      birthWeightKg: 32,
      calvingResult: '正常',
      breedingId: 'breeding-existing-record-calving',
    }));
    expect(registerCalf).toHaveBeenCalledWith('calving-test-record-1');
  });
});


describe('AiHelpPage AIで記録の飼料使用登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('子牛群への飼料使用を確認から登録完了まで進める', async () => {
    setPlan('standard');

    const costing = {
      averageUnitCost: 58,
      usedCost: 288,
      allocations: [],
    } as any;

    const buildCosting = vi.spyOn(feedCostingSnapshot, 'buildFeedCostingSnapshot').mockResolvedValue(costing);
    const createFeedInventory = vi.spyOn(feedInventoryApi, 'createFeedInventory').mockResolvedValue({
      id: 'feed-use-test-1',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '腹づくりを子牛群に5kg使用');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料使用の登録候補' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '飼料名：腹づくり')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '使用先：子牛群')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '数量：5kg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('腹づくりを子牛群へ5kg使用した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(buildCosting).toHaveBeenCalledTimes(1);
    expect(buildCosting).toHaveBeenCalledWith(
      expect.objectContaining({
        feedName: '腹づくり',
        transactionType: '出庫',
        quantity: '5',
        unit: 'kg',
      }),
      'calfGroup',
      undefined,
    );
    expect(createFeedInventory).toHaveBeenCalledTimes(1);
    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      feedName: '腹づくり',
      transactionType: '出庫',
      quantity: '5',
      unit: 'kg',
      unitPrice: '58',
      totalPrice: '288',
      costing,
      memo: 'AIで記録から登録',
    }));
  });
});


describe('AiHelpPage AIで記録の飼料入庫登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('飼料入庫候補から1袋重量・入庫金額を入力して登録完了まで進める', async () => {
    setPlan('standard');

    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({
      defaultTaxRate: '10',
    } as any);

    const createFeedInventory = vi.spyOn(feedInventoryApi, 'createFeedInventory').mockResolvedValue({
      id: 'feed-inbound-test-1',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '腹づくりを10袋入庫');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料入庫の登録候補' })).toBeInTheDocument();

    await user.type(screen.getByRole('spinbutton', { name: '1袋の重量（kg）' }), '20');
    await user.type(screen.getByRole('spinbutton', { name: /入庫金額（税込）/ }), '15000');
    await user.click(screen.getByRole('button', { name: 'この内容で入庫登録' }));

    expect(await screen.findByText('腹づくりを10袋入庫した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(createFeedInventory).toHaveBeenCalledTimes(1);
    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      feedName: '腹づくり',
      transactionType: '入庫',
      quantity: '10',
      unit: '袋',
      bagWeightKg: '20',
      totalWeightKg: '200',
      totalPrice: '15000',
      taxRate: '10',
      taxExcludedPrice: '13636',
      taxAmount: '1364',
      memo: 'AIで記録から入庫',
    }));
  });
});


describe('AiHelpPage AIで記録の個体別飼料使用登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('耳標番号の成牛を特定して飼料使用を登録完了まで進める', async () => {
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
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);

    const costing = {
      averageUnitCost: 58,
      usedCost: 288,
      allocations: [
        {
          animalType: 'cattle',
          animalId: '1',
          earTag: '1234',
          animalName: 'ななえ',
          quantity: 5,
          cost: 288,
        },
      ],
    } as any;

    const buildCosting = vi.spyOn(feedCostingSnapshot, 'buildFeedCostingSnapshot').mockResolvedValue(costing);
    const createFeedInventory = vi.spyOn(feedInventoryApi, 'createFeedInventory').mockResolvedValue({
      id: 'feed-use-individual-test-1',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234番に腹づくりを5kg使用');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料使用の登録候補' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '使用先：1234 ななえ')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('腹づくりを1234 ななえへ5kg使用した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(buildCosting).toHaveBeenCalledTimes(1);
    expect(buildCosting).toHaveBeenCalledWith(
      expect.objectContaining({
        feedName: '腹づくり',
        transactionType: '出庫',
        quantity: '5',
        unit: 'kg',
      }),
      'individual',
      expect.objectContaining({
        animalType: 'cattle',
        animalId: '1',
        earTag: '1234',
        animalName: 'ななえ',
      }),
    );
    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      feedName: '腹づくり',
      transactionType: '出庫',
      quantity: '5',
      unit: 'kg',
      unitPrice: '58',
      totalPrice: '288',
      costing,
    }));
  });
});


describe('AiHelpPage AIで記録の子牛個体別飼料使用登録完了フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('子牛番号から対象子牛を特定して飼料使用を登録完了まで進める', async () => {
    setPlan('standard');

    vi.spyOn(api, 'getCattleList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([
      {
        id: 21,
        calfNumber: '5678',
        temporaryCalfNumber: '',
        name: 'こはる',
        birthday: '2026-08-01',
        motherName: 'ななえ',
        recipientCowName: '',
        motherCowName: '',
        managementStatus: '哺育中',
      },
    ] as any);

    const costing = {
      averageUnitCost: 58,
      usedCost: 58,
      allocations: [
        {
          animalType: 'calf',
          animalId: '21',
          earTag: '5678',
          animalName: 'こはる',
          quantity: 1,
          cost: 58,
        },
      ],
    } as any;

    const buildCosting = vi.spyOn(feedCostingSnapshot, 'buildFeedCostingSnapshot').mockResolvedValue(costing);
    const createFeedInventory = vi.spyOn(feedInventoryApi, 'createFeedInventory').mockResolvedValue({
      id: 'feed-use-calf-test-1',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '5678番に腹づくりを1kg使用');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料使用の登録候補' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '使用先：5678 こはる')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('腹づくりを5678 こはるへ1kg使用した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(buildCosting).toHaveBeenCalledWith(
      expect.objectContaining({
        feedName: '腹づくり',
        transactionType: '出庫',
        quantity: '1',
        unit: 'kg',
      }),
      'individual',
      expect.objectContaining({
        animalType: 'calf',
        animalId: '21',
        earTag: '5678',
        animalName: 'こはる',
        motherName: 'ななえ',
      }),
    );
    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      feedName: '腹づくり',
      transactionType: '出庫',
      quantity: '1',
      unit: 'kg',
      unitPrice: '58',
      totalPrice: '58',
      costing,
    }));
  });
});


describe('AiHelpPage AIで記録の個体別飼料使用・同番号選択フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('成牛と子牛に同じ番号がある場合、子牛を選んで登録できる', async () => {
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

    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([
      {
        id: 21,
        calfNumber: '1234',
        temporaryCalfNumber: '',
        name: 'こはる',
        birthday: '2026-08-01',
        motherName: 'ななえ',
        recipientCowName: '',
        motherCowName: '',
        managementStatus: '哺育中',
      },
    ] as any);

    const costing = {
      averageUnitCost: 58,
      usedCost: 58,
      allocations: [],
    } as any;

    const buildCosting = vi.spyOn(feedCostingSnapshot, 'buildFeedCostingSnapshot').mockResolvedValue(costing);
    const createFeedInventory = vi.spyOn(feedInventoryApi, 'createFeedInventory').mockResolvedValue({
      id: 'feed-use-duplicate-target-test-1',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234番に腹づくりを1kg使用');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText(/番号 1234 の牛が2頭見つかりました/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /成牛｜1234 ななえ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /子牛｜1234 こはる／母牛 ななえ/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /子牛｜1234 こはる／母牛 ななえ/ }));
    expect(screen.getByText((_, element) => element?.textContent === '使用先：1234 こはる')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('腹づくりを1234 こはるへ1kg使用した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(buildCosting).toHaveBeenCalledWith(
      expect.objectContaining({
        feedName: '腹づくり',
        transactionType: '出庫',
        quantity: '1',
        unit: 'kg',
      }),
      'individual',
      expect.objectContaining({
        animalType: 'calf',
        animalId: '21',
        earTag: '1234',
        animalName: 'こはる',
        motherName: 'ななえ',
      }),
    );
    expect(createFeedInventory).toHaveBeenCalledTimes(1);
  });
});


describe('AiHelpPage AIで記録の仮番号子牛・個体別飼料使用フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('表示上の仮番号から子牛を特定して飼料使用を登録できる', async () => {
    setPlan('standard');

    vi.spyOn(api, 'getCattleList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([
      {
        id: 31,
        calfNumber: 'TEMP-20260926-001',
        temporaryCalfNumber: 'TEMP-20260926-001',
        name: 'こゆき',
        birthday: '2026-09-26',
        motherName: 'ななえ',
        recipientCowName: '',
        motherCowName: '',
        managementStatus: '哺育中',
      },
    ] as any);

    const costing = {
      averageUnitCost: 58,
      usedCost: 58,
      allocations: [],
    } as any;

    const buildCosting = vi.spyOn(feedCostingSnapshot, 'buildFeedCostingSnapshot').mockResolvedValue(costing);
    const createFeedInventory = vi.spyOn(feedInventoryApi, 'createFeedInventory').mockResolvedValue({
      id: 'feed-use-temporary-calf-test-1',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '0926番に腹づくりを1kg使用');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料使用の登録候補' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '使用先：仮-0926 こゆき')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('腹づくりを仮-0926 こゆきへ1kg使用した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(buildCosting).toHaveBeenCalledWith(
      expect.objectContaining({
        feedName: '腹づくり',
        transactionType: '出庫',
        quantity: '1',
        unit: 'kg',
      }),
      'individual',
      expect.objectContaining({
        animalType: 'calf',
        animalId: '31',
        earTag: '仮-0926',
        animalName: 'こゆき',
        motherName: 'ななえ',
      }),
    );
    expect(createFeedInventory).toHaveBeenCalledTimes(1);
  });
});


describe('AiHelpPage AIで記録は確認前に自動保存しない', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('発情の登録内容確認画面まで進んでも登録ボタンを押すまでは保存しない', async () => {
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

    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({} as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 発情を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '自然発情' }));
    await user.click(screen.getByRole('button', { name: '粘液' }));
    await user.click(screen.getByRole('button', { name: 'これで次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));

    expect(screen.getByRole('heading', { name: '登録内容を確認してください' })).toBeInTheDocument();
    expect(createBreeding).not.toHaveBeenCalled();
  });
});


describe('AiHelpPage AIのプラン境界', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('Freeでは農場データ質問をFarm AIへ送らない', async () => {
    setPlan('free');
    const askFarmAi = vi.spyOn(farmAiClient, 'askFarmAi').mockResolvedValue({
      handled: true,
      answer: '前回授精は2026-09-01です。',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '1234番の前回授精は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(askFarmAi).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '農場データからの回答' })).not.toBeInTheDocument();
  });

  it('Standardでは農場データ質問をFarm AIへ送る', async () => {
    setPlan('standard');
    const askFarmAi = vi.spyOn(farmAiClient, 'askFarmAi').mockResolvedValue({
      handled: true,
      answer: '前回授精は2026-09-01です。',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('分からないことを入力'), '1234番の前回授精は？');
    await user.click(screen.getByRole('button', { name: 'AIに聞く' }));

    expect(await screen.findByRole('heading', { name: '農場データからの回答' })).toBeInTheDocument();
    expect(screen.getByText('前回授精は2026-09-01です。')).toBeInTheDocument();
    expect(askFarmAi).toHaveBeenCalledWith('1234番の前回授精は？');
  });
});


describe('AiHelpPage AIで記録の発情保存失敗フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('保存に失敗した場合は完了扱いにせずエラーを表示する', async () => {
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

    vi.spyOn(breedingApi, 'createBreeding').mockRejectedValue(new Error('保存に失敗しました'));

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 発情を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '自然発情' }));
    await user.click(screen.getByRole('button', { name: '粘液' }));
    await user.click(screen.getByRole('button', { name: 'これで次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('1234 ななえ の発情を登録しました。完了です。')).not.toBeInTheDocument();
  });
});


describe('AiHelpPage AIで記録の飼料使用保存失敗フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('飼料使用の保存に失敗した場合は完了扱いにせずエラーを表示する', async () => {
    setPlan('standard');

    vi.spyOn(feedCostingSnapshot, 'buildFeedCostingSnapshot').mockResolvedValue({
      averageUnitCost: 58,
      usedCost: 288,
      allocations: [],
    } as any);
    vi.spyOn(feedInventoryApi, 'createFeedInventory').mockRejectedValue(new Error('飼料使用の保存に失敗しました'));

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '腹づくりを子牛群に5kg使用');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料使用の登録候補' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('飼料使用の保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('腹づくりを子牛群へ5kg使用した記録を登録しました。完了です。')).not.toBeInTheDocument();
  });
});


describe('AiHelpPage AIで記録の飼料使用保存失敗後の再操作フロー', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1回目の保存に失敗しても再度登録すると成功できる', async () => {
    setPlan('standard');

    vi.spyOn(feedCostingSnapshot, 'buildFeedCostingSnapshot').mockResolvedValue({
      averageUnitCost: 58,
      usedCost: 288,
      allocations: [],
    } as any);
    const createFeedInventoryMock = vi.spyOn(feedInventoryApi, 'createFeedInventory')
      .mockRejectedValueOnce(new Error('飼料使用の保存に失敗しました'))
      .mockResolvedValueOnce({} as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), '腹づくりを子牛群に5kg使用');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料使用の登録候補' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('飼料使用の保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('腹づくりを子牛群へ5kg使用した記録を登録しました。完了です。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この内容で登録' }));

    expect(await screen.findByText('腹づくりを子牛群へ5kg使用した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(createFeedInventoryMock).toHaveBeenCalledTimes(2);
  });
});


describe('AiHelpPage AIで記録の入力ミス', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('登録内容として解釈できない入力はFarm AIへ送らず入力し直しを案内する', async () => {
    setPlan('standard');
    const askFarmAiSpy = vi.spyOn(farmAiClient, 'askFarmAi');
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), 'あいうえお');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('登録内容を確認できませんでした。内容を入力し直してください。')).toBeInTheDocument();
    expect(askFarmAiSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '農場データからの回答' })).not.toBeInTheDocument();
  });
});


describe('AiHelpPage AIで記録の途中キャンセル', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('登録途中で「登録をやめる」を押すと未保存のまま入力前の状態へ戻る', async () => {
    setPlan('standard');
    const saveSpy = vi.spyOn(breedingApi, 'createBreeding');
    vi.spyOn(api, 'getCattleList').mockResolvedValue([
      {
        id: 1,
        earTag: '7358',
        identificationNumber: '',
        name: 'はなみつ',
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
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText('登録したい内容を入力');
    await user.type(input, 'はなみつ、今日発情');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByRole('heading', { name: '発情登録を始めます' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登録をやめる' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登録をやめる' }));

    expect(screen.queryByRole('heading', { name: '発情登録を始めます' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登録をやめる' })).not.toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(saveSpy).not.toHaveBeenCalled();
  });
});


describe('AiHelpPage AIで記録の省略表現フロー回帰', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each([
    ['1234 種付', '授精登録を始めます'],
    ['1234 ET', '受精卵移植を登録します'],
    ['1234 妊鑑', '妊娠鑑定を登録します'],
    ['1234 投薬', '治療登録を始めます'],
    ['1234 予防接種', 'ワクチン登録を始めます'],
  ])('「%s」から既存の登録フローへ入れる', async (text, expected) => {
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
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), text);
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText(new RegExp(expected))).toBeInTheDocument();
  });

  it('「ライグラス500k入庫」を候補表示から保存完了まで進める', async () => {
    setPlan('standard');

    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({
      defaultTaxRate: '10',
    } as any);

    const createFeedInventory = vi.spyOn(feedInventoryApi, 'createFeedInventory').mockResolvedValue({
      id: 'feed-inbound-k-test-1',
    } as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), 'ライグラス500k入庫');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(screen.getByRole('heading', { name: '飼料入庫の登録候補' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '飼料名：ライグラス')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === '数量：500kg')).toBeInTheDocument();

    await user.type(screen.getByRole('spinbutton', { name: /入庫金額（税込）/ }), '35000');
    await user.click(screen.getByRole('button', { name: 'この内容で入庫登録' }));

    expect(await screen.findByText('ライグラスを500kg入庫した記録を登録しました。完了です。')).toBeInTheDocument();
    expect(createFeedInventory).toHaveBeenCalledTimes(1);
    expect(createFeedInventory).toHaveBeenCalledWith(expect.objectContaining({
      feedName: 'ライグラス',
      transactionType: '入庫',
      quantity: '500',
      unit: 'kg',
      totalPrice: '35000',
      memo: 'AIで記録から入庫',
    }));
  });
});


describe('AiHelpPage AIで記録の主要保存失敗ガード', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  const cattle = [{
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
  }] as any;

  it('授精の保存失敗時は完了扱いにしない', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue(cattle);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
    vi.spyOn(masterApi, 'getMasterList').mockResolvedValue([{ id: 101, category: 'sire', name: '福之姫', code: 'FUKU', active: true }] as any);
    vi.spyOn(breedingApi, 'createBreeding').mockRejectedValue(new Error('授精の保存に失敗しました'));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 授精を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByRole('combobox', { name: '種雄牛' }), '福之姫');
    await user.click(await screen.findByRole('option', { name: /福之姫/ }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('授精師'), '佐藤');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('授精の保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('1234 ななえ の授精を登録しました。完了です。')).not.toBeInTheDocument();
  });

  it('受精卵移植の保存失敗時は完了扱いにしない', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue(cattle);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
    vi.spyOn(breedingApi, 'createBreeding').mockRejectedValue(new Error('受精卵移植の保存に失敗しました'));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 ETを登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByLabelText('受精卵番号・管理番号'), 'ET-001');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('供卵牛名'), 'みどり');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('受精卵の父牛'), '福之姫');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.type(screen.getByLabelText('移植担当者'), '佐藤');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('受精卵移植の保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('1234 ななえ の受精卵移植を登録しました。完了です。')).not.toBeInTheDocument();
  });

  it('妊娠鑑定の保存失敗時は完了扱いにしない', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue(cattle);
    const existingBreeding = {
      id: 'pregnancy-failure-record',
      cowEarTag: '1234',
      cowName: 'ななえ',
      heatDate: '2026-08-01',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2026-08-02',
      bullName: '福之姫',
      pregnancyResult: '未鑑定',
      note: '',
    } as any;
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([existingBreeding]);
    vi.spyOn(breedingApi, 'updateBreeding').mockRejectedValue(new Error('妊娠鑑定の保存に失敗しました'));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 妊娠鑑定を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '受胎' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('妊娠鑑定の保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('1234 ななえ の妊娠鑑定を登録しました。完了です。')).not.toBeInTheDocument();
  });

  it('分娩の保存失敗時は完了扱いにしない', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue(cattle);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([{
      id: 'calving-failure-record',
      cowEarTag: '1234',
      cowName: 'ななえ',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      inseminationDate: '2025-12-11',
      pregnancyResult: '受胎',
      expectedCalvingDate: '2026-09-27',
    }] as any);
    vi.spyOn(calvingsApi, 'createCalving').mockRejectedValue(new Error('分娩の保存に失敗しました'));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 分娩を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.click(screen.getByRole('button', { name: '正常' }));
    await user.type(screen.getByLabelText('子牛耳標番号'), '5678');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メス' }));
    await user.type(screen.getByLabelText('出生体重（kg）'), '32');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: 'メモなし' }));
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('分娩の保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('1234 ななえ の分娩と子牛台帳への登録が完了しました。')).not.toBeInTheDocument();
  });

  it('治療の保存失敗時は完了扱いにしない', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue(cattle);
    vi.spyOn(treatmentApi, 'createTreatment').mockRejectedValue(new Error('治療の保存に失敗しました'));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 治療を登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByLabelText('症状・治療内容'), '発熱、食欲低下');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '薬剤なし・不明' }));
    await user.click(screen.getByRole('button', { name: '費用なし・不明' }));
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('治療の保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('1234 ななえ の治療を登録しました。完了です。')).not.toBeInTheDocument();
  });

  it('ワクチンの保存失敗時は完了扱いにしない', async () => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue(cattle);
    vi.spyOn(vaccineApi, 'createVaccine').mockRejectedValue(new Error('ワクチンの保存に失敗しました'));

    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><AiHelpPage /></MemoryRouter>);

    await user.type(screen.getByLabelText('登録したい内容を入力'), '1234 ワクチンを登録して');
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));
    await user.click(await screen.findByRole('button', { name: 'はい、今日です' }));
    await user.type(screen.getByRole('combobox'), '5種混合');
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '予定なし・不明' }));
    await user.click(screen.getByRole('button', { name: '費用なし・不明' }));
    await user.click(screen.getByRole('button', { name: '登録' }));

    expect(await screen.findByText('ワクチンの保存に失敗しました')).toBeInTheDocument();
    expect(screen.queryByText('1234 ななえ のワクチン接種を登録しました。完了です。')).not.toBeInTheDocument();
  });
});


describe('AiHelpPage AIで記録の対象牛未検出ガード', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it.each([
    ['1234 発情を登録して'],
    ['1234 授精を登録して'],
    ['1234 ETを登録して'],
    ['1234 妊娠鑑定を登録して'],
    ['1234 分娩を登録して'],
    ['1234 治療を登録して'],
    ['1234 ワクチンを登録して'],
  ])('「%s」で対象牛が見つからない場合は保存処理へ進まない', async (text) => {
    setPlan('standard');
    vi.spyOn(api, 'getCattleList').mockResolvedValue([] as any);

    const createBreeding = vi.spyOn(breedingApi, 'createBreeding');
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding');
    const createCalving = vi.spyOn(calvingsApi, 'createCalving');
    const createTreatment = vi.spyOn(treatmentApi, 'createTreatment');
    const createVaccine = vi.spyOn(vaccineApi, 'createVaccine');

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/ai-help?mode=record']}>
        <AiHelpPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('登録したい内容を入力'), text);
    await user.click(screen.getByRole('button', { name: 'AIで記録' }));

    expect(await screen.findByText('耳標番号 1234 の牛が見つかりませんでした。')).toBeInTheDocument();
    expect(createBreeding).not.toHaveBeenCalled();
    expect(updateBreeding).not.toHaveBeenCalled();
    expect(createCalving).not.toHaveBeenCalled();
    expect(createTreatment).not.toHaveBeenCalled();
    expect(createVaccine).not.toHaveBeenCalled();
  });
});
