import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { FarmSettings } from '../types/settings';
import { MasterCategory, MasterInput, MasterItem } from '../types/master';
import { getFarmSettings, updateFarmSettings } from '../services/settingsApi';
import { createMaster, getMasters, updateMaster } from '../services/masterApi';

const emptySettings: FarmSettings = {
  farmName: '',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  estrousCycleDays: 21,
  memo: ''
};

const categoryLabels: Record<MasterCategory, string> = {
  bull: '種雄牛',
  feed: '飼料',
  medicine: '薬品・ワクチン',
  partner: '取引先'
};

const emptyMaster = (category: MasterCategory): MasterInput => ({
  category,
  name: '',
  code: '',
  detail: '',
  note: '',
  active: true
});

function display(value: string) {
  return value || '-';
}

export function SettingsPage() {
  const [form, setForm] = useState<FarmSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const [masterCategory, setMasterCategory] = useState<MasterCategory>('bull');
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [masterForm, setMasterForm] = useState<MasterInput>(emptyMaster('bull'));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [masterMessage, setMasterMessage] = useState('');
  const [masterError, setMasterError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    getFarmSettings().then(setForm).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMasters(masterCategory);
    setMasterForm(emptyMaster(masterCategory));
    setEditingId(null);
    setMasterMessage('');
    setMasterError('');
  }, [masterCategory]);

  const visibleMasters = useMemo(
    () => masterItems.filter((item) => showInactive || item.active),
    [masterItems, showInactive]
  );

  const loadMasters = async (category: MasterCategory) => {
    try {
      setMasterItems(await getMasters(category));
    } catch (error) {
      setMasterError(error instanceof Error ? error.message : 'マスター一覧の取得に失敗しました');
    }
  };

  const setValue = (key: keyof FarmSettings, value: string | number) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setMasterValue = (key: keyof MasterInput, value: string | boolean) => {
    setMasterMessage('');
    setMasterError('');
    setMasterForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const savedSettings = await updateFarmSettings(form);
    setForm(savedSettings);
    setSaved(true);
  };

  const handleMasterSave = async () => {
    if (!masterForm.name.trim()) {
      setMasterError('名称を入力してください');
      return;
    }

    try {
      const savedItem = editingId
        ? await updateMaster(editingId, masterForm)
        : await createMaster(masterForm);
      await loadMasters(masterCategory);
      setMasterForm(emptyMaster(masterCategory));
      setEditingId(null);
      setMasterMessage(`${savedItem.name}を${editingId ? '更新' : '登録'}しました`);
      setMasterError('');
    } catch (error) {
      setMasterError(error instanceof Error ? error.message : 'マスター保存に失敗しました');
    }
  };

  const startEdit = (item: MasterItem) => {
    setEditingId(item.id);
    setMasterForm({
      category: item.category,
      name: item.name,
      code: item.code,
      detail: item.detail,
      note: item.note,
      active: item.active
    });
    setMasterMessage('');
    setMasterError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setMasterForm(emptyMaster(masterCategory));
    setMasterMessage('');
    setMasterError('');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800}>農場設定</Typography>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      {saved && <Alert severity="success">農場設定を保存しました。</Alert>}

      <Card className="no-print">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>設定を編集</Typography>
            <TextField label="農場名" value={form.farmName} onChange={(e) => setValue('farmName', e.target.value)} fullWidth />
            <TextField label="代表者名" value={form.ownerName} onChange={(e) => setValue('ownerName', e.target.value)} fullWidth />
            <TextField label="担当者名" value={form.staffName} onChange={(e) => setValue('staffName', e.target.value)} fullWidth />
            <TextField label="電話番号" value={form.phone} onChange={(e) => setValue('phone', e.target.value)} fullWidth />
            <TextField label="住所" value={form.address} onChange={(e) => setValue('address', e.target.value)} fullWidth />
            <TextField label="発情周期（日）" type="number" value={form.estrousCycleDays} onChange={(e) => setValue('estrousCycleDays', Number(e.target.value))} fullWidth />
            <TextField label="メモ" value={form.memo} onChange={(e) => setValue('memo', e.target.value)} multiline minRows={3} fullWidth />
            <Button variant="contained" size="large" onClick={handleSave}>保存</Button>
          </Stack>
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardContent>
          <Stack spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="h6" fontWeight={800}>マスター登録</Typography>
              <Typography color="text.secondary">登録済みから選べるようにする共通データです。削除せず、使用停止で管理します。</Typography>
            </Stack>

            <TextField
              label="マスター区分"
              select
              value={masterCategory}
              onChange={(e) => setMasterCategory(e.target.value as MasterCategory)}
              fullWidth
            >
              {(Object.keys(categoryLabels) as MasterCategory[]).map((category) => (
                <MenuItem key={category} value={category}>{categoryLabels[category]}</MenuItem>
              ))}
            </TextField>

            {masterMessage && <Alert severity="success">{masterMessage}</Alert>}
            {masterError && <Alert severity="error">{masterError}</Alert>}

            <Typography fontWeight={800}>{editingId ? '登録内容を編集' : `${categoryLabels[masterCategory]}を新規登録`}</Typography>
            <TextField label="名称" value={masterForm.name} onChange={(e) => setMasterValue('name', e.target.value)} required fullWidth />
            <TextField label="登録番号・コード" value={masterForm.code} onChange={(e) => setMasterValue('code', e.target.value)} fullWidth />
            <TextField label="区分・メーカー・担当者など" value={masterForm.detail} onChange={(e) => setMasterValue('detail', e.target.value)} fullWidth />
            <TextField label="備考" value={masterForm.note} onChange={(e) => setMasterValue('note', e.target.value)} multiline minRows={2} fullWidth />
            <TextField label="使用状態" select value={masterForm.active ? 'active' : 'inactive'} onChange={(e) => setMasterValue('active', e.target.value === 'active')} fullWidth>
              <MenuItem value="active">使用中</MenuItem>
              <MenuItem value="inactive">使用停止</MenuItem>
            </TextField>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleMasterSave}>{editingId ? '更新' : '登録'}</Button>
              {editingId && <Button variant="outlined" size="large" onClick={cancelEdit}>編集をやめる</Button>}
              <Button variant="text" onClick={() => setShowInactive((prev) => !prev)}>
                {showInactive ? '使用停止を隠す' : '使用停止も表示'}
              </Button>
            </Stack>

            <Divider />
            <Typography fontWeight={800}>登録済み一覧</Typography>
            {visibleMasters.length === 0 ? (
              <Typography color="text.secondary">まだ登録されていません。</Typography>
            ) : (
              <Stack spacing={1}>
                {visibleMasters.map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardContent>
                      <Stack spacing={1}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                          <Stack spacing={0.25}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography fontWeight={900}>{item.name}</Typography>
                              <Chip size="small" label={item.active ? '使用中' : '使用停止'} color={item.active ? 'success' : 'default'} />
                            </Stack>
                            {item.code && <Typography variant="body2">コード：{item.code}</Typography>}
                            {item.detail && <Typography variant="body2">詳細：{item.detail}</Typography>}
                            {item.note && <Typography variant="body2" color="text.secondary">備考：{item.note}</Typography>}
                          </Stack>
                          <Button variant="outlined" onClick={() => startEdit(item)}>編集</Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>現在の農場情報</Typography>
            <Typography color="text.secondary">印刷時にも確認できる設定内容です。</Typography>
            <Divider />
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>農場名</TableCell><TableCell>{display(form.farmName)}</TableCell></TableRow>
                <TableRow><TableCell>代表者名</TableCell><TableCell>{display(form.ownerName)}</TableCell></TableRow>
                <TableRow><TableCell>担当者名</TableCell><TableCell>{display(form.staffName)}</TableCell></TableRow>
                <TableRow><TableCell>電話番号</TableCell><TableCell>{display(form.phone)}</TableCell></TableRow>
                <TableRow><TableCell>住所</TableCell><TableCell>{display(form.address)}</TableCell></TableRow>
                <TableRow><TableCell>発情周期</TableCell><TableCell>{form.estrousCycleDays}日</TableCell></TableRow>
                <TableRow><TableCell>メモ</TableCell><TableCell>{display(form.memo)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}