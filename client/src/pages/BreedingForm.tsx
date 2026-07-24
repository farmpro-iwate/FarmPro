import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { BreedingInput } from '../types/breeding';
import { createBreeding, getBreeding, updateBreeding } from '../services/breedingApi';
import {
  calculateExpectedCalvingDate,
  calculateNextHeatExpectedDate,
  calculatePregnancyCheckExpectedDate,
  daysUntil
} from '../utils/breeding';
import { getFarmSettings } from '../services/settingsApi';
import { FarmSettings } from '../types/settings';
import { CattlePicker } from '../components/CattlePicker';
import { SireSearchField } from '../components/SireSearchField';
import { InseminatorSearchField } from '../components/InseminatorSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';

type Props = { mode: 'create' | 'edit' };

const initialForm: BreedingInput = {
  cowEarTag: '', cowName: '', heatDate: '', breedingMethod: '未選択', breedingStatus: '発情予定',
  inseminationDate: '', bullName: '', bullMasterId: undefined, inseminatorName: '', inseminatorMasterId: undefined,
  transferPlannedDate: '', transferDate: '', transferCancelReason: '',
  embryoNumber: '', collectionDate: '', embryoType: '未選択', donorCowName: '', donorCowEarTag: '',
  embryoSireName: '', embryoSireMasterId: undefined, embryoGrade: '', strawNumber: '', supplierName: '', supplierMasterId: undefined,
  transferTechnician: '', transferTechnicianMasterId: undefined,
  nextHeatExpectedDate: '', pregnancyCheckExpectedDate: '', pregnancyCheckDate: '', pregnancyResult: '未鑑定',
  recheckExpectedDate: '', expectedCalvingDate: '', note: ''
};

function normalizePregnancyResult(value: string) {
  if (value === '妊娠') return '受胎';
  if (value === '不受胎') return '空胎';
  return value || '未鑑定';
}

function normalizeSettings(data: FarmSettings): FarmSettings {
  return {
    ...data,
    bullMasters: Array.isArray(data.bullMasters) ? data.bullMasters : [],
    supplierMasters: Array.isArray(data.supplierMasters) ? data.supplierMasters : []
  };
}

