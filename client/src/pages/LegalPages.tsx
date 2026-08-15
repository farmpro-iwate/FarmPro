import { Alert, Card, CardContent, Link, Stack, Typography } from '@mui/material';

const effectiveDate = '2026年8月15日';
const operatorName = '関口農場　関口 敦';
const operatorAddress = '岩手県下閉伊郡田野畑村和野12';
const operatorPhone = '09075631775';
const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfnVbG6EPMSQDvdKe7K1wac4K_58nOxm9KlvoAIsaj_jm-HEA/viewform?usp=header';

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6" fontWeight={800}>{title}</Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ lineHeight: 1.9 }}>{children}</Typography>;
}

function PageHeader({ title }: { title: string }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="h4" fontWeight={900}>{title}</Typography>
      <Typography color="text.secondary">制定日・最終更新日：{effectiveDate}</Typography>
    </Stack>
  );
}

export function TermsPage() {
  return (
    <Stack spacing={2}>
      <PageHeader title="FarmPro 利用規約" />
      <Alert severity="info">本規約は、関口農場が提供する農場管理サービス「FarmPro」の利用条件を定めるものです。</Alert>

      <LegalSection title="第1条（適用）"><P>本規約は、FarmPro（以下「本サービス」）を利用するすべての利用者に適用されます。利用者は、本サービスを利用することにより、本規約に同意したものとみなされます。</P></LegalSection>
      <LegalSection title="第2条（サービス内容）"><P>本サービスは、繁殖牛・子牛・繁殖・分娩・治療・投薬・飼養・販売・経費・予定その他の農場情報を記録、確認、管理するための機能を提供します。</P><P>本サービスは、獣医療、診断、治療、飼料設計、税務、会計その他の専門的判断を代替するものではありません。必要に応じて獣医師、税理士その他の専門家に確認してください。</P></LegalSection>
      <LegalSection title="第3条（アカウントと管理責任）"><P>Standard / Pro等、ログインを必要とする機能を利用する場合、利用者は正確な情報を登録し、認証情報を自己の責任で管理するものとします。</P><P>第三者による不正利用が疑われる場合、利用者は速やかに運営者へ連絡してください。</P></LegalSection>
      <LegalSection title="第4条（プランと料金）"><P>Freeは繁殖雌牛10頭まで無料で利用できます。</P><P>Standardは繁殖雌牛99頭まで、月額1,650円（税込・税抜1,500円）または年額18,150円（税込・税抜16,500円）です。</P><P>Proは繁殖雌牛100頭以上・頭数無制限で、月額3,300円（税込・税抜3,000円）または年額36,300円（税込・税抜33,000円）です。</P><P>各プランの機能、料金その他の条件は、申込時に表示される内容が優先します。</P></LegalSection>
      <LegalSection title="第5条（支払い）"><P>有料プランの支払方法は、クレジットカードまたは銀行振込です。</P><P>クレジットカード決済はStripeを利用して処理します。カード番号等の決済情報はStripeの決済画面で入力され、FarmProではカード番号を保存しません。</P><P>銀行振込を選択した場合は、申込受付後、運営者から振込先と支払期限をご案内します。振込手数料その他利用者側で発生する費用は利用者の負担とします。</P></LegalSection>
      <LegalSection title="第6条（契約期間・更新・解約）"><P>月額プランの契約期間は1か月、年額プランの契約期間は1年です。</P><P>クレジットカード払いでは、月額プランは毎月、年額プランは毎年、同じ契約期間で自動更新され、解約されるまで継続します。各更新時に選択中のプラン料金が自動的に請求されます。</P><P>銀行振込では自動決済による更新は行いません。継続利用する場合は、運営者から次回分の支払いについて案内します。</P><P>利用者は、次回更新日前までに運営者へ解約を申し出ることができます。解約後も、支払済みの利用期間の末日までは利用できます。</P><P>法令上返金が必要な場合を除き、利用期間途中の解約による日割り返金は行いません。</P></LegalSection>
      <LegalSection title="第7条（データ保存とバックアップ）"><P>Freeではデータを主として利用端末内に保存します。利用者は必要に応じて手動バックアップを作成し、安全な場所に保管してください。</P><P>Standard / Proではクラウド保存、自動バックアップ、複数端末同期を利用できます。ただし、通信障害、端末障害、サービス障害等により保存や同期が一時的に行えない場合があります。</P><P>複数端末で同時に異なる変更が行われた場合、本サービスは安全のため自動上書きを停止し、利用者に残すデータの確認を求める場合があります。</P></LegalSection>
      <LegalSection title="第8条（禁止事項）"><P>利用者は、不正アクセス、他者の認証情報の利用、本サービスの妨害、法令違反、公序良俗に反する行為、第三者の権利を侵害する行為、その他運営者が不適切と判断する行為を行ってはなりません。</P></LegalSection>
      <LegalSection title="第9条（サービスの変更・停止）"><P>運営者は、保守、障害対応、法令対応、セキュリティ対応その他必要な場合、本サービスの全部または一部を変更、停止または終了することがあります。重要な変更については、可能な範囲で事前に案内します。</P></LegalSection>
      <LegalSection title="第10条（免責・責任範囲）"><P>運営者は、本サービスの正確性、完全性、特定目的への適合性、常時利用可能であることを保証するものではありません。</P><P>運営者の故意または重過失による場合、その他法令上責任を制限できない場合を除き、本サービスの利用に関連して生じた損害について、運営者は法令の範囲内で責任を負います。</P></LegalSection>
      <LegalSection title="第11条（知的財産権）"><P>本サービスに関するプログラム、画面、文章、ロゴその他の知的財産権は、運営者または正当な権利者に帰属します。利用者が入力した農場データの権利は利用者に帰属します。</P></LegalSection>
      <LegalSection title="第12条（規約の変更）"><P>運営者は、法令に従い本規約を変更することがあります。重要な変更を行う場合は、本サービス上その他適切な方法で周知します。</P></LegalSection>
      <LegalSection title="第13条（準拠法・管轄）"><P>本規約は日本法に準拠します。本サービスに関する紛争については、法令で別途定める場合を除き、運営者の所在地を管轄する裁判所を第一審の合意管轄裁判所とします。</P></LegalSection>
      <LegalSection title="お問い合わせ"><P>運営者：{operatorName}</P><P>所在地：{operatorAddress}</P><P>電話：{operatorPhone}</P><P><Link href={feedbackFormUrl} target="_blank" rel="noopener noreferrer">お問い合わせフォーム</Link></P></LegalSection>
    </Stack>
  );
}

