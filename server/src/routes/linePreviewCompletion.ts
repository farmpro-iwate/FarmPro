import { Router } from 'express';

/** Isolated preview only. The response never embeds an account token. */
export const linePreviewCompletionRouter = Router();
linePreviewCompletionRouter.get('/login/email', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.type('html').send(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FarmPro LINE認証 検証</title><style>body{font-family:system-ui,sans-serif;max-width:440px;margin:12vh auto;padding:20px;color:#183331}main{padding:24px;border:1px solid #dbe5e2;border-radius:16px}h1{font-size:22px}p{line-height:1.8}</style></head><body><main><h1>LINEログイン検証</h1><p id="status">LINE認証の結果を確認しています…</p><p>これは独立検証用の画面です。FarmPro本番へのログインやデータ操作は行いません。</p></main><script>if(new URL(location.href).searchParams.get('line')!=='complete'){document.getElementById('status').textContent='LINE認証を開始してください。'}else{fetch('/api/auth/line/finish',{method:'POST',credentials:'same-origin'}).then(r=>{document.getElementById('status').textContent=r.ok?'LINE認証と利用者照合が完了しました（検証のみ）。':'LINE認証を完了できませんでした。';}).catch(()=>{document.getElementById('status').textContent='通信に失敗しました。';});}</script></body></html>`);
});