export function BreedingForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const targetNumber = searchParams.get('targetNumber') || '';
  const targetName = searchParams.get('targetName') || '';
  const requestedReturnTo = searchParams.get('returnTo') || '';
  const returnTo = requestedReturnTo.startsWith('/cattle/') ? requestedReturnTo : '/breedings';
  const openedFromCattle = mode === 'create' && Boolean(targetNumber && targetName);

  const [form, setForm] = useState<BreedingInput>(initialForm);
  const [cycleDays, setCycleDays] = useState(21);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const loadedSettings = normalizeSettings(await getFarmSettings());
        setCycleDays(loadedSettings.estrousCycleDays || 21);
        if (mode === 'edit' && id) {
          const data = await getBreeding(id);
          setForm({ ...initialForm, ...data, pregnancyResult: normalizePregnancyResult(data.pregnancyResult) });
        } else if (openedFromCattle) {
          setForm((prev) => ({ ...prev, cowEarTag: targetNumber, cowName: targetName }));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [mode, id, openedFromCattle, targetNumber, targetName]);

  const breedingDate = form.breedingMethod === '受精卵移植' ? form.transferDate : form.inseminationDate;

  useEffect(() => {
    if (!breedingDate) return;
    setForm((prev) => ({
      ...prev,
      nextHeatExpectedDate: calculateNextHeatExpectedDate(breedingDate, cycleDays),
      pregnancyCheckExpectedDate: calculatePregnancyCheckExpectedDate(breedingDate, cycleDays),
      expectedCalvingDate: calculateExpectedCalvingDate(breedingDate)
    }));
  }, [breedingDate, cycleDays]);

  const setValue = (key: keyof BreedingInput, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const submitForm: BreedingInput = openedFromCattle ? { ...form, cowEarTag: targetNumber, cowName: targetName } : form;
    if (!submitForm.cowEarTag || !submitForm.cowName) return alert('耳標番号と牛名は必須です');
    if (submitForm.breedingMethod === '受精卵移植' && submitForm.breedingStatus === '移植実施' && !submitForm.transferDate) {
      return alert('移植実施の場合は移植実施日を入力してください');
    }
    if (submitForm.breedingMethod === '受精卵移植' && submitForm.breedingStatus === '中止' && !submitForm.transferCancelReason) {
      return alert('移植中止の理由を入力してください');
    }
    if (mode === 'create') await createBreeding(submitForm);
    else if (id) await updateBreeding(id, submitForm);
    navigate(openedFromCattle ? returnTo : '/breedings');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '繁殖記録を新規登録' : '繁殖記録を編集'}</Typography>
      <Alert severity="info">発情予定だけでも保存できます。種付・移植後の予定日は、農場設定の発情周期{cycleDays}日を基準に自動計算します。</Alert>
      <Card><CardContent><Stack spacing={2}>
        {openedFromCattle ? (
          <Card variant="outlined"><CardContent><Stack spacing={0.5}>
            <Typography fontWeight={900}>対象牛</Typography>
            <Typography variant="h6" fontWeight={900}>{targetName}</Typography>
            <Typography color="text.secondary">耳標番号：{targetNumber}</Typography>
          </Stack></CardContent></Card>
        ) : mode === 'create' ? (
          <CattlePicker onSelect={(cattle) => setForm((prev) => ({ ...prev, cowEarTag: cattle.earTag, cowName: cattle.name }))} />
        ) : null}
        {!openedFromCattle && <>
          <TextField label="耳標番号" value={form.cowEarTag} onChange={(e) => setValue('cowEarTag', e.target.value)} required fullWidth />
          <TextField label="牛名" value={form.cowName} onChange={(e) => setValue('cowName', e.target.value)} required fullWidth />
        </>}

        <Typography variant="h6" fontWeight={800}>発情・実施状況</Typography>
        <TextField label="実際の発情日" type="date" value={form.heatDate} onChange={(e) => setValue('heatDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
      <Stack spacing={1}>
        <Typography variant="subtitle1" fontWeight={700}>
          発情兆候
        </Typography>

        <Typography variant="body2" color="text.secondary">
          確認できた兆候を複数選択できます。
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap">
          {[
            '粘液',
            'スタンディング',
            '咆哮',
            '乗駕',
            '落ち着きがない',
            '外陰部の腫れ',
          ].map((sign) => (
            <FormControlLabel
              key={sign}
              label={sign}
              control={
                <Checkbox
                  checked={(form.estrusSigns ?? []).includes(sign)}
                  onChange={(event) => {
                    setForm((prev) => {
                      const current = prev.estrusSigns ?? [];
                      const estrusSigns = event.target.checked
                        ? [...current, sign]
                        : current.filter((item) => item !== sign);

                      return { ...prev, estrusSigns };
                    });
                  }}
                />
              }
            />
          ))}
        </Stack>

        <TextField
          label="その他の発情兆候"
          value={form.estrusSignsOther ?? ''}
          onChange={(event) => setValue('estrusSignsOther', event.target.value)}
          placeholder="例：食欲低下、尾を上げる、他牛への接近など"
          fullWidth
        />
      </Stack>
        <TextField label="繁殖方法" select value={form.breedingMethod} onChange={(e) => setValue('breedingMethod', e.target.value)} fullWidth>
          <MenuItem value="未選択">未選択</MenuItem><MenuItem value="種付">種付</MenuItem><MenuItem value="受精卵移植">受精卵移植</MenuItem>
        </TextField>
        <TextField label="現在の段階" select value={form.breedingStatus} onChange={(e) => setValue('breedingStatus', e.target.value)} fullWidth>
          <MenuItem value="発情予定">発情予定</MenuItem><MenuItem value="発情確認">発情確認</MenuItem><MenuItem value="種付予定">種付予定</MenuItem><MenuItem value="種付実施">種付実施</MenuItem><MenuItem value="移植予定">移植予定</MenuItem><MenuItem value="移植実施">移植実施</MenuItem><MenuItem value="中止">中止</MenuItem>
        </TextField>

        {form.breedingMethod === '種付' && <>
          <TextField label="種付・授精日" type="date" value={form.inseminationDate} onChange={(e) => setValue('inseminationDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <SireSearchField
            value={form.bullName}
            masterId={form.bullMasterId}
            onChange={(name, id) => {
              setValue('bullName', name);
              setForm((prev) => ({ ...prev, bullMasterId: id }));
            }}
            label="種雄牛"
            required={false}
          />
          <InseminatorSearchField
            value={form.inseminatorName}
            masterId={form.inseminatorMasterId}
            onChange={(name, id) => {
              setValue('inseminatorName', name);
              setForm((prev) => ({ ...prev, inseminatorMasterId: id }));
            }}
          />
        </>}

        {form.breedingMethod === '受精卵移植' && <>
          <Typography variant="h6" fontWeight={800}>受精卵移植</Typography>
          <Alert severity="info">受卵牛は上の対象牛です。供卵牛と父牛は子牛の血統情報として分けて記録します。</Alert>
          <TextField label="移植予定日" type="date" value={form.transferPlannedDate} onChange={(e) => setValue('transferPlannedDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label="移植実施日" type="date" value={form.transferDate} onChange={(e) => setValue('transferDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label="受精卵番号・管理番号" value={form.embryoNumber} onChange={(e) => setValue('embryoNumber', e.target.value)} fullWidth />
          <TextField label="採卵日" type="date" value={form.collectionDate} onChange={(e) => setValue('collectionDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label="受精卵区分" select value={form.embryoType} onChange={(e) => setValue('embryoType', e.target.value)} fullWidth>
            <MenuItem value="未選択">未選択</MenuItem><MenuItem value="新鮮卵">新鮮卵</MenuItem><MenuItem value="凍結卵">凍結卵</MenuItem>
          </TextField>
          <TextField label="供卵牛名（遺伝的母牛）" value={form.donorCowName} onChange={(e) => setValue('donorCowName', e.target.value)} fullWidth />
          <TextField label="供卵牛耳標番号" value={form.donorCowEarTag} onChange={(e) => setValue('donorCowEarTag', e.target.value)} fullWidth />

          <SireSearchField
            value={form.embryoSireName}
            masterId={form.embryoSireMasterId}
            onChange={(name, id) => {
              setValue('embryoSireName', name);
              setForm((prev) => ({ ...prev, embryoSireMasterId: id }));
            }}
            label="受精卵の父牛"
            required={false}
          />

          <TextField label="受精卵ランク・品質" value={form.embryoGrade} onChange={(e) => setValue('embryoGrade', e.target.value)} fullWidth />
          <TextField label="ストロー番号" value={form.strawNumber} onChange={(e) => setValue('strawNumber', e.target.value)} fullWidth />

          <PartnerSearchField
            label="購入先・所有者"
            value={form.supplierName}
            masterId={form.supplierMasterId}
            onChange={(name, id) => {
              setValue('supplierName', name);
              setForm((prev) => ({ ...prev, supplierMasterId: id }));
            }}
          />

          <InseminatorSearchField
            label="移植担当者"
            value={form.transferTechnician}
            masterId={form.transferTechnicianMasterId}
            onChange={(name, id) => {
              setValue('transferTechnician', name);
              setForm((prev) => ({ ...prev, transferTechnicianMasterId: id }));
            }}
          />
          {form.breedingStatus === '中止' && <TextField label="移植中止理由" value={form.transferCancelReason} onChange={(e) => setValue('transferCancelReason', e.target.value)} placeholder="発情状態、黄体状態、体調、獣医師判断など" required fullWidth />}
        </>}

        <Typography variant="h6" fontWeight={800}>自動計算される予定</Typography>
        <TextField label="次回発情予定日" type="date" value={form.nextHeatExpectedDate} onChange={(e) => setValue('nextHeatExpectedDate', e.target.value)} InputLabelProps={{ shrink: true }} helperText={`実施日から発情周期${cycleDays}日後。目安なので修正できます。`} fullWidth />
        <TextField label="妊娠鑑定予定日" type="date" value={form.pregnancyCheckExpectedDate} onChange={(e) => setValue('pregnancyCheckExpectedDate', e.target.value)} InputLabelProps={{ shrink: true }} helperText={`実施日から発情周期2回分（${cycleDays * 2}日後）。`} fullWidth />
        <Typography variant="h6" fontWeight={800}>鑑定結果・受胎後の管理</Typography>
        <TextField label="妊娠鑑定日" type="date" value={form.pregnancyCheckDate} onChange={(e) => setValue('pregnancyCheckDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
        <TextField label="受胎確認" select value={form.pregnancyResult} onChange={(e) => setValue('pregnancyResult', e.target.value)} fullWidth>
          <MenuItem value="未鑑定">未鑑定</MenuItem><MenuItem value="再鑑定予定">再鑑定予定</MenuItem><MenuItem value="受胎">受胎</MenuItem><MenuItem value="空胎">空胎</MenuItem><MenuItem value="流産・胎子喪失">流産・胎子喪失</MenuItem>
        </TextField>
        <TextField label="再鑑定予定日" type="date" value={form.recheckExpectedDate} onChange={(e) => setValue('recheckExpectedDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
        <TextField label="分娩予定日" type="date" value={form.expectedCalvingDate} onChange={(e) => setValue('expectedCalvingDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
        {form.expectedCalvingDate && <Typography color="text.secondary">分娩予定日まで：あと{daysUntil(form.expectedCalvingDate)}日</Typography>}
        <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
          <Button component={RouterLink} to={openedFromCattle ? returnTo : '/breedings'} variant="outlined" size="large">戻る</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