export function PrivacyPage() {
  return (
    <Stack spacing={2}>
      <PageHeader title="FarmPro プライバシーポリシー" />
      <Alert severity="info">関口農場は、FarmProで取り扱う個人情報を適切に管理します。</Alert>
      <LegalSection title="1. 取得する情報"><P>FarmProでは、氏名、メールアドレス、電話番号、農場名、所在地、契約プラン、認証情報、問い合わせ内容その他利用者が入力する情報を取得する場合があります。</P><P>Standard / Proでは、利用者がクラウド保存を利用するため、FarmPro内に記録した農場設定、牛・繁殖・治療・販売・経費等のデータをサーバーへ保存します。</P></LegalSection>
      <LegalSection title="2. 利用目的"><P>取得した情報は、本サービスの提供、本人確認、認証、クラウド保存・バックアップ・同期、契約・料金管理、決済確認、問い合わせ対応、障害対応、不正利用防止、セキュリティ確保、重要なお知らせの連絡、サービス改善のために利用します。</P><P>利用目的を変更する場合は、変更前の目的と合理的な関連性が認められる範囲で行い、必要に応じて周知します。</P></LegalSection>
      <LegalSection title="3. 端末内保存とクラウド保存"><P>Freeの農場データは主として利用端末のブラウザ内に保存されます。Standard / Proでは、クラウド保存・自動バックアップ・複数端末同期のためサーバーへデータを送信します。</P><P>クラウド基盤の構成上、データが日本国外のサーバーに保存される場合があります。現在のFarmPro有料版環境では、米国リージョンのクラウド基盤を利用しています。</P></LegalSection>
      <LegalSection title="4. 第三者提供"><P>法令に基づく場合、本人の同意がある場合、その他個人情報保護法上認められる場合を除き、個人データを第三者へ提供しません。</P></LegalSection>
      <LegalSection title="5. 外部サービス・委託先"><P>本サービスの提供に必要な範囲で、クラウドホスティング等の外部サービスを利用します。クレジットカード決済にはStripeを、お問い合わせフォームにはGoogleフォームを利用しています。</P><P>カード番号等の決済情報はStripeの決済画面で処理され、FarmProではカード番号を保存しません。決済の確認や契約管理に必要な範囲で、Stripeが管理する決済関連情報を取り扱う場合があります。</P><P>外部サービスを利用する場合は、必要な範囲で情報を取り扱い、適切な安全管理を行います。</P></LegalSection>
      <LegalSection title="6. 安全管理措置"><P>運営者は、アクセス制御、認証、バックアップ、必要な権限管理その他、個人情報の漏えい、滅失、毀損、不正アクセス等を防止するために必要かつ適切な安全管理措置を講じます。</P></LegalSection>
      <LegalSection title="7. 保存期間"><P>個人情報は、利用目的の達成に必要な期間、契約・法令上必要な期間、または問い合わせ対応等に必要な期間保存し、不要となった情報は適切な方法で削除または匿名化します。</P></LegalSection>
      <LegalSection title="8. 開示・訂正・利用停止等"><P>本人から、保有個人データの開示、訂正、追加、削除、利用停止、消去その他法令上認められた請求があった場合、本人確認のうえ法令に従って対応します。</P></LegalSection>
      <LegalSection title="9. お問い合わせ"><P>個人情報の取扱いに関する問い合わせ・請求は、以下へご連絡ください。</P><P>運営者：{operatorName}</P><P>所在地：{operatorAddress}</P><P>電話：{operatorPhone}</P><P><Link href={feedbackFormUrl} target="_blank" rel="noopener noreferrer">お問い合わせフォーム</Link></P></LegalSection>
      <LegalSection title="10. 改定"><P>本ポリシーは、法令、サービス内容、取扱状況の変更等に応じて改定することがあります。重要な変更は本サービス上その他適切な方法で周知します。</P></LegalSection>
    </Stack>
  );
}

