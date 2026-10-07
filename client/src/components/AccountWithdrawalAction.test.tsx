// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountWithdrawalAction } from './AccountWithdrawalAction';
import { clearAuthSession, getAuthToken, getStoredAuthUser } from '../services/authClient';
import { deleteWithdrawnFarmDatabase } from '../storage/db';
vi.mock('../services/authClient',()=>({clearAuthSession:vi.fn(),getAuthToken:vi.fn(),getStoredAuthUser:vi.fn()}));
vi.mock('../storage/db',()=>({deleteWithdrawnFarmDatabase:vi.fn()}));
const user={id:'user-owner',farmId:'farm-owner',farmName:'Fixture Farm',name:'Fixture Owner',email:'owner@example.invalid',active:true,role:'owner' as const,plan:'free' as const};
const operator={...user,id:'user-operator',farmId:'farm-operator',email:'operator@example.invalid'};
const result={operationId:'operation-fixture',userId:user.id,farmId:user.farmId,status:'completed',accountClosed:true,serverDataDeleted:true,billingChanged:false};
const response=(value:unknown,ok=true)=>({ok,json:async()=>value});
const fetchMock=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();
  vi.mocked(getStoredAuthUser).mockReturnValue(user);vi.mocked(getAuthToken).mockReturnValue('fixture-token');
  vi.mocked(clearAuthSession).mockImplementation(()=>{vi.mocked(getStoredAuthUser).mockReturnValue(null);vi.mocked(getAuthToken).mockReturnValue(null);});
  vi.mocked(deleteWithdrawnFarmDatabase).mockResolvedValue(undefined);
  vi.spyOn(window,'confirm').mockReturnValue(true);
  fetchMock.mockReset().mockImplementation(async(url:string)=>{
    if(url.endsWith('/preview'))return response({user,eligible:true,reason:'',token:'fixture-signed-confirmation'});
    if(url.endsWith('/execute')||url.endsWith('/result'))return response(result);
    throw new Error('Unexpected network request');
  });vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function open(){const clicker=userEvent.setup();await clicker.click(screen.getByRole('button',{name:'実際の退会手続きへ'}));await screen.findByText(/対象：Fixture Farm/);return clicker;}
