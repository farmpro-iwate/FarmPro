import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  createBreedingAdvancedRecord,
  type BreedingAdvancedRecord
} from '../services/breedingAdvancedApi';
import { SireSearchField } from '../components/SireSearchField';
import { InseminatorSearchField } from '../components/InseminatorSearchField';

type CattleItem = {
  id?: string;
  name?: string;
  earTag?: string;
  individualNo?: string;
  sex?: string;
  birthDate?: string;
};

const breedingTypes = ['人工授精', '自然交配', '受精卵移植', 'その他'];
const pregnancyResults = ['未鑑定', '妊娠', '不受胎', '再確認', '流産', '不明'];
const statuses = ['実施済み', '鑑定待ち', '妊娠', '不受胎', '再確認', '分娩済み', '中止'];
const embryoTypes = ['', '新鮮卵', '凍結卵', 'その他'];
const embryoRanks = ['', 'A', 'B', 'C', '不明'];

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function today() {
  return toDateInput(new Date());
}

function addDays(dateText: string, days: number) {
  if (!dateText) return '';
  const d = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

function cattleLabel(cow: CattleItem) {
  const earTag = cow.earTag || cow.individualNo || '';
  const name = cow.name || '';
  return [earTag, name].filter(Boolean).join(' ') || cow.id || '';
}

function initialForm(): BreedingAdvancedRecord {
  const date = today();

  return {
    cowId: '',
    cowName: '',
    breedingType: '人工授精',
    serviceDate: date,
    expectedCalvingDate: addDays(date, 285),
    pregnancyCheckDate: addDays(date, 40),
    pregnancyCheckActualDate: '',
    pregnancyResult: '未鑑定',
    status: '鑑定待ち',
    sireName: '',
    sireMasterId: undefined,
    semenNo: '',
    inseminatorName: '',
    inseminatorMasterId: undefined,
    matingStartDate: '',
    matingEndDate: '',
    donorCowId: '',
    donorCowName: '',
    embryoNo: '',
    embryoType: '',
    embryoRank: '',
    transferOperatorName: '',
    memo: ''
  };
}

export function BreedingAdvancedForm() {
  const navigate = useNavigate();

  const [cattle, setCattle] = useState<CattleItem[]>([]);
  const [loadingCattle, setLoadingCattle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<BreedingAdvancedRecord>(initialForm());

  async function loadCattle() {
    setLoadingCattle(true);

    try {
      const res = await fetch('http://localhost:4000/api/cattle');
      if (!res.ok) throw new Error('牛台帳を取得できませんでした。');
      const data = await res.json();
      setCattle(Array.isArray(data) ? data : []);
    } catch {
      setCattle([]);
    } finally {
      setLoadingCattle(false);
    }
  }

  useEffect(() => {
    loadCattle();
  }, []);

  function update<K extends keyof BreedingAdvancedRecord>(key: K, value: BreedingAdvancedRecord[K]) {
    setForm((prev) => {
      const next = {
        ...prev,
        [key]: value
      };

      if (key === 'serviceDate') {
        const dateText = String(value || '');
        next.expectedCalvingDate = addDays(dateText, 285);
        next.pregnancyCheckDate = addDays(dateText, 40);
      }

      return next;
    });
  }

  function handleCowSelect(cowId: string) {
    const cow = cattle.find((item) => String(item.id || '') === cowId);
    setForm((prev) => ({
      ...prev,
      cowId,
      cowName: cow ? cattleLabel(cow) : prev.cowName || ''
    }));
  }

  function handleDonorSelect(donorCowId: string) {
    const cow = cattle.find((item) => String(item.id || '') === donorCowId);
    setForm((prev) => ({
      ...prev,
      donorCowId,
      donorCowName: cow ? cattleLabel(cow) : prev.donorCowName || ''
    }));
  }

  const selectedType = form.breedingType || '人工授精';

  const typeHelp = useMemo(() => {
    if (selectedType === '人工授精') {
      return '人工授精では、種雄牛・精液番号・授精師を中心に記録します。';
    }

    if (selectedType === '自然交配') {
      return '自然交配では、種雄牛と同居期間を記録します。';
    }

    if (selectedType === '受精卵移植') {
      return '受精卵移植では、受卵牛・ドナー牛・受精卵番号・卵区分・ランク・移植者を記録します。';
    }

    return 'その他の繁殖記録として登録します。';
  }, [selectedType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    if (!form.cowName && !form.cowId) {
      setError('母牛または受卵牛を入力してください。');
      setSaving(false);
      return;
    }

    if (!form.serviceDate) {
      setError('実施日を入力してください。');
      setSaving(false);
      return;
    }

    try {
      await createBreedingAdvancedRecord(form);
      setMessage('繁殖強化記録を登録しました。既存の繁殖一覧で確認できます。');
      setTimeout(() => navigate('/breedings'), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        繁殖強化 新規登録
      </Typography>

      <Alert severity="info">
        既存の繁殖画面を壊さないための別画面です。人工授精・自然交配・受精卵移植をここで登録できます。
      </Alert>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={800}>
                基本情報
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="繁殖区分"
                    select
                    fullWidth
                    value={form.breedingType || '人工授精'}
                    onChange={(e) => update('breedingType', e.target.value)}
                  >
                    {breedingTypes.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label={selectedType === '受精卵移植' ? '移植日' : selectedType === '自然交配' ? '交配日' : '授精日'}
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.serviceDate || ''}
                    onChange={(e) => update('serviceDate', e.target.value)}
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="状態"
                    select
                    fullWidth
                    value={form.status || '鑑定待ち'}
                    onChange={(e) => update('status', e.target.value)}
                  >
                    {statuses.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>

              <Alert severity="info">{typeHelp}</Alert>

              <Typography variant="h6" fontWeight={800}>
                母牛・受卵牛
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label={selectedType === '受精卵移植' ? '受卵牛を選択' : '母牛を選択'}
                    select
                    fullWidth
                    value={form.cowId || ''}
                    onChange={(e) => handleCowSelect(e.target.value)}
                    helperText={loadingCattle ? '牛台帳を読み込み中...' : '牛台帳から選べます。なければ右の欄に手入力できます。'}
                  >
                    <MenuItem value="">選択しない</MenuItem>
                    {cattle.map((cow) => (
                      <MenuItem key={cow.id || cattleLabel(cow)} value={cow.id || ''}>
                        {cattleLabel(cow)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label={selectedType === '受精卵移植' ? '受卵牛名' : '母牛名'}
                    fullWidth
                    value={form.cowName || ''}
                    onChange={(e) => update('cowName', e.target.value)}
                  />
                </Grid>
              </Grid>

              {(selectedType === '人工授精' || selectedType === '自然交配') && (
                <>
                  <Typography variant="h6" fontWeight={800}>
                    {selectedType === '人工授精' ? '人工授精情報' : '自然交配情報'}
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <SireSearchField
                        value={form.sireName || ''}
                        masterId={form.sireMasterId}
                        onChange={(name, masterId) => {
                          setForm((prev) => ({
                            ...prev,
                            sireName: name,
                            sireMasterId: masterId
                          }));
                        }}
                        label="種雄牛"
                      />
                    </Grid>

                    {selectedType === '人工授精' && (
                      <>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="精液番号"
                            fullWidth
                            value={form.semenNo || ''}
                            onChange={(e) => update('semenNo', e.target.value)}
                          />
                        </Grid>

                        <Grid item xs={12} md={4}>
                          <InseminatorSearchField
                            value={form.inseminatorName || ''}
                            masterId={form.inseminatorMasterId}
                            onChange={(name, masterId) => {
                              setForm((prev) => ({
                                ...prev,
                                inseminatorName: name,
                                inseminatorMasterId: masterId
                              }));
                            }}
                          />
                        </Grid>
                      </>
                    )}

                    {selectedType === '自然交配' && (
                      <>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="同居開始日"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={form.matingStartDate || ''}
                            onChange={(e) => update('matingStartDate', e.target.value)}
                          />
                        </Grid>

                        <Grid item xs={12} md={4}>
                          <TextField
                            label="同居終了日"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={form.matingEndDate || ''}
                            onChange={(e) => update('matingEndDate', e.target.value)}
                          />
                        </Grid>
                      </>
                    )}
                  </Grid>
                </>
              )}

              {selectedType === '受精卵移植' && (
                <>
                  <Typography variant="h6" fontWeight={800}>
                    受精卵移植情報
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="ドナー牛を選択"
                        select
                        fullWidth
                        value={form.donorCowId || ''}
                        onChange={(e) => handleDonorSelect(e.target.value)}
                      >
                        <MenuItem value="">選択しない</MenuItem>
                        {cattle.map((cow) => (
                          <MenuItem key={cow.id || cattleLabel(cow)} value={cow.id || ''}>
                            {cattleLabel(cow)}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <TextField
                        label="ドナー牛名"
                        fullWidth
                        value={form.donorCowName || ''}
                        onChange={(e) => update('donorCowName', e.target.value)}
                      />
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <SireSearchField
                        value={form.sireName || ''}
                        masterId={form.sireMasterId}
                        onChange={(name, masterId) => {
                          setForm((prev) => ({
                            ...prev,
                            sireName: name,
                            sireMasterId: masterId
                          }));
                        }}
                        label="種雄牛"
                      />
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <TextField
                        label="受精卵番号"
                        fullWidth
                        value={form.embryoNo || ''}
                        onChange={(e) => update('embryoNo', e.target.value)}
                      />
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <TextField
                        label="卵区分"
                        select
                        fullWidth
                        value={form.embryoType || ''}
                        onChange={(e) => update('embryoType', e.target.value)}
                      >
                        {embryoTypes.map((item) => (
                          <MenuItem key={item || 'blank'} value={item}>
                            {item || '未選択'}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <TextField
                        label="受精卵ランク"
                        select
                        fullWidth
                        value={form.embryoRank || ''}
                        onChange={(e) => update('embryoRank', e.target.value)}
                      >
                        {embryoRanks.map((item) => (
                          <MenuItem key={item || 'blank'} value={item}>
                            {item || '未選択'}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>

                    <Grid item xs={12} md={4}>
                      <TextField
                        label="移植者"
                        fullWidth
                        value={form.transferOperatorName || ''}
                        onChange={(e) => update('transferOperatorName', e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </>
              )}

              <Typography variant="h6" fontWeight={800}>
                予定・妊娠鑑定
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="分娩予定日"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.expectedCalvingDate || ''}
                    onChange={(e) => update('expectedCalvingDate', e.target.value)}
                    helperText="実施日 + 285日で自動計算。必要なら修正できます。"
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="妊娠鑑定予定日"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.pregnancyCheckDate || ''}
                    onChange={(e) => update('pregnancyCheckDate', e.target.value)}
                    helperText="実施日 + 40日で自動計算。必要なら修正できます。"
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="妊娠鑑定結果"
                    select
                    fullWidth
                    value={form.pregnancyResult || '未鑑定'}
                    onChange={(e) => update('pregnancyResult', e.target.value)}
                  >
                    {pregnancyResults.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="妊娠鑑定実施日"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.pregnancyCheckActualDate || ''}
                    onChange={(e) => update('pregnancyCheckActualDate', e.target.value)}
                  />
                </Grid>
              </Grid>

              <TextField
                label="メモ"
                fullWidth
                multiline
                minRows={3}
                value={form.memo || ''}
                onChange={(e) => update('memo', e.target.value)}
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '保存中...' : '登録する'}
                </Button>
                <Button variant="outlined" onClick={() => navigate('/breedings')}>
                  既存の繁殖一覧へ戻る
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default BreedingAdvancedForm;
