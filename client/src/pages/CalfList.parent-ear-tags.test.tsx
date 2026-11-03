import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalfList } from './CalfList';
import * as calfApi from '../services/calfApi';
import * as cattleApi from '../services/api';
import * as calvingsApi from '../services/calvingsApi';
import * as salesApi from '../services/salesApi';
import * as repository from '../storage/repository';
import type { Cattle } from '../types/cattle';

function calf(id: number, fields: Partial<calfApi.StoredCalf> = {}): calfApi.StoredCalf {
  return {
    id, calfNumber: `CALF-${id}`, identificationNumber: '', name: `子牛${id}`, birthday: '2026-09-01', sex: '雌',
    motherName: '', breedingMethod: '人工授精', sireName: '', startWeight: 30, currentWeight: 60,
    elapsedDays: 30, milkAmount: 0, starterAmount: 0, feedingMethod: '人工哺育', weaningPlannedDate: '',
    weaningDate: '', weaningStatus: '離乳前', weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '',
    managementStatus: '育成中', note: '', ...fields,
  };
}

function cow(id: number, earTag: string, name: string, fields: Partial<Cattle> = {}): Cattle {
  return { id, earTag, name, birthday: '2021-01-01', sex: '雌', sire: '', dam: '', parity: 1,
    blvStatus: '未検査', stage: '繁殖牛', note: '', ...fields };
}

