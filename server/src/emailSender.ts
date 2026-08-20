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

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email],
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
