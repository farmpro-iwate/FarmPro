import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CattlePicker } from '../components/CattlePicker';
import { createSynchronizationProgramSchedules } from '../services/scheduleApi';
import {
  deleteSynchronizationTemplate,
  getSynchronizationTemplates,
  saveSynchronizationTemplate,
} from '../services/synchronizationTemplateApi';
import type {
  SynchronizationProgramStep,
  SynchronizationProgramTemplate,
  SynchronizationPurpose,
} from '../types/schedule';

const purposeOptions: SynchronizationPurpose[] = ['発情同期化', '排卵同期化', '定時人工授精', 'ET向け'];

const defaultSteps: SynchronizationProgramStep[] = [
  { dayOffset: 0, title: '繁殖処置' },
  { dayOffset: 7, title: '繁殖処置' },
  { dayOffset: 9, title: '排卵誘起処置' },
];

function addCalendarDays(dateText: string, days: number): string {
  if (!dateText) return '';
  const [year, month, day] = dateText.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function SynchronizationProgramForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTargetNumber = searchParams.get('targetNumber') || '';
  const initialTargetName = searchParams.get('targetName') || '';
  const returnTo = searchParams.get('returnTo') || '/schedules';

  const [targetNumber, setTargetNumber] = useState(initialTargetNumber);
  const [targetName, setTargetName] = useState(initialTargetName);
  const [programName, setProgramName] = useState('');
  const [purpose, setPurpose] = useState<SynchronizationPurpose>('発情同期化');
  const [startDate, setStartDate] = useState('');
  const [steps, setSteps] = useState<SynchronizationProgramStep[]>(defaultSteps);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<SynchronizationProgramTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);

  const loadTemplates = async () => {
    setTemplates(await getSynchronizationTemplates());
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const preview = useMemo(
    () => steps.map((step) => ({ ...step, dueDate: addCalendarDays(startDate, step.dayOffset) })),
    [steps, startDate],
  );

  const updateStep = (index: number, patch: Partial<SynchronizationProgramStep>) => {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  };

  const addStep = () => {
    const lastOffset = steps.length ? steps[steps.length - 1].dayOffset : 0;
    setSteps((current) => [...current, { dayOffset: lastOffset + 1, title: '繁殖処置' }]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  };

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setPurpose(template.purpose);
    setSteps(template.steps.map((step) => ({ ...step })));
    setTemplateName(template.templateName);
    if (!programName.trim()) setProgramName(template.templateName);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return alert('テンプレート名を入力してください');
    if (!steps.length || steps.some((step) => !step.title.trim() || step.dayOffset < 0)) {
      return alert('処置予定の日数と内容を確認してください');
    }

    setTemplateBusy(true);
    try {
      const saved = await saveSynchronizationTemplate({
        id: selectedTemplateId || undefined,
        templateName: templateName.trim(),
        purpose,
        steps,
      });
      await loadTemplates();
      setSelectedTemplateId(saved.id);
      alert('同期化テンプレートを保存しました');
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) return;
    if (!window.confirm(`「${template.templateName}」を削除しますか？`)) return;

    setTemplateBusy(true);
    try {
      await deleteSynchronizationTemplate(selectedTemplateId);
      setSelectedTemplateId('');
      setTemplateName('');
      await loadTemplates();
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!targetNumber || !targetName) return alert('対象牛を選択してください');
    if (!programName.trim()) return alert('プログラム名を入力してください');
    if (!startDate) return alert('開始日を入力してください');
    if (!steps.length || steps.some((step) => !step.title.trim() || step.dayOffset < 0)) {
      return alert('処置予定の日数と内容を確認してください');
    }

    setSaving(true);
    try {
      await createSynchronizationProgramSchedules({
        programName: programName.trim(),
        purpose,
        startDate,
        targetNumber,
        targetName,
        steps,
      });
      navigate(returnTo);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="h5" fontWeight={800}>同期化を開始</Typography>
      <Alert severity="info">
        発情同期化・排卵同期化などの予定をまとめて作ります。薬剤や実際の処置内容は、実施時に繁殖治療として記録します。
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Typography variant="h6" fontWeight={800}>農場の同期化テンプレート</Typography>
            <Typography color="text.secondary">
              よく使う手順を保存すると、次回は牛と開始日を決めるだけで予定を作れます。
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12} sm={7}>
                <TextField
                  label="保存済みテンプレート"
                  select
                  value={selectedTemplateId}
                  onChange={(event) => applyTemplate(event.target.value)}
                  fullWidth
                >
                  <MenuItem value="">新しく作る</MenuItem>
                  {templates.map((template) => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.templateName}（{template.purpose}）
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField
                  label="テンプレート名"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="例：うちの定時AI①"
                  fullWidth
                />
              </Grid>
            </Grid>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="outlined" onClick={handleSaveTemplate} disabled={templateBusy} fullWidth>
                {selectedTemplateId ? 'テンプレートを上書き保存' : 'この手順をテンプレート保存'}
              </Button>
              {selectedTemplateId && (
                <Button color="error" variant="outlined" onClick={handleDeleteTemplate} disabled={templateBusy} fullWidth>
                  テンプレートを削除
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <CattlePicker
              label="対象牛を選択"
              onSelect={(cattle) => {
                setTargetNumber(cattle.earTag);
                setTargetName(cattle.name);
              }}
            />

            {targetNumber && (
              <Alert severity="success">対象牛：{targetName}（耳標 {targetNumber}）</Alert>
            )}

            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={5}>
                <TextField
                  label="今回のプログラム名"
                  value={programName}
                  onChange={(event) => setProgramName(event.target.value)}
                  placeholder="例：9月AI群"
                  required
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="目的"
                  select
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value as SynchronizationPurpose)}
                  fullWidth
                >
                  {purposeOptions.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="開始日"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  required
                  fullWidth
                />
              </Grid>
            </Grid>

            <Typography variant="h6" fontWeight={800}>処置予定</Typography>
            <Stack spacing={1}>
              {preview.map((step, index) => (
                <Card key={`${index}-${step.dayOffset}`} variant="outlined">
                  <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid item xs={4} sm={2}>
                        <TextField
                          label="何日後"
                          type="number"
                          value={step.dayOffset}
                          onChange={(event) => updateStep(index, { dayOffset: Math.max(0, Number(event.target.value) || 0) })}
                          inputProps={{ min: 0 }}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={8} sm={5}>
                        <TextField
                          label="予定内容"
                          value={step.title}
                          onChange={(event) => updateStep(index, { title: event.target.value })}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={8} sm={3}>
                        <Typography color="text.secondary">
                          {step.dueDate ? `予定日：${step.dueDate}` : '開始日を選択すると予定日を表示'}
                        </Typography>
                      </Grid>
                      <Grid item xs={4} sm={2}>
                        <Button variant="text" onClick={() => removeStep(index)} disabled={steps.length <= 1} fullWidth>
                          削除
                        </Button>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              ))}
            </Stack>

            <Button variant="outlined" onClick={addStep}>処置予定を追加</Button>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving} fullWidth>
                {saving ? '登録中...' : 'この同期化を開始'}
              </Button>
              <Button variant="outlined" size="large" onClick={() => navigate(returnTo)} fullWidth>
                戻る
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
