type ResendResponse = {
  id?: string;
  message?: string;
  error?: { message?: string };
};

function resendApiKey() {
  const value = process.env.RESEND_API_KEY?.trim();
  if (!value) throw new Error('RESEND_API_KEY_REQUIRED');
  return value;
}

function fromAddress() {
  const value = process.env.FARMPRO_EMAIL_FROM?.trim();
  if (!value) throw new Error('FARMPRO_EMAIL_FROM_REQUIRED');
  return value;
}

function bankTransferNotificationEmail() {
  const value = process.env.FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL?.trim();
  if (!value) throw new Error('FARMPRO_BANK_TRANSFER_NOTIFICATION_EMAIL_REQUIRED');
  return value;
}

type BankTransferInstructions = {
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
  dueDate: string;
};

function bankTransferInstructions(createdAt: string): BankTransferInstructions | null {
  const bankName = process.env.FARMPRO_BANK_NAME?.trim() || '';
  const branchName = process.env.FARMPRO_BANK_BRANCH?.trim() || '';
  const accountType = process.env.FARMPRO_BANK_ACCOUNT_TYPE?.trim() || '';
  const accountNumber = process.env.FARMPRO_BANK_ACCOUNT_NUMBER?.trim() || '';
  const accountHolder = process.env.FARMPRO_BANK_ACCOUNT_HOLDER?.trim() || '';
  const dueDaysRaw = process.env.FARMPRO_BANK_TRANSFER_DUE_DAYS?.trim() || '';
  const dueDays = Number(dueDaysRaw);

  if (
    !bankName ||
    !branchName ||
    !accountType ||
    !accountNumber ||
    !accountHolder ||
    !Number.isInteger(dueDays) ||
    dueDays < 1 ||
    dueDays > 60
  ) {
    return null;
  }

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const due = new Date(created.getTime() + dueDays * 24 * 60 * 60 * 1000);
  const dueDate = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(due);

  return {
    bankName,
    branchName,
    accountType,
    accountNumber,
    accountHolder,
    dueDate,
  };
}

async function sendEmail(to: string, subject: string, text: string, html: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as ResendResponse;
      detail = body.error?.message || body.message || '';
    } catch {
      detail = '';
    }
    throw new Error(detail ? `EMAIL_SEND_FAILED:${detail}` : `EMAIL_SEND_FAILED:${response.status}`);
  }
}

type VerificationMailInput = {
  email: string;
  subject: string;
  title: string;
  intro: string;
  instruction: string;
  code: string;
  validMinutes?: number;
};

async function sendVerificationEmail(input: VerificationMailInput) {
  const { email, subject, title, intro, instruction, code, validMinutes = 10 } = input;
  const text = [
    title,
    '',
    intro,
    instruction,
    '',
    `確認コード: ${code}`,
    '',
    `このコードは${validMinutes}分間有効です。`,
    'この操作に心当たりがない場合は、このメールを削除してください。',
    '',
    'FarmPro',
  ].join('\n');

  const html = `<!doctype html>
<html lang="ja">
  <body style="margin:0;padding:24px;background:#ffffff;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7">
    <div style="max-width:560px;margin:0 auto">
      <h1 style="font-size:22px;margin:0 0 20px">${title}</h1>
      <p style="margin:0 0 8px">${intro}</p>
      <p style="margin:0 0 24px">${instruction}</p>
      <p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:0 0 24px">${code}</p>
      <p style="margin:0 0 8px">このコードは${validMinutes}分間有効です。</p>
      <p style="margin:0 0 24px">この操作に心当たりがない場合は、このメールを削除してください。</p>
      <p style="margin:0">FarmPro</p>
    </div>
  </body>
</html>`;

  await sendEmail(email, subject, text, html);
}

export async function sendRegistrationVerificationEmail(email: string, code: string) {
  await sendVerificationEmail({
    email,
    subject: 'FarmPro 登録確認コード',
    title: 'FarmPro 利用登録の確認',
    intro: 'FarmProの利用登録を進めるための確認メールです。',
    instruction: '登録画面に、次の6桁コードを入力してください。',
    code,
  });
}

export async function sendEmailChangeVerificationEmail(email: string, code: string) {
  await sendVerificationEmail({
    email,
    subject: 'FarmPro メールアドレス変更コード',
    title: 'FarmPro メールアドレス変更の確認',
    intro: 'FarmProのメールアドレス変更を進めるための確認メールです。',
    instruction: '設定画面に、次の6桁コードを入力してください。',
    code,
  });
}

