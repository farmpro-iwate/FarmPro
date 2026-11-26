import { useEffect, useState } from 'react';
import { verifiedMarketCatalog } from '../services/marketCatalog';
import { getStoredAuthUser } from '../services/authClient';
import { fetchMarketWatchlistCloud, isMarketSyncEnabled, MarketWatchlistConflict, saveMarketWatchlistCloud } from '../services/marketWatchlistCloudApi';

import { Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';

type Market = { prefecture: string; name: string; notify: boolean };
// New watchlists are scoped to the signed-in farm and user. The old shared
// key is deliberately not migrated: its owner cannot be identified safely.
const KEY_PREFIX = 'farmpro-market-watchlist-v2';
function marketWatchlistKey(): string | null {
  const user = getStoredAuthUser();
  if (!user?.farmId || !user?.id) return null;
  return `${KEY_PREFIX}:${encodeURIComponent(user.farmId)}:${encodeURIComponent(user.id)}`;
}
const PREFECTURES = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
function readMarkets(): Market[] {
  try {
    const key = marketWatchlistKey();
    if (!key) return [];
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((v): v is Market =>
      v && PREFECTURES.includes(v.prefecture) && typeof v.name === 'string' && typeof v.notify === 'boolean') : [];
  } catch { return []; }
}
export function MarketResultsPage() {
  const [markets, setMarkets] = useState<Market[]>(readMarkets);
  const [prefecture, setPrefecture] = useState('岩手県');
  const [name, setName] = useState('');
  const [manualMarketEntry, setManualMarketEntry] = useState(false);
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(() => isMarketSyncEnabled());
  const [revision, setRevision] = useState<number | null>(null);
  const cloudSync = isMarketSyncEnabled();
  useEffect(() => {
    if (!cloudSync) return;
    let active = true;
    fetchMarketWatchlistCloud()
      .then(result => {
        if (!active) return;
        setMarkets(result.markets);
        setRevision(result.revision);
        setSyncing(false);
        setMessage('');
        const key = marketWatchlistKey();
        if (key) try { localStorage.setItem(key, JSON.stringify(result.markets)); } catch { /* cloud remains authoritative */ }
      })
      .catch(() => {
        if (active) {
          setRevision(null);
          setSyncing(false);
          setMessage('クラウドの市場選択を取得できません。通信状況を確認して再読み込みしてください。');
        }
      });
    return () => { active = false; };
  }, [cloudSync]);

  async function save(next: Market[]) {
    if (cloudSync) {
      if (revision === null || syncing) {
        setMessage('同期情報を確認できていません。通信状況を確認して再読み込みしてください。');
        return false;
      }
      setSyncing(true);
      try {
        const result = await saveMarketWatchlistCloud(revision, next);
        setRevision(result.revision);
        setMarkets(result.markets);
        setMessage('');
        const key = marketWatchlistKey();
        if (key) try { localStorage.setItem(key, JSON.stringify(result.markets)); } catch { /* best-effort cache only */ }
        return true;
      } catch (error) {
        if (error instanceof MarketWatchlistConflict) {
          setRevision(error.latest.revision);
          setMarkets(error.latest.markets);
          setMessage('別の端末で市場選択が更新されました。最新内容を表示しました。必要なら再度操作してください。');
        } else {
          setMessage('クラウドへの保存に失敗しました。変更は反映していません。');
        }
        return false;
      } finally { setSyncing(false); }
    }
    try {
      const key = marketWatchlistKey();
      if (!key) { setMessage('ログイン情報を確認できません。再ログインしてください。'); return false; }
      localStorage.setItem(key, JSON.stringify(next));
      setMarkets(next);
      setMessage('');
      return true;
    }
    catch { setMessage('選択情報を保存できませんでした。ブラウザの設定をご確認ください。'); return false; }
  }
  async function add() {
    const normalized = name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!normalized) { setMessage('市場を選択するか、市場名を入力してください。'); return; }
    if (markets.some(m => m.prefecture === prefecture && m.name === normalized)) { setMessage('選択済みの市場です。'); return; }
    if (await save([...markets, { prefecture, name: normalized, notify: true }])) {
      setName('');
      setManualMarketEntry(false);
    }
  }
  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={900}>子牛市場情報</Typography>
    <Alert severity={cloudSync ? (revision === null ? 'warning' : 'success') : 'info'}>
      {cloudSync ? (revision === null ? '市場のクラウド同期を確認中、または利用できません。保存操作はできません。' : '市場の選択内容はStandard・ProでPCとスマホに同期されます。') : 'Freeは市場の選択内容をこの端末に保存します。PCとスマホの自動同期はStandard・Proで利用できます。'}
    </Alert>
    <Alert severity="info">まず希望する市場を登録できます。市場結果の自動取得・価格表示・お知らせ・プッシュ通知は準備中です。通知希望を設定しても配信は始まりません。</Alert>
    <Card variant="outlined"><CardContent><Stack spacing={2}>
      <Typography variant="h6">市場を選ぶ</Typography>
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
        <Typography variant="caption" color="text.secondary">候補にない市場も登録できます。登録しても価格表示・通知配信はまだ始まりません。</Typography>
      </>}
      {verifiedMarketCatalog.some(m => m.prefecture === prefecture) && <Button size="small" variant="text" onClick={() => { setManualMarketEntry(!manualMarketEntry); setName(''); setMessage(''); }}>
        {manualMarketEntry ? '確認済み市場の選択に戻る' : '一覧にない市場を入力する'}
      </Button>}
      <Button variant="contained" onClick={add} disabled={syncing || (cloudSync && revision === null)}>市場を追加</Button>
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
        <FormControlLabel sx={{ alignSelf: 'flex-start', ml: 0 }} label="通知希望（配信準備中）" control={<Checkbox disabled={syncing || (cloudSync && revision === null)} checked={m.notify} onChange={e => save(markets.map(item => item === m ? { ...item, notify: e.target.checked } : item))} />} />
        <Button size="small" color="error" disabled={syncing || (cloudSync && revision === null)} onClick={() => { void save(markets.filter(item => item !== m)); }}>削除</Button>
      </Box>)}
      <Typography variant="caption" color="text.secondary">市場の選択内容は農場・利用者ごとに保存します。Standard・Proは専用クラウドで同期、Freeは端末内のみです。牛・販売・経費データと従来の同期処理は変更しません。「通知希望」は配信開始を意味しません。</Typography>
    </Stack></CardContent></Card>
  </Stack>;
}
