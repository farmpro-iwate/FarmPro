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

async function sendVerificationEmail(email: string, subject: string, heading: string, description: string, code: string) {
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
      text: `${description}\n\n確認コード: ${code}\n\nこのコードは10分間有効です。心当たりがない場合は、このメールを破棄してください。`,
      html: `<div style="font-family: sans-serif; line-height: 1.7"><h2>${heading}</h2><p>${description}</p><p style="font-size: 32px; font-weight: 700; letter-spacing: 8px">${code}</p><p>このコードは10分間有効です。</p><p>心当たりがない場合は、このメールを破棄してください。</p></div>`,
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
  await sendVerificationEmail(
    email,
    'FarmPro メールアドレス確認コード',
    'FarmPro メールアドレス確認',
    '次の6桁コードをFarmProの登録画面に入力してください。',
    code,
  );
}

export async function sendEmailChangeVerificationEmail(email: string, code: string) {
  await sendVerificationEmail(
    email,
    'FarmPro メールアドレス変更確認コード',
    'FarmPro メールアドレス変更',
    '次の6桁コードをFarmProの設定画面に入力してください。',
    code,
  );
}

export async function sendPasswordResetVerificationEmail(email: string, code: string) {
  await sendVerificationEmail(
    email,
    'FarmPro パスワード再設定確認コード',
    'FarmPro パスワード再設定',
    '次の6桁コードをFarmProのパスワード再設定画面に入力してください。',
    code,
  );
}