describe('CalfList parent ear tags', () => {
  let calves: calfApi.StoredCalf[];
  let cattle: Cattle[];
  let sales: Array<Record<string, unknown> & { id: string }>;
  let beforeRender: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    calves = [];
    cattle = [];
    sales = [];
    beforeRender = '';
    vi.spyOn(calfApi, 'getCalfList').mockImplementation(async () => calves);
    vi.spyOn(cattleApi, 'getCattleList').mockImplementation(async () => cattle);
    vi.spyOn(calvingsApi, 'getCalfRecoveryCandidates').mockResolvedValue([]);
    vi.spyOn(repository, 'getAllRecords').mockImplementation(async store => {
      if (store !== 'sales') throw new Error(`Unexpected store read: ${store}`);
      return sales as any;
    });
    vi.spyOn(salesApi, 'getSalesList').mockRejectedValue(new Error('Cloud sales reader must not be used'));
    vi.spyOn(calfApi, 'createCalf').mockRejectedValue(new Error('Unexpected calf write'));
    vi.spyOn(calfApi, 'updateCalf').mockRejectedValue(new Error('Unexpected calf write'));
    vi.spyOn(calfApi, 'deleteCalf').mockRejectedValue(new Error('Unexpected calf delete'));
    vi.spyOn(calfApi, 'promoteCalf').mockRejectedValue(new Error('Unexpected promotion'));
    vi.spyOn(calvingsApi, 'registerCalvingToCalfLedger').mockRejectedValue(new Error('Unexpected recovery'));
    vi.spyOn(calvingsApi, 'dismissCalfRecoveryCandidate').mockRejectedValue(new Error('Unexpected dismissal'));
    vi.spyOn(repository, 'saveRecord').mockRejectedValue(new Error('Unexpected storage write'));
    vi.spyOn(repository, 'saveRecordPreservingTimestamps').mockRejectedValue(new Error('Unexpected storage write'));
    vi.spyOn(repository, 'saveManyRecords').mockRejectedValue(new Error('Unexpected storage write'));
    vi.spyOn(repository, 'deleteRecord').mockRejectedValue(new Error('Unexpected storage delete'));
  });

  afterEach(() => {
    cleanup();
    expect(JSON.stringify({ calves, cattle, sales })).toBe(beforeRender);
    expect(salesApi.getSalesList).not.toHaveBeenCalled();
    for (const write of [calfApi.createCalf, calfApi.updateCalf, calfApi.deleteCalf, calfApi.promoteCalf,
      calvingsApi.registerCalvingToCalfLedger, calvingsApi.dismissCalfRecoveryCandidate,
      repository.saveRecord, repository.saveRecordPreservingTimestamps, repository.saveManyRecords,
      repository.deleteRecord]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  async function showList() {
    beforeRender = JSON.stringify({ calves, cattle, sales });
    const view = render(<MemoryRouter><CalfList /></MemoryRouter>);
    expect(await screen.findByText(`表示：${calves.length}件 / 全${calves.length}件`)).toBeInTheDocument();
    expect(repository.getAllRecords).toHaveBeenCalledWith('sales');
    return view;
  }

  function expectParentLinks(container: HTMLElement, id: number, name: string, earTag: string, relation = '母牛') {
    const labels = Array.from(container.querySelectorAll(`a[href="/cattle/${id}"]`)).map(link => link.textContent);
    expect(labels).toEqual(expect.arrayContaining([`${name}（耳標 ${earTag}）`, `${relation}：${name}（耳標 ${earTag}）`]));
    expect(labels).toHaveLength(2);
  }

  function expectNameWithoutEarTag(container: HTMLElement, name: string, relation = '母牛') {
    expect(screen.getByText(`${relation}：${name}`)).toBeInTheDocument();
    const table = container.querySelector('table')!;
    expect(Array.from(table.querySelectorAll('td')).some(cell => cell.textContent === name)).toBe(true);
  }

  it('通常母牛とETの遺伝的母牛・代理母を区別し、PCとスマホに台帳の耳標と個体リンクを表示する', async () => {
    cattle = [cow(1, '0123', '通常母'), cow(2, '0045', '遺伝的母'), cow(3, '0678', '代理母')];
    calves = [
      calf(101, { motherCowId: '1', motherName: '通常母' }),
      calf(102, { breedingMethod: '受精卵移植', geneticMotherCowId: '0045', geneticMotherCowName: '遺伝的母',
        motherCowId: '0045', motherName: '遺伝的母', recipientCowId: '3', recipientCowName: '代理母' }),
    ];

    const { container } = await showList();

    expectParentLinks(container, 1, '通常母', '0123');
    expectParentLinks(container, 2, '遺伝的母', '0045');
    expectParentLinks(container, 3, '代理母', '0678', '代理母');
    expect(container.textContent).not.toContain('通常母（耳標 1）');
    expect(container.textContent).not.toContain('代理母（耳標 3）');
  });

  it('同名複数・ID複数候補・耳標未登録・台帳外の母牛に番号を推定表示しない', async () => {
    cattle = [
      cow(10, '1010', '同名母'), cow(11, '1111', '同名母'),
      cow(12, '9912', '内部ID候補母'), cow(13, '12', '耳標一致の別母'),
      cow(14, '', '耳標未登録母', { identificationNumber: '1234567890' }),
    ];
    calves = [
      calf(201, { motherName: '同名母' }),
      calf(202, { motherCowId: '12', motherName: '内部ID候補母' }),
      calf(203, { motherCowId: '14', motherName: '耳標未登録母' }),
      calf(204, { motherCowId: '7654', motherName: '台帳外母' }),
    ];

    const { container } = await showList();

    for (const name of ['同名母', '内部ID候補母', '耳標未登録母', '台帳外母']) {
      expectNameWithoutEarTag(container, name);
    }
    for (const tag of ['1010', '1111', '9912', '12', '14', '1234567890', '7654']) {
      expect(container.textContent).not.toContain(`（耳標 ${tag}）`);
    }
  });

  it('販売済みと育成牛は名前を保ち、取消・削除済み販売の在籍繁殖牛には耳標を表示する', async () => {
    cattle = [
      cow(21, '2101', '販売済み母'), cow(22, '2201', '育成母', { stage: '育成牛' }),
      cow(23, '2301', '販売取消母'), cow(24, '2401', '販売削除母'),
      cow(25, '2501', '在籍もいる同名母'), cow(26, '2601', '在籍もいる同名母'),
    ];
    sales = [
      { id: 'sold', targetType: '成牛', targetNumber: '2101', status: '販売済み' },
      { id: 'cancelled', targetType: '成牛', targetNumber: '2301', status: '取消' },
      { id: 'deleted', targetType: '成牛', targetNumber: '2401', status: '販売済み', deletedAt: '2026-11-01T00:00:00Z' },
      { id: 'same-name-sold', targetType: '成牛', targetNumber: '2501', status: '販売済み' },
    ];
    calves = [
      calf(301, { motherCowId: '21', motherName: '販売済み母' }),
      calf(302, { motherCowId: '22', motherName: '育成母' }),
      calf(303, { motherCowId: '23', motherName: '販売取消母' }),
      calf(304, { motherCowId: '24', motherName: '販売削除母' }),
      calf(305, { motherName: '在籍もいる同名母' }),
    ];

    const { container } = await showList();

    for (const name of ['販売済み母', '育成母', '在籍もいる同名母']) expectNameWithoutEarTag(container, name);
    for (const tag of ['2101', '2201', '2501', '2601']) expect(container.textContent).not.toContain(`（耳標 ${tag}）`);
    expectParentLinks(container, 23, '販売取消母', '2301');
    expectParentLinks(container, 24, '販売削除母', '2401');
  });

  it('販売記録の読取に失敗しても子牛一覧と母牛・代理母の名前を保持する', async () => {
    cattle = [cow(31, '3101', '確認できる母'), cow(32, '3201', '確認できる代理母')];
    calves = [calf(401, { breedingMethod: '受精卵移植', geneticMotherCowId: '31',
      geneticMotherCowName: '確認できる母', motherName: '確認できる母',
      recipientCowId: '32', recipientCowName: '確認できる代理母' })];
    vi.mocked(repository.getAllRecords).mockRejectedValue(new Error('Fixture sales read failure'));

    const { container } = await showList();

    expectNameWithoutEarTag(container, '確認できる母');
    expectNameWithoutEarTag(container, '確認できる代理母', '代理母');
    expect(screen.getAllByText('子牛401')).toHaveLength(2);
    expect(container.textContent).not.toContain('（耳標 3101）');
    expect(container.textContent).not.toContain('（耳標 3201）');
    expect(screen.queryByText('子牛台帳を読み込めませんでした。')).not.toBeInTheDocument();
  });
});
