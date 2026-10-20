import { Router } from 'express';
export const linePreviewSignupPageRouter = Router();
linePreviewSignupPageRouter.get('/line/signup', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const production = process.env.FARMPRO_LINE_SIGNUP_PRODUCTION === 'true';
  const heading = production ? 'LINEで無料登録' : 'LINE検証用 新規登録';
  const explanation = production ? 'FarmProの無料アカウントを作成します。' : '独立検証環境だけに無料アカウントを作ります。本番の登録ではありません。';
  const button = production ? '無料登録する' : '検証用に登録';
  const agreement = production ? '無料アカウントの作成に同意します' : '検証用アカウントの作成に同意します';
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.type('html').send(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title></head><body><main style="max-width:420px;margin:8vh auto;font-family:system-ui;padding:16px"><h1>${heading}</h1><p>${explanation}</p><form id="form"><p><label>農場名 <input name="farmName" required maxlength="100"></label></p><p><label>お名前 <input name="name" required maxlength="100"></label></p><p><label><input type="checkbox" name="confirm" required> ${agreement}</label></p><button type="submit">${button}</button></form><p id="result" role="status"></p><p id="signin" hidden><a href="/api/auth/line/start">LINEでログイン</a></p></main><script>document.getElementById('form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const b=f.querySelector('button');b.disabled=true;try{const r=await fetch('/api/auth/line/signup/complete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({farmName:f.elements.farmName.value,name:f.elements.name.value,confirm:f.elements.confirm.checked})});document.getElementById('result').textContent=r.ok?'無料登録が完了しました。下の「LINEでログイン」から進んでください。':'登録できませんでした。LINE認証をやり直してください。';if(r.ok){document.getElementById('signin').hidden=false;f.querySelectorAll('input').forEach(input=>input.disabled=true);}}catch{document.getElementById('result').textContent='通信に失敗しました。';}finally{b.disabled=false;}});</script></body></html>`);
});