export async function sendPasswordResetVerificationEmail(email: string, code: string) {
  await sendVerificationEmail({
    email,
    subject: 'FarmPro パスワード再設定コード',
    title: 'FarmPro パスワード再設定の確認',
    intro: 'FarmProのパスワード再設定を進めるための確認メールです。',
    instruction: '再設定画面に、次の6桁コードを入力してください。',
    code,
    validMinutes: 30,
  });
}

export type BankTransferApplicationMailInput = {
  applicationId: string;
  farmName: string;
  name: string;
  email: string;
  planLabel: string;
  amountTaxIncluded: number;
  createdAt: string;
};

export async function sendBankTransferApplicationEmails(input: BankTransferApplicationMailInput) {
  const amount = `${input.amountTaxIncluded.toLocaleString('ja-JP')}円`;
  const instructions = bankTransferInstructions(input.createdAt);

  const applicantPaymentText = instructions
    ? [
        '【お振込先】',
        `銀行名: ${instructions.bankName}`,
        `支店名: ${instructions.branchName}`,
        `口座種別: ${instructions.accountType}`,
        `口座番号: ${instructions.accountNumber}`,
        `口座名義: ${instructions.accountHolder}`,
        `振込金額: ${amount}`,
        `お支払い期限: ${instructions.dueDate}`,
        '',
        '振込手数料はお客様のご負担をお願いいたします。',
      ]
    : [
        '振込先とお支払い期限は、運営者より別途ご案内します。',
      ];

  const applicantPaymentHtml = instructions
    ? `<h2 style="font-size:18px;margin:24px 0 8px">お振込先</h2><p>銀行名: ${instructions.bankName}</p><p>支店名: ${instructions.branchName}</p><p>口座種別: ${instructions.accountType}</p><p>口座番号: ${instructions.accountNumber}</p><p>口座名義: ${instructions.accountHolder}</p><p><strong>振込金額: ${amount}</strong></p><p><strong>お支払い期限: ${instructions.dueDate}</strong></p><p>振込手数料はお客様のご負担をお願いいたします。</p>`
    : '<p>振込先とお支払い期限は、運営者より別途ご案内します。</p>';

  const applicantText = [
    'FarmPro 銀行振込のお申し込みを受け付けました。',
    '',
    `プラン: ${input.planLabel}`,
    `月額料金: ${amount}（税込）`,
    `受付番号: ${input.applicationId}`,
    '',
    ...applicantPaymentText,
    '入金確認後に有料プランが有効になります。',
    '',
    'FarmPro',
  ].join('\n');
  const applicantHtml = `<!doctype html><html lang="ja"><body style="margin:0;padding:24px;background:#fff;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7"><div style="max-width:560px;margin:0 auto"><h1 style="font-size:22px">銀行振込のお申し込みを受け付けました</h1><p>プラン: ${input.planLabel}</p><p>月額料金: ${amount}（税込）</p><p>受付番号: ${input.applicationId}</p>${applicantPaymentHtml}<p>入金確認後に有料プランが有効になります。</p><p>FarmPro</p></div></body></html>`;

  const operatorText = [
    'FarmPro 銀行振込申込通知',
    '',
    `農場名: ${input.farmName}`,
    `代表者名: ${input.name}`,
    `登録メール: ${input.email}`,
    `プラン: ${input.planLabel}`,
    `月額料金: ${amount}（税込）`,
    `受付番号: ${input.applicationId}`,
    `申込日時: ${input.createdAt}`,
    ...(instructions ? [`支払期限: ${instructions.dueDate}`] : []),
    '',
    '入金確認まではプランを有効化しないでください。',
  ].join('\n');
  const operatorHtml = `<!doctype html><html lang="ja"><body style="margin:0;padding:24px;background:#fff;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7"><div style="max-width:560px;margin:0 auto"><h1 style="font-size:22px">銀行振込申込通知</h1><p>農場名: ${input.farmName}</p><p>代表者名: ${input.name}</p><p>登録メール: ${input.email}</p><p>プラン: ${input.planLabel}</p><p>月額料金: ${amount}（税込）</p><p>受付番号: ${input.applicationId}</p><p>申込日時: ${input.createdAt}</p>${instructions ? `<p>支払期限: ${instructions.dueDate}</p>` : ''}<p><strong>入金確認まではプランを有効化しないでください。</strong></p></div></body></html>`;

  await sendEmail(bankTransferNotificationEmail(), 'FarmPro 銀行振込申込通知', operatorText, operatorHtml);
  await sendEmail(input.email, 'FarmPro 銀行振込申込受付', applicantText, applicantHtml);
}
