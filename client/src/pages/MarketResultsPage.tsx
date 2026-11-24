import { useState } from 'react';
import { verifiedMarketCatalog } from '../services/marketCatalog';
import { getSelectedMarketResult, formatPublishedPrice } from '../services/marketResultsView';
import type { MarketResultPeriod } from '../services/marketCatalog';

// No unverified external data is loaded. An approved source adapter will replace this empty feed.
const officialResults: readonly MarketResultPeriod[] = [];
import { Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';

type Market = { prefecture: string; name: string; notify: boolean };
const KEY = 'farmpro-market-watchlist-v1';
const PREFECTURES = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
function readMarkets(): Market[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter((v): v is Market =>
      v && PREFECTURES.includes(v.prefecture) && typeof v.name === 'string' && typeof v.notify === 'boolean') : [];
  } catch { return []; }
}
export function MarketResultsPage() {
  const [markets, setMarkets] = useState<Market[]>(readMarkets);
  const [prefecture, setPrefecture] = useState('岩手県');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  function save(next: Market[]) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); setMarkets(next); setMessage(''); }
    catch { setMessage('選択情報を保存できませんでした。ブラウザの設定をご確認ください。'); }
  }
  function add() {
    const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!normalized) { setMessage('市場名を入力してください。'); return; }
    if (markets.some(m => m.prefecture === prefecture && m.name === normalized)) { setMessage('選択済みの市場です。'); return; }
    save([...markets, { prefecture, name: normalized, notify: true }]);
    setName('');
  }
  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={900}>子牛市場情報</Typography>
    <Alert severity="info">市場選択の準備画面です。市場結果の自動取得と通知配信はまだ開始していません。</Alert>
    <Card variant="outlined"><CardContent><Stack spacing={2}>
      <Typography variant="h6">通知を希望する市場</Typography>
      <Typography variant="body2" color="text.secondary">全国から都道府県を選択し、市場名を登録できます。正式な市場一覧はデータ提供元の確認後に追加します。</Typography>
      <TextField select fullWidth label="都道府県" value={prefecture} onChange={e => setPrefecture(e.target.value)}>
        {PREFECTURES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
      </TextField>
      <TextField fullWidth label="子牛市場名" value={name} onChange={e => setName(e.target.value)} inputProps={{ maxLength: 80 }} />
      <Button variant="contained" onClick={add}>市場を追加</Button>
      {message && <Alert severity="warning">{message}</Alert>}
    </Stack></CardContent></Card>
    <Card variant="outlined"><CardContent><Stack spacing={1.5}>
      <Typography variant="h6">公表された市場情報を確認</Typography>
      <Typography variant="body2" color="text.secondary">公的・業界団体の公開情報へ移動します。掲載対象や更新頻度は提供元ごとに異なります。</Typography>
      <Button component="a" href="https://nbafa.or.jp/mkt/" target="_blank" rel="noopener noreferrer" variant="outlined">全国の家畜市場データベースを見る</Button>
      <Button component="a" href="https://www.alic.go.jp/operation/livestock/calf-report.html" target="_blank" rel="noopener noreferrer" variant="outlined">肉用子牛取引情報を見る</Button>
      <Typography variant="caption" color="text.secondary">現在は公式サイトへのリンクです。市場別の自動取得や更新通知は未実装です。</Typography>
    </Stack></CardContent></Card>
    <Card variant="outlined"><CardContent><Stack spacing={1}>
      <Typography variant="h6">選択した市場（{markets.length}件）</Typography>
      {markets.length === 0 && <Typography color="text.secondary">市場はまだ選択されていません。</Typography>}
      {markets.map(m => <Box key={m.prefecture + m.name} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', borderBottom: 1, borderColor: 'divider', py: 1 }}>
        <Box sx={{ flex: 1, minWidth: 135 }}><Typography fontWeight={700}>{m.name}</Typography><Typography variant="body2" color="text.secondary">{m.prefecture}</Typography></Box>
        {(() => {
          const view = getSelectedMarketResult(m, verifiedMarketCatalog, officialResults);
          if (view.status === 'market-unverified') return <Typography variant="body2" color="text.secondary">市場情報：正式名称の確認待ち・価格は未公表</Typography>;
          if (!view.latest) return <Typography variant="body2" color="text.secondary">市場結果：未公表</Typography>;
          const result = view.latest;
          return <Box sx={{ width: '100%' }}>
            <Typography variant="body2">開催期間：{result.periodStart} ～ {result.periodEnd}（{result.status === 'final' ? '確定' : '速報'}）</Typography>
            <Typography variant="body2">品種：{result.breed}／性別：{result.sex === 'castrated' ? '去勢' : result.sex === 'female' ? '雌' : result.sex === 'male' ? '雄' : '不明'}</Typography>
            <Typography variant="body2">平均価格：{formatPublishedPrice(result.averagePriceYen, result.priceIncludesTax)}　取引頭数：{result.headCount === null ? '未公表' : result.headCount + '頭'}</Typography>
            <Typography variant="caption">公表日：{result.publishedAt.slice(0, 10)}　<a href={result.sourceUrl} target="_blank" rel="noopener noreferrer">出典を見る</a></Typography>
          </Box>;
        })()}
        <FormControlLabel label="通知を希望" control={<Checkbox checked={m.notify} onChange={e => save(markets.map(item => item === m ? { ...item, notify: e.target.checked } : item))} />} />
        <Button size="small" color="error" onClick={() => save(markets.filter(item => item !== m))}>削除</Button>
      </Box>)}
      <Typography variant="caption" color="text.secondary">選択内容のみ専用の端末内保存領域に保存します。牛・販売・経費データや同期処理は変更しません。「通知を希望」は配信開始を意味しません。</Typography>
    </Stack></CardContent></Card>
  </Stack>;
}
