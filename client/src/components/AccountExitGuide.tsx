import { useId, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material';
import { WithdrawalRequestForm } from './WithdrawalRequests';

// The existing contact destination published in LegalPages.tsx. No account,
// email, token or farm data is added to this URL or submitted by this component.
const contactFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfnVbG6EPMSQDvdKe7K1wac4K_58nOxm9KlvoAIsaj_jm-HEA/viewform?usp=header';

export function AccountExitGuide() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <Button type="button" variant="text" size="small" onClick={() => setOpen(true)} sx={{ alignSelf: 'flex-start' }}>
        解約・退会について
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" scroll="paper"
        aria-labelledby={titleId} aria-describedby={descriptionId}>
        <DialogTitle id={titleId}>解約・退会のご案内</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ overflowWrap: 'anywhere' }}>
            <Alert severity="info" id={descriptionId}>
              この画面では説明と退会希望の受付状況を確認できます。開くだけでは、申請・解約・退会・データ削除は行いません。
            </Alert>
            <Stack spacing={0.75}>
              <Typography component="h3" fontWeight={800}>解約：有料プランの更新をやめる</Typography>
              <Typography variant="body2">有料プランの解約だけでは、アカウントや農場データは削除しません。</Typography>
              <Typography variant="body2">カード月払いは、次回更新日前に運営者へ解約をお申し出ください。支払済みの利用期間の終了までは利用できます。</Typography>
              <Typography variant="body2">銀行振込の年払いには、自動更新・自動決済はありません。次年度を継続しない場合は運営者へお知らせください。支払済みの契約期間の終了までは利用できます。</Typography>
              <Typography variant="body2">途中解約の日割り返金は原則ありません。法令上必要な場合などは個別に確認します。実際の支払方法・利用期限は、申込時の契約内容を確認してご案内します。</Typography>
            </Stack>
            <Divider />
            <Stack spacing={0.75}>
              <Typography component="h3" fontWeight={800}>退会：アカウントと対象データの削除を希望する</Typography>
              <Typography variant="body2">現在、アプリ内で退会・完全削除を自動実行する機能はありません。下の受付欄またはお問い合わせ窓口から退会希望をご連絡ください。本人確認・契約の有無・削除対象と対応方法を確認します。</Typography>
              <Typography variant="body2">有料契約中の場合は「契約期間の終了後に退会したい」または「今すぐ退会について相談したい」とお知らせください。利用終了日・返金の扱い・削除範囲を確認してから手続きします。</Typography>
              <Typography variant="body2">Freeをご利用の場合も、下の受付欄またはお問い合わせ窓口をご利用ください。</Typography>
              <Typography variant="body2">必要な牛の記録は事前にバックアップしてください。別端末内の記録や、ご自身で保存したバックアップは、この画面からは消去されません。</Typography>
            </Stack>
            <Divider />
            <WithdrawalRequestForm />
            <Divider />
            <Stack spacing={1}>
              <Typography component="h3" fontWeight={800}>運営者への連絡</Typography>
              <Typography variant="body2">お問い合わせフォームから、農場名・登録メールアドレス・希望する手続き（解約／退会）をご連絡ください。パスワード・確認コード・カード番号は記入しないでください。</Typography>
              <Button component="a" href={contactFormUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
                variant="contained" fullWidth>
                お問い合わせフォームを開く（別タブ）
              </Button>
              <Typography variant="body2" color="text.secondary">Googleフォームが別タブで開きます。開くだけでは送信されません。フォームでの送信後も、この画面では受付・更新停止・退会の完了は確認できません。</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button component="a" href="/terms" target="_blank" rel="noopener noreferrer" variant="text">利用規約を確認（別タブ）</Button>
                <Button component="a" href="/commerce" target="_blank" rel="noopener noreferrer" variant="text">特商法表記を確認（別タブ）</Button>
              </Stack>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={() => setOpen(false)}>閉じる</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
