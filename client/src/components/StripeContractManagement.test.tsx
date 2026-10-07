// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { StripeContractManagement, isStripePortalUrl } from './StripeContractManagement';
const state=vi.hoisted(()=>({user:{id:'owner',farmId:'farm',role:'owner'},token:'fixture'}));
vi.mock('../services/authClient',()=>({getStoredAuthUser:()=>state.user,getAuthToken:()=>state.token}));
const fetchMock=vi.fn();const receipt={url:'https://billing.stripe.com/p/session/fixture',cancellationMode:'at_period_end',accountChanged:false,subscriptionChanged:false};
beforeEach(()=>{state.user={id:'owner',farmId:'farm',role:'owner'};state.token='fixture';fetchMock.mockReset();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('opening guidance is read-only and no portal session is prepared until explicit click',()=>{render(<StripeContractManagement />);expect(fetchMock).not.toHaveBeenCalled();expect(screen.queryByRole('link')).not.toBeInTheDocument();});
it('prepares own portal without customer/user/return URL input and provides only verified Stripe link',async()=>{
  fetchMock.mockResolvedValue({ok:true,json:async()=>receipt});render(<StripeContractManagement />);fireEvent.click(screen.getByRole('button',{name:'カード契約の管理・解約'}));
  const link=await screen.findByRole('link',{name:'Stripeの契約管理を開く（別タブ）'});expect(link).toHaveAttribute('href',receipt.url);expect(link).toHaveAttribute('rel','noopener noreferrer');
  expect(fetchMock).toHaveBeenCalledWith('/api/billing/portal',expect.objectContaining({method:'POST',body:'{}',headers:expect.objectContaining({Authorization:'Bearer fixture'})}));
  expect(screen.getByText(/開くだけでは解約されません/)).toBeInTheDocument();
});
it('setup errors are shown without claiming cancellation or displaying a portal link',async()=>{fetchMock.mockResolvedValue({ok:false,json:async()=>({message:'運営者のStripe設定が必要です。'})});render(<StripeContractManagement />);fireEvent.click(screen.getByRole('button'));expect(await screen.findByRole('alert')).toHaveTextContent('Stripe設定');expect(screen.queryByRole('link')).not.toBeInTheDocument();});
it('changed login while preparing cannot expose the former user portal',async()=>{let resolve!:(x:unknown)=>void;fetchMock.mockReturnValue(new Promise(r=>{resolve=r;}));render(<StripeContractManagement />);fireEvent.click(screen.getByRole('button'));state.user={...state.user,id:'other'};resolve({ok:true,json:async()=>receipt});expect(await screen.findByRole('alert')).toHaveTextContent('一致しません');expect(screen.queryByRole('link')).not.toBeInTheDocument();});
it('foreign URLs, immediate cancellation and malformed results do not create links',async()=>{
  expect(isStripePortalUrl('https://billing.stripe.com.evil.invalid/p/session')).toBe(false);expect(isStripePortalUrl('https://x@billing.stripe.com/p/session')).toBe(false);
  for(const patch of [{url:'https://evil.invalid'},{cancellationMode:'immediately'},{accountChanged:true}]){fetchMock.mockResolvedValue({ok:true,json:async()=>({...receipt,...patch})});const {unmount}=render(<StripeContractManagement />);fireEvent.click(screen.getByRole('button'));expect(await screen.findByRole('alert')).toHaveTextContent('一致しません');expect(screen.queryByRole('link')).not.toBeInTheDocument();unmount();}
});
it('double clicks prepare one session and a changed login cannot follow the prepared link',async()=>{
  let resolve!:(x:unknown)=>void;fetchMock.mockReturnValue(new Promise(r=>{resolve=r;}));render(<StripeContractManagement />);const button=screen.getByRole('button');fireEvent.click(button);fireEvent.click(button);expect(fetchMock).toHaveBeenCalledTimes(1);resolve({ok:true,json:async()=>receipt});const link=await screen.findByRole('link');state.token='changed';fireEvent.click(link);await waitFor(()=>expect(screen.queryByRole('link')).not.toBeInTheDocument());expect(screen.getByRole('alert')).toHaveTextContent('ログイン情報が変わりました');
});