export function CommercePage() {
  return (
    <Stack spacing={2}>
      <PageHeader title="特定商取引法に基づく表記" />
      <Alert severity="info">FarmProの有料プランに関する通信販売の表示です。</Alert>
      <LegalSection title="販売事業者・役務提供事業者"><P>{operatorName}</P></LegalSection>
      <LegalSection title="運営責任者"><P>関口 敦</P></LegalSection>
      <LegalSection title="所在地"><P>{operatorAddress}</P></LegalSection>
      <LegalSection title="電話番号"><P>{operatorPhone}</P></LegalSection>
      <LegalSection title="お問い合わせ"><P><Link href={feedbackFormUrl} target="_blank" rel="noopener noreferrer">お問い合わせフォーム</Link></P></LegalSection>
      <LegalSection title="販売価格・役務の対価"><P>Free：0円</P><P>Standard：月額1,650円（税込・税抜1,500円）または年額18,150円（税込・税抜16,500円）</P><P>Pro：月額3,300円（税込・税抜3,000円）または年額36,300円（税込・税抜33,000円）</P></LegalSection>
      <LegalSection title="商品代金以外の必要料金"><P>インターネット接続に必要な通信料は利用者の負担です。銀行振込を選択した場合の振込手数料は利用者の負担です。</P></LegalSection>
      <LegalSection title="支払方法"><P>クレジットカードまたは銀行振込。</P><P>クレジットカード決済はStripeの決済画面を利用します。銀行振込は申込受付後、運営者から振込先をご案内します。</P></LegalSection>
      <LegalSection title="支払時期"><P>クレジットカード：申込時に初回料金を決済し、その後は月額プランは毎月、年額プランは毎年、自動更新時に決済します。</P><P>銀行振込：運営者が申込受付後に案内する支払期限までにお振り込みください。</P></LegalSection>
      <LegalSection title="役務の提供時期"><P>Freeは利用開始手続き後、直ちに利用できます。有料プランは、カード決済または銀行振込の入金確認後、運営者がプランを有効化し、原則として直ちに利用できます。</P></LegalSection>
      <LegalSection title="契約期間・自動更新"><P>月額プラン：1か月。年額プラン：1年。</P><P>クレジットカード払いは、月額プランは毎月、年額プランは毎年、自動更新され、解約されるまで継続します。銀行振込は自動決済による更新を行いません。</P></LegalSection>
      <LegalSection title="解約・キャンセル・返金"><P>次回更新日前までに運営者へ解約を申し出ることで、次回更新を停止できます。解約後も支払済みの利用期間の末日までは利用できます。</P><P>デジタルサービスの性質上、サービス提供開始後の利用期間途中のキャンセルおよび日割り返金は原則として行いません。ただし、法令上返金が必要な場合、または運営者の責に帰すべき事情がある場合はこの限りではありません。</P></LegalSection>
      <LegalSection title="動作環境"><P>インターネット接続が可能な、FarmProが対応するスマートフォン・タブレット・パソコンの最新の主要ブラウザを推奨します。端末やブラウザの状態により一部機能を利用できない場合があります。</P></LegalSection>
      <LegalSection title="その他"><P>契約申込画面に個別の条件が表示される場合は、法令に反しない範囲で当該表示が優先されます。</P></LegalSection>
    </Stack>
  );
}