async function confirmFields(clicker:ReturnType<typeof userEvent.setup>){
  await clicker.click(screen.getByRole('checkbox',{name:/必要な記録をバックアップ済み/}));
  await clicker.type(screen.getByLabelText('対象の登録メールアドレスを入力'),user.email);
  await clicker.type(screen.getByLabelText('現在のパスワード'),'fixture-password');
  await clicker.click(screen.getByRole('checkbox',{name:/ログイン停止と対象データ削除を理解/}));
}
it('opening and closing only previews and never deletes any account or database',async()=>{
  render(<AccountWithdrawalAction/>);expect(fetchMock).not.toHaveBeenCalled();const clicker=await open();
  await clicker.click(screen.getByRole('button',{name:'実行せず閉じる'}));expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].method).toBe('GET');expect(deleteWithdrawnFarmDatabase).not.toHaveBeenCalled();expect(clearAuthSession).not.toHaveBeenCalled();
});
it('requires backup, exact target email, password and final confirmation; only successful server result deletes the own device',async()=>{
  render(<AccountWithdrawalAction/>);const clicker=await open();const button=screen.getByRole('button',{name:'退会を確定して対象データを削除'});expect(button).toBeDisabled();
  await confirmFields(clicker);expect(button).toBeEnabled();await clicker.click(button);
  await screen.findByText('この端末の対象農場データも削除しました。');
  expect(deleteWithdrawnFarmDatabase).toHaveBeenCalledWith(user.id,user.farmId);expect(clearAuthSession).toHaveBeenCalledTimes(1);
  const call=fetchMock.mock.calls.find(([url])=>url.endsWith('/execute'));expect(JSON.parse(call![1].body)).toEqual({token:'fixture-signed-confirmation',email:user.email,password:'fixture-password',confirmed:true,backupConfirmed:true,consentConfirmed:false});
});
it('cancelled final confirmation does not submit or delete',async()=>{
  render(<AccountWithdrawalAction/>);const clicker=await open();await confirmFields(clicker);vi.mocked(window.confirm).mockReturnValue(false);
  await clicker.click(screen.getByRole('button',{name:'退会を確定して対象データを削除'}));expect(fetchMock).toHaveBeenCalledTimes(1);expect(deleteWithdrawnFarmDatabase).not.toHaveBeenCalled();
});
it('blocked paid/shared state explains the reason and has no execute action',async()=>{
  fetchMock.mockResolvedValueOnce(response({user,eligible:false,reason:'契約中です。',token:null}));render(<AccountWithdrawalAction/>);await open();
  expect(screen.getByText('契約中です。')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'退会を確定して対象データを削除'})).not.toBeInTheDocument();
});
it('unknown response does not clear data or claim completion; signed status refresh resolves actual completion',async()=>{
  render(<AccountWithdrawalAction/>);const clicker=await open();await confirmFields(clicker);fetchMock.mockRejectedValueOnce(new Error('Fixture response lost'));
  await clicker.click(screen.getByRole('button',{name:'退会を確定して対象データを削除'}));await screen.findByText(/Fixture response lost/);expect(deleteWithdrawnFarmDatabase).not.toHaveBeenCalled();
  await clicker.click(screen.getByRole('button',{name:'処理結果を再確認'}));await screen.findByText('この端末の対象農場データも削除しました。');
  expect(fetchMock.mock.calls.filter(([url])=>url.endsWith('/execute'))).toHaveLength(1);
});
it('database deletion failure is shown separately from server completion and still logs out the retired user',async()=>{
  vi.mocked(deleteWithdrawnFarmDatabase).mockRejectedValueOnce(new Error('Fixture database blocked'));
  render(<AccountWithdrawalAction/>);const clicker=await open();await confirmFields(clicker);await clicker.click(screen.getByRole('button',{name:'退会を確定して対象データを削除'}));
  await screen.findByText('Fixture database blocked');expect(screen.getByText(/この端末の対象農場データ削除は未確認/)).toBeInTheDocument();
  expect(clearAuthSession).toHaveBeenCalledTimes(1);expect(screen.queryByText('この端末の対象農場データも削除しました。')).not.toBeInTheDocument();
});
it('operator confirmation never deletes the operator device or logs out the operator',async()=>{
  vi.mocked(getStoredAuthUser).mockReturnValue(operator);const onCompleted=vi.fn();render(<AccountWithdrawalAction target={user} onCompleted={onCompleted}/>);
  const clicker=userEvent.setup();await clicker.click(screen.getByRole('button',{name:'退会手続きへ'}));await screen.findByText(/対象：Fixture Farm/);
  await clicker.click(screen.getByRole('checkbox',{name:/必要な記録をバックアップ済み/}));
  await clicker.type(screen.getByLabelText('対象の登録メールアドレスを入力'),user.email);
  await clicker.type(screen.getByLabelText('運営者の現在のパスワード'),'fixture-password');
  await clicker.click(screen.getByRole('checkbox',{name:/ログイン停止と対象データ削除を理解/}));
  expect(screen.getByRole('button',{name:'退会を確定して対象データを削除'})).toBeDisabled();
  await clicker.click(screen.getByRole('checkbox',{name:/本人の退会意思と削除範囲を確認済み/}));
  await clicker.click(screen.getByRole('button',{name:'退会を確定して対象データを削除'}));await screen.findByText(/退会と対象農場のサーバーデータ削除が完了/);
  expect(onCompleted).toHaveBeenCalled();expect(deleteWithdrawnFarmDatabase).not.toHaveBeenCalled();expect(clearAuthSession).not.toHaveBeenCalled();
});
it('a switched login cannot submit the prior confirmation',async()=>{
  render(<AccountWithdrawalAction/>);const clicker=await open();await confirmFields(clicker);vi.mocked(getStoredAuthUser).mockReturnValue(operator);
  await clicker.click(screen.getByRole('button',{name:'退会を確定して対象データを削除'}));await screen.findByText(/ログイン情報が変わりました/);expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('a receipt claiming another farm is not accepted as success and never deletes device data',async()=>{
  render(<AccountWithdrawalAction/>);const clicker=await open();await confirmFields(clicker);fetchMock.mockResolvedValueOnce(response({...result,farmId:'other-farm'}));
  await clicker.click(screen.getByRole('button',{name:'退会を確定して対象データを削除'}));await screen.findByText(/退会結果を確認できません/);expect(deleteWithdrawnFarmDatabase).not.toHaveBeenCalled();expect(clearAuthSession).not.toHaveBeenCalled();
});
it('two immediate clicks send only one final request',async()=>{
  render(<AccountWithdrawalAction/>);const clicker=await open();await confirmFields(clicker);
  let resolve!:(value:ReturnType<typeof response>)=>void;fetchMock.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
  const button=screen.getByRole('button',{name:'退会を確定して対象データを削除'});fireEvent.click(button);fireEvent.click(button);
  expect(fetchMock.mock.calls.filter(([url])=>url.endsWith('/execute'))).toHaveLength(1);resolve(response(result));await waitFor(()=>expect(clearAuthSession).toHaveBeenCalledTimes(1));
});
