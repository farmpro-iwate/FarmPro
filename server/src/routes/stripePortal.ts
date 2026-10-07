import { Router } from 'express';
import { createStripePortal } from '../stripePortalStore';
export const stripePortalRouter = Router();
stripePortalRouter.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const attempts = new Map<string,{ count:number; until:number }>();
stripePortalRouter.post('/portal',async(req,res)=>{
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object' || Object.keys(req.body).length) { res.status(400).json({message:'契約管理の対象はログイン中の本人です。画面を開き直してください。'});return; }
  const actor=res.locals.authUser!;
  const previous=attempts.get(actor.id);const current=previous && previous.until>Date.now()?previous:{count:0,until:Date.now()+600000};
  if(current.count>=5){res.status(429).json({message:'契約管理の確認が続いたため、10分後に再確認してください。'});return;}
  current.count++;attempts.set(actor.id,current);
  try {res.json(await createStripePortal(actor));}
  catch(error){
    const code=error instanceof Error?error.message:'';
    const messages:Record<string,string>={
      STRIPE_PORTAL_OWNER_REQUIRED:'カード契約の管理は農場の代表アカウントで行ってください。',
      STRIPE_PORTAL_NO_CONTRACT:'このアカウントに紐づくカード契約がありません。銀行振込や契約の紐づけは運営者へご確認ください。',
      STRIPE_PORTAL_SETUP_REQUIRED:'カード契約管理は運営者のStripe設定が必要です。お問い合わせ窓口で更新停止をお申し出ください。',
      STRIPE_PORTAL_ACCOUNT_REVIEW:'カード契約とアカウントの紐づけを確認できません。運営者へお問い合わせください。',
    };
    res.status(messages[code]?409:503).json({message:messages[code] || 'Stripeの契約管理を開けません。時間をおいて再確認してください。',code:messages[code]?code:'STRIPE_PORTAL_UNAVAILABLE'});
  }
});
