import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import RestoreIcon from '@mui/icons-material/Restore';
import AddIcon from '@mui/icons-material/Add';
import { Master, MasterCategory, masterCategoryLabels } from '../types/master';
import {
  checkMasterDuplicate,
  createMaster,
  deleteMaster,
  getMasterList,
  updateMaster
} from '../services/masterApi';

type TabValue = MasterCategory;

export function MastersPage() {
  const [tab, setTab] = useState<TabValue>('sire');
  const [masters, setMasters] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    note: ''
  });

  const load = async () => {
    setLoading(true);
    const data = await getMasterList();
    setMasters(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredMasters = useMemo(() => {
    const categoryMasters = masters.filter((m) => m.category === tab);
    if (!keyword) return categoryMasters;

    const lowerKeyword = keyword.toLowerCase();
    return categoryMasters.filter(
      (m) =>
        m.name.toLowerCase().includes(lowerKeyword) ||
        (m.code && m.code.toLowerCase().includes(lowerKeyword)) ||
        (m.note && m.note.toLowerCase().includes(lowerKeyword))
    );
  }, [masters, tab, keyword]);

  const activeMasters = filteredMasters.filter((m) => m.active);
  const inactiveMasters = filteredMasters.filter((m) => !m.active);

  const resetForm = () => {
    setFormData({ name: '', code: '', note: '' });
    setEditingId(null);
    setError('');
  };

  const handleOpenForm = (master?: Master) => {
    if (master) {
      setFormData({ name: master.name, code: master.code || '', note: master.note || '' });
      setEditingId(master.id);
    } else {
      resetForm();
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('名称は必須です');
      return;
    }

    try {
      if (editingId) {
        await updateMaster(editingId, {
          category: tab,
          name: formData.name,
          code: formData.code || undefined,
          note: formData.note || undefined
        });
        setSuccess('マスターを更新しました');
      } else {
        const isDuplicate = await checkMasterDuplicate(tab, formData.name);
        if (isDuplicate) {
          setError('この名称はすでに登録されています');
          return;
        }

        await createMaster({
          category: tab,
          name: formData.name,
          code: formData.code || undefined,
          note: formData.note || undefined
        });
        setSuccess('マスターを登録しました');
      }

      await load();
      handleCloseForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    }
  };

  const handleToggleActive = async (masterId: number, currentActive: boolean) => {
    if (!window.confirm(currentActive ? 'このマスターを無効化しますか？' : 'このマスターを有効化しますか？')) {
      return;
    }

    try {
      const master = masters.find((m) => m.id === masterId);
      if (!master) return;

      if (currentActive) {
        await deleteMaster(masterId);
        setSuccess('マスターを無効化しました');
      } else {
        await updateMaster(masterId, {
          category: master.category,
          name: master.name,
          code: master.code,
          note: master.note
        });
        setSuccess('マスターを有効化しました');
      }

      await load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理に失敗しました');
    }
  };

  const renderMasterRow = (master: Master) => (
    <TableRow key={master.id}>
      <TableCell>{master.name}</TableCell>
      <TableCell>{master.code || '-'}</TableCell>
      <TableCell>{master.note || '-'}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={master.active ? '有効' : '無効'}
          color={master.active ? 'success' : 'default'}
          variant={master.active ? 'filled' : 'outlined'}
        />
      </TableCell>
      <TableCell align="right">
        {master.active && (
          <IconButton
            size="small"
            onClick={() => handleOpenForm(master)}
            title="編集"
          >
            <EditIcon />
          </IconButton>
        )}
        <IconButton
          size="small"
          onClick={() => handleToggleActive(master.id, master.active)}
          title={master.active ? '無効化' : '有効化'}
          color={master.active ? 'error' : 'success'}
        >
          {master.active ? <DeleteIcon /> : <RestoreIcon />}
        </IconButton>
      </TableCell>
    </TableRow>
  );

  const renderMasterCard = (master: Master) => (
    <Card key={master.id} variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Box flex={1}>
              <Typography fontWeight={800}>{master.name}</Typography>
              {master.code && <Typography variant="body2" color="text.secondary">コード: {master.code}</Typography>}
              {master.note && <Typography variant="body2">{master.note}</Typography>}
            </Box>
            <Chip
              size="small"
              label={master.active ? '有効' : '無効'}
              color={master.active ? 'success' : 'default'}
              variant={master.active ? 'filled' : 'outlined'}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            {master.active && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditIcon />}
                onClick={() => handleOpenForm(master)}
                fullWidth
              >
                編集
              </Button>
            )}
            <Button
              variant="outlined"
              size="small"
              color={master.active ? 'error' : 'success'}
              startIcon={master.active ? <DeleteIcon /> : <RestoreIcon />}
              onClick={() => handleToggleActive(master.id, master.active)}
              fullWidth
            >
              {master.active ? '無効化' : '有効化'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>
            マスター登録
          </Typography>
          <Typography color="text.secondary">
            マスターデータを管理します
          </Typography>
        </Stack>
        <Button
          component={RouterLink}
          to="/settings"
          variant="outlined"
        >
          農場設定に戻る
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

      <Card>
        <CardContent sx={{ pb: 0 }}>
          <Tabs value={tab} onChange={(_, newTab) => { setTab(newTab); setKeyword(''); }}>
            <Tab label={masterCategoryLabels.sire} value="sire" />
            <Tab label={masterCategoryLabels.feed} value="feed" />
            <Tab label={masterCategoryLabels.medicine} value="medicine" />
            <Tab label={masterCategoryLabels.partner} value="partner" />
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>
              {masterCategoryLabels[tab]}を管理
            </Typography>

            <TextField
              label="検索"
              placeholder="名称・コード・備考で検索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              fullWidth
              size="small"
            />

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenForm()}
              fullWidth
            >
              新規登録
            </Button>

            {activeMasters.length === 0 && inactiveMasters.length === 0 ? (
              <Typography color="text.secondary">
                登録データがありません
              </Typography>
            ) : (
              <>
                {activeMasters.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                      有効なマスター（{activeMasters.length}件）
                    </Typography>
                    <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>名称</TableCell>
                            <TableCell>コード</TableCell>
                            <TableCell>備考</TableCell>
                            <TableCell sx={{ width: 90 }}>状態</TableCell>
                            <TableCell align="right" sx={{ width: 100 }}>操作</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {activeMasters.map(renderMasterRow)}
                        </TableBody>
                      </Table>
                    </Box>
                    <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
                      {activeMasters.map(renderMasterCard)}
                    </Stack>
                  </Box>
                )}

                {inactiveMasters.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>
                      無効なマスター（{inactiveMasters.length}件）
                    </Typography>
                    <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto', opacity: 0.6 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>名称</TableCell>
                            <TableCell>コード</TableCell>
                            <TableCell>備考</TableCell>
                            <TableCell sx={{ width: 90 }}>状態</TableCell>
                            <TableCell align="right" sx={{ width: 100 }}>操作</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {inactiveMasters.map(renderMasterRow)}
                        </TableBody>
                      </Table>
                    </Box>
                    <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
                      {inactiveMasters.map(renderMasterCard)}
                    </Stack>
                  </Box>
                )}
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={showForm} onClose={handleCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? '編集' : '新規登録'} - {masterCategoryLabels[tab]}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="名称 *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              autoFocus
            />
            <TextField
              label="コード"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              fullWidth
            />
            <TextField
              label="備考"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForm}>キャンセル</Button>
          <Button onClick={handleSave} variant="contained">
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
