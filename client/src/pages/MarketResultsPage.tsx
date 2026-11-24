import { useEffect, useState } from 'react';
import { synchronizeMarketAnnouncements, markMarketAnnouncementsRead, type MarketAnnouncement } from '../services/marketAnnouncements';
import { verifiedMarketCatalog } from '../services/marketCatalog';
import { getSelectedMarketResult, formatPublishedPrice } from '../services/marketResultsView';
import { publishedMarketResultSnapshot } from '../services/marketResultsPublishedSnapshot';
import { loadPublishedMarketFeed } from '../services/marketResultsFeed';

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
  const [officialResults, setOfficialResults] = useState(publishedMarketResultSnapshot);
  const [feedStatus, setFeedStatus] = useState('配信データの確認前（同梱資料を表示中）');
  const [feedLoading, setFeedLoading] = useState(false);
  async function refreshFeed() {
    setFeedLoading(true);
    try {
      const results = await loadPublishedMarketFeed(verifiedMarketCatalog);
      setOfficialResults(results);
      setFeedStatus('配信データを取得しました（元資料の更新とは異なります）');
    } catch {
      setFeedStatus('配信データを確認できません。同梱済みの資料結果を表示しています。');
    } finally { setFeedLoading(false); }
  }
  useEffect(() => { void refreshFeed(); }, []);
  const [prefecture, setPrefecture] = useState('岩手県');
  const [name, setName] = useState('');
  const [manualMarketEntry, setManualMarketEntry] = useState(false);
  const [message, setMessage] = useState('');
  const [announcements, setAnnouncements] = useState<MarketAnnouncement[]>([]);
  const [announcementError, setAnnouncementError] = useState('');
  useEffect(() => {
    try {
      const result = synchronizeMarketAnnouncements(localStorage, officialResults, markets, verifiedMarketCatalog);
      setAnnouncements(result.announcements);
      setAnnouncementError('');
    } catch {
      setAnnouncementError('市場情報のお知らせをこの端末へ保存できません。');
    }
  }, [markets, officialResults]);
  function save(next: Market[]) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); setMarkets(next); setMessage(''); }
    catch { setMessage('選択情報を保存できませんでした。ブラウザの設定をご確認ください。'); }
  }
  function add() {
    const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!normalized) { setMessage('市場を選択するか、市場名を入力してください。'); return; }
    if (markets.some(m => m.prefecture === prefecture && m.name === normalized)) { setMessage('選択済みの市場です。'); return; }
    save([...markets, { prefecture, name: normalized, notify: true }]);
    setName('');
    setManualMarketEntry(false);
  }
  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={900}>子牛市場情報</Typography>
    <Alert severity="info">公式資料で確認した月次結果の一部を表示します。アプリ配信データを画面表示時に確認しますが、提供元サイトからの自動収集やプッシュ通知は未対応です。</Alert>
    <Card variant="outlined"><CardContent><Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">{feedStatus}</Typography>
      <Button variant="outlined" disabled={feedLoading} onClick={() => { void refreshFeed(); }}>{feedLoading ? '確認中…' : '市場情報を再確認する'}</Button>
    </Stack></CardContent></Card>
    <Card variant="outlined"><CardContent><Stack spacing={1}>
      <Typography variant="h6">市場結果のお知らせ</Typography>
      <Typography variant="body2" color="text.secondary">アプリでこの画面を開いたとき、前回確認した資料と比較します。端末へのプッシュ通知ではありません。</Typography>
      {announcementError && <Alert severity="warning">{announcementError}</Alert>}
      {announcements.filter(a => !a.read).length === 0 ?
        <Typography variant="body2">新しいお知らせはありません。</Typography> :
        <>
          {announcements.filter(a => !a.read).map(a => <Alert key={a.id} severity="info">
            {verifiedMarketCatalog.find(m => m.id === a.marketId)?.name ?? '選択市場'}：
            {a.kind === 'revision' ? '掲載結果に更新があります' : '新しい集計結果が掲載されました'}
            （対象期間末日 {a.periodEnd}・{a.sex === 'female' ? '雌' : a.sex === 'castrated' ? '去勢' : a.sex === 'male' ? '雄' : '区分不明'}）
          </Alert>)}
          <Button variant="outlined" onClick={() => {
            try { setAnnouncements(markMarketAnnouncementsRead(localStorage)); }
            catch { setAnnouncementError('既読状態を保存できませんでした。'); }
          }}>確認済みにする</Button>
        </>}
    </Stack></CardContent></Card>
    <Card variant="outlined"><CardContent><Stack spacing={2}>
      <Typography variant="h6">通知を希望する市場</Typography>
      <Typography variant="body2" color="text.secondary">全国から都道府県を選び、2025年7月末時点の農林水産省「家畜市場リスト」に掲載された候補を選択できます。子牛市場の現在の開催状況・結果配信への対応は市場ごとに未確認です。</Typography>
      <TextField select fullWidth label="都道府県" value={prefecture} onChange={e => { setPrefecture(e.target.value); setName(''); setManualMarketEntry(false); }}>
        {PREFECTURES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
      </TextField>
      {verifiedMarketCatalog.some(m => m.prefecture === prefecture) && !manualMarketEntry && <TextField select fullWidth label="子牛市場を選択" value={name} onChange={e => setName(e.target.value)}>
        <MenuItem value="">市場を選択してください</MenuItem>
        {verifiedMarketCatalog.filter(m => m.prefecture === prefecture).map(m => <MenuItem key={m.id} value={m.name}>{m.name}</MenuItem>)}
      </TextField>}
      {(manualMarketEntry || !verifiedMarketCatalog.some(m => m.prefecture === prefecture)) && <>
        <TextField fullWidth label="一覧にない子牛市場名" value={name} onChange={e => setName(e.target.value)} inputProps={{ maxLength: 80 }} />
        <Typography variant="caption" color="text.secondary">未確認の市場名も選択先として保存できます。ただし、正式な市場と確認されるまで市場価格は表示されません。</Typography>
      </>}
      {verifiedMarketCatalog.some(m => m.prefecture === prefecture) && <Button size="small" variant="text" onClick={() => { setManualMarketEntry(!manualMarketEntry); setName(''); setMessage(''); }}>
        {manualMarketEntry ? '確認済み市場の選択に戻る' : '一覧にない市場を入力する'}
      </Button>}
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
      {markets.map(m => <Box key={m.prefecture + m.name} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1, minWidth: 0, borderBottom: 1, borderColor: 'divider', py: 1 }}>
        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}><Typography fontWeight={700}>{m.name}</Typography><Typography variant="body2" color="text.secondary">{m.prefecture}</Typography></Box>
        {(() => {
          const view = getSelectedMarketResult(m, verifiedMarketCatalog, officialResults);
          if (view.status === 'market-unverified') return <Typography variant="body2" color="text.secondary">市場情報：正式名称の確認待ち・価格は未公表</Typography>;
          if (!view.latest) return <Typography variant="body2" color="text.secondary">市場結果：未公表</Typography>;
          const result = view.latest;
          return <Box sx={{ width: '100%', minWidth: 0, overflowWrap: 'anywhere' }}>
            <Typography variant="body2">開催期間：{result.periodStart} ～ {result.periodEnd}（{result.status === 'final' ? '確定' : '速報'}）</Typography>
            {view.latestBySex.map((entry) => <Box key={entry.marketId + entry.periodStart + entry.periodEnd + entry.breed + entry.sex} sx={{ py: 0.5 }}>
              <Typography variant="body2" fontWeight={700}>{entry.breed}／{entry.sex === 'castrated' ? '去勢' : entry.sex === 'female' ? '雌' : entry.sex === 'male' ? '雄' : '不明'}</Typography>
              <Typography variant="body2">平均価格：{formatPublishedPrice(entry.averagePriceYen, entry.priceIncludesTax)}　取引頭数：{entry.headCount === null ? '未公表' : entry.headCount + '頭'}</Typography>
            </Box>)}
            <Typography variant="caption">資料更新日：{result.publishedAt.slice(0, 10)}　<a href={result.sourceUrl} target="_blank" rel="noopener noreferrer">出典を見る</a></Typography>
          </Box>;
        })()}
        <FormControlLabel sx={{ alignSelf: 'flex-start', ml: 0 }} label="通知を希望" control={<Checkbox checked={m.notify} onChange={e => save(markets.map(item => item === m ? { ...item, notify: e.target.checked } : item))} />} />
        <Button size="small" color="error" onClick={() => save(markets.filter(item => item !== m))}>削除</Button>
      </Box>)}
      <Typography variant="caption" color="text.secondary">選択内容のみ専用の端末内保存領域に保存します。牛・販売・経費データや同期処理は変更しません。「通知を希望」は配信開始を意味しません。</Typography>
    </Stack></CardContent></Card>
  </Stack>;
}
