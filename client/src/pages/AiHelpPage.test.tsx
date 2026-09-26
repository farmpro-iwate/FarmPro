import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiHelpPage } from './AiHelpPage';
import * as api from '../services/api';
import * as breedingApi from '../services/breedingApi';
import * as settingsApi from '../services/settingsApi';
import * as calvingsApi from '../services/calvingsApi';
import * as motherCattleLink from '../services/motherCattleLink';
import * as masterApi from '../services/masterApi';

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
