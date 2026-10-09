// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OperatorWithdrawalHistory } from './OperatorWithdrawalHistory';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
vi.mock('../services/authClient',()=>({getAuthToken:vi.fn(),getStoredAuthUser:vi.fn()}));
const operator={id:'operator',farmId:'farm-operator',farmName:'Operator',name:'Operator',email:'operator@example.invalid',role:'owner' as const,active:true,plan:'free' as const};
const rows=[{id:'receipt-one',farmId:'farm-self',initiatedBy:'self',status:'completed',startedAt:'2026-10-08T01:00:00Z',completedAt:'2026-10-08T01:01:00Z'},
  {id:'receipt-two',farmId:'farm-other',initiatedBy:'operator',status:'processing',startedAt:'2026-10-08T02:00:00Z',completedAt:null}];
const mock=vi.fn();
beforeEach(()=>{vi.mocked(getStoredAuthUser).mockReturnValue(operator);vi.mocked(getAuthToken).mockReturnValue('fixture-token');mock.mockReset();vi.stubGlobal('fetch',mock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
it('shows who initiated, accurate completion state and Japan time using authenticated GET only',async()=>{
  mock.mockResolvedValue({ok:true,json:async()=>({total:2,operations:rows})});render(<OperatorWithdrawalHistory/>);
  await screen.findByText('退会操作：利用者本人');expect(screen.getByText('退会操作：運営者')).toBeInTheDocument();
  expect(screen.getByText('状態：データ削除処理中')).toBeInTheDocument();expect(screen.getByText('完了：未完了')).toBeInTheDocument();
  expect(screen.getByText('開始：2026/10/8 10:00:00')).toBeInTheDocument();
  const clicker=userEvent.setup();await clicker.click(screen.getByRole('button',{name:'退会履歴を更新'}));await screen.findByText('全2件・表示2件');
  expect(mock).toHaveBeenCalledTimes(2);for(const [url,init]of mock.mock.calls){expect(url).toBe('/api/account-withdrawals/operator/history');expect(init.method).toBe('GET');expect(init.cache).toBe('no-store');expect(init.headers.Authorization).toBe('Bearer fixture-token');expect(init.body).toBeUndefined();}
});
it('shows an empty history and rejects malformed results rather than claiming completion',async()=>{
  mock.mockResolvedValueOnce({ok:true,json:async()=>({total:0,operations:[]})});render(<OperatorWithdrawalHistory/>);await screen.findByText('退会履歴はありません。');
  mock.mockResolvedValueOnce({ok:true,json:async()=>({total:1,operations:[{...rows[0],completedAt:null}]})});await userEvent.setup().click(screen.getByRole('button',{name:'退会履歴を更新'}));
  await screen.findByText(/退会履歴の確認結果が不正/);expect(screen.queryByText('状態：退会完了')).not.toBeInTheDocument();
});
it('does not show a late response from a previous login',async()=>{
  let release!:(value:unknown)=>void;mock.mockReturnValue(new Promise(r=>{release=r;}));render(<OperatorWithdrawalHistory/>);
  vi.mocked(getAuthToken).mockReturnValue('new-token');await act(async()=>{release({ok:true,json:async()=>({total:2,operations:rows})});});
  await screen.findByText(/ログイン情報が変わりました/);expect(screen.queryByText('農場ID：farm-self')).not.toBeInTheDocument();
});
it('refreshes on a completed withdrawal revision and clears old records on a failed request',async()=>{
  mock.mockResolvedValueOnce({ok:true,json:async()=>({total:2,operations:rows})});const view=render(<OperatorWithdrawalHistory revision={0}/>);await screen.findByText('農場ID：farm-self');
  mock.mockResolvedValueOnce({ok:false,json:async()=>({message:'履歴を確認できません'})});view.rerender(<OperatorWithdrawalHistory revision={1}/>);
  await screen.findByText('履歴を確認できません');expect(screen.queryByText('農場ID：farm-self')).not.toBeInTheDocument();
});
