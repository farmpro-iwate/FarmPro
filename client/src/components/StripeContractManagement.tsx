import { useRef, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
export function isStripePortalUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url=new URL(value);return url.protocol==='https:' && url.hostname==='billing.stripe.com' && !url.username && !url.password && !url.port && /^\/p\/session(?:\/|$)/.test(url.pathname); } catch {return false;}
}
export function StripeContractManagement() {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [url,setUrl]=useState('');
  const running=useRef(false);
  const session=useRef<{id:string;farmId:string;token:string}|null>(null);
  const sameSession=()=>{const user=getStoredAuthUser();return user?.id===session.current?.id && user?.farmId===session.current?.farmId && getAuthToken()===session.current?.token;};
  const prepare=async()=>{
    if(running.current)return;
    setError('');setUrl('');
    const user=getStoredAuthUser();const token=getAuthToken();
    if(!user || !token){setError('ログインを確認してください。');return;}
    if(user.role!=='owner'){setError('カード契約の管理は農場の代表アカウントで行ってください。');return;}
    session.current={id:user.id,farmId:user.farmId,token};running.current=true;setBusy(true);
    try{
      const response=await fetch('/api/billing/portal',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
      const value=await response.json();
      if(!response.ok)throw new Error(typeof value?.message==='string'?value.message:'カード契約管理を開けません。');
      if(!sameSession() || !isStripePortalUrl(value.url) || value.cancellationMode!=='at_period_end' || value.accountChanged!==false || value.subscriptionChanged!==false)throw new Error('契約管理の確認結果が一致しません。画面を開き直してください。');
      setUrl(value.url);
    }catch(err){setError(err instanceof Error?err.message:'カード契約管理を開けません。時間をおいて再確認してください。');}
    finally{running.current=false;setBusy(false);}
  };
  return <Stack spacing={1}>
    <Typography variant="body2">カード払いはStripeで次回の更新を停止できます。解約を確定する前に、Stripe画面に表示される契約終了日を確認してください。支払済みの期間中は利用でき、契約終了と未処理の請求の確認後にFarmProの退会へ進めます。</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Button type="button" variant="outlined" disabled={busy} onClick={()=>void prepare()}>{busy?'Stripeの契約管理を準備中…':'カード契約の管理・解約'}</Button>
    {url && <>
      <Button component="a" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" variant="contained" onClick={event=>{if(!sameSession()){event.preventDefault();setUrl('');setError('ログイン情報が変わりました。契約管理を開き直してください。');}}}>Stripeの契約管理を開く（別タブ）</Button>
      <Typography variant="body2">開くだけでは解約されません。Stripeでの確定後も、この画面では解約の完了を判定しません。リンクが期限切れの場合は「カード契約の管理・解約」から準備し直してください。</Typography>
    </>}
  </Stack>;
}
