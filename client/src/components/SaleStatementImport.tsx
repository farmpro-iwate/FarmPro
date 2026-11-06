import { ChangeEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getStoredAuthUser } from '../services/authClient';
import { readSaleStatementDocument } from '../services/saleStatementDocumentReader';
import {
  getSaleStatementTargetErrors, normalizeSaleStatementCandidate,
  validateSaleStatementCandidate, type SaleStatementCandidate,
} from '../utils/saleStatementImport';

type Target = {
  targetNumber: string; targetName?: string; salePrice?: string;
  identificationNumber?: string; saleDate?: string;
};
type Props = {
  target: Target;
  onApply: (candidate: SaleStatementCandidate) => void;
  initialCandidate?: SaleStatementCandidate;
  autoOpen?: boolean;
  disabled?: boolean;
  applyLabel?: string;
  buttonLabel?: string;
};
type TextFieldKey = Exclude<keyof SaleStatementCandidate, 'deductions' | 'adjustments' | 'notes'>;
type LineKind = 'deductions' | 'adjustments';
type Preview = { url: string; name: string; image: boolean };

const touchButton = { minHeight: 44 };
const fieldsGrid = {
  display: 'grid', gap: 1.5, minWidth: 0,
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
  '& .MuiFormControl-root': { minWidth: 0 },
  '& .MuiInputBase-root': { minHeight: 44 },
};
const farmError = 'ログイン中の農場が変わりました。画面を閉じて開き直してください。';
const yen = (value: number | null) => value === null ? '未確認' : value.toLocaleString('ja-JP') + '円';

// Keep camera availability consistent with the existing animal document import.
function isMobileCaptureDevice() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
}

export function SaleStatementImport({
  target, onApply, initialCandidate, autoOpen = false, disabled = false,
  applyLabel = '入力欄に反映', buttonLabel = '精算書から入力',
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [candidate, setCandidate] = useState<SaleStatementCandidate | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<number | undefined>();
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const openRef = useRef(false);
  const farmRef = useRef('');
  const requestRef = useRef(0);
  const readingRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  const candidateHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const revealCandidateRef = useRef(false);
  const disabledRef = useRef(disabled);
  const autoOpenedRef = useRef(false);
  openRef.current = open;
  disabledRef.current = disabled;

  const targetKey = JSON.stringify([
    target.targetNumber, target.targetName || '', target.identificationNumber || '',
    target.salePrice ?? null, target.saleDate || '',
  ]);
  const confirmationKey = JSON.stringify([candidate, targetKey, farmRef.current]);
  const confirmed = confirmedFor !== null && confirmedFor === confirmationKey;
  const validation = useMemo(() => candidate ? validateSaleStatementCandidate(candidate) : null, [candidate]);
  const targetErrors = candidate ? getSaleStatementTargetErrors(candidate, target) : [];
  const hasTarget = Boolean(target.targetNumber.trim() || target.targetName?.trim());
  const errors = [...new Set([...(validation?.errors || []), ...targetErrors])];
  const sameFarm = Boolean(farmRef.current && getStoredAuthUser()?.farmId === farmRef.current);
  const canApply = Boolean(candidate && confirmed && hasTarget && sameFarm && !errors.length && !reading && !disabled);

  const releasePreview = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const resetFile = useCallback(() => {
    requestRef.current += 1;
    readingRef.current = false;
    revealCandidateRef.current = false;
    releasePreview();
    setFile(null);
    setPreview(null);
    setReading(false);
    setStatus('');
    setProgress(undefined);
  }, [releasePreview]);

  const openDialog = useCallback(() => {
    if (disabledRef.current) return;
    resetFile();
    farmRef.current = getStoredAuthUser()?.farmId || '';
    openRef.current = true;
    setOpen(true);
    setConfirmedFor(null);
    setError('');
    try {
      setCandidate(initialCandidate ? normalizeSaleStatementCandidate(initialCandidate) : null);
    } catch (caught) {
      setCandidate(null);
      setError(caught instanceof Error ? caught.message : '読み取り候補を確認できませんでした。');
    }
    if (!farmRef.current) setError('ログイン状態を確認してから、精算書を読み取ってください。');
  }, [initialCandidate, resetFile]);

  const closeDialog = () => {
    openRef.current = false;
    resetFile();
    setConfirmedFor(null);
    setOpen(false);
  };

  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current && !disabled) {
      autoOpenedRef.current = true;
      openDialog();
    }
  }, [autoOpen, disabled, openDialog]);

  useEffect(() => { setConfirmedFor(null); }, [targetKey]);
  useEffect(() => {
    if (!open || !candidate || !revealCandidateRef.current) return;
    revealCandidateRef.current = false;
    candidateHeadingRef.current?.focus({ preventScroll: true });
    candidateHeadingRef.current?.scrollIntoView?.({ block: 'start' });
  }, [candidate, open]);
  useEffect(() => {
    if (!disabled) return;
    requestRef.current += 1;
    readingRef.current = false;
    setReading(false);
    setConfirmedFor(null);
  }, [disabled]);
  useEffect(() => () => {
    openRef.current = false;
    requestRef.current += 1;
    releasePreview();
  }, [releasePreview]);

  function requireSameFarm() {
    if (farmRef.current && getStoredAuthUser()?.farmId === farmRef.current) return true;
    setConfirmedFor(null);
    setError(farmError);
    return false;
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    event.target.value = '';
    if (!nextFile || disabledRef.current || !requireSameFarm()) return;
    requestRef.current += 1;
    readingRef.current = false;
    setReading(false);
    setConfirmedFor(null);
    setStatus('');
    setProgress(undefined);
    const type = nextFile.type.toLowerCase();
    const untyped = !type || type === 'application/octet-stream';
    const pdf = type === 'application/pdf' || (untyped && /\.pdf$/i.test(nextFile.name));
    const image = /^image\/(?:jpeg|png|webp|heic|heif)$/.test(type)
      || (untyped && /\.(?:jpe?g|png|webp|heic|heif)$/i.test(nextFile.name));
    if ((!pdf && !image) || (image && /\.pdf$/i.test(nextFile.name))) {
      setError('販売精算書の画像またはPDFファイルを選んでください。');
      return;
    }
    try {
      const url = URL.createObjectURL(nextFile);
      resetFile();
      objectUrlRef.current = url;
      setPreview({ url, name: nextFile.name, image });
      setFile(nextFile);
      setCandidate(null);
      setConfirmedFor(null);
      setError('');
    } catch {
      setError('ファイルを表示できませんでした。選び直してください。');
    }
  }

  async function readDocument() {
    if (!file || readingRef.current || disabledRef.current || !requireSameFarm()) return;
    const request = ++requestRef.current;
    const currentRequest = () => openRef.current && request === requestRef.current && !disabledRef.current;
    readingRef.current = true;
    setReading(true);
    setConfirmedFor(null);
    setError('');
    setProgress(undefined);
    setStatus('精算書を読み取っています…');
    try {
      const result = await readSaleStatementDocument(file, {
        onProgress: (next) => {
          if (!currentRequest() || getStoredAuthUser()?.farmId !== farmRef.current) return;
          setStatus(next.status);
          setProgress(typeof next.progress === 'number' && Number.isFinite(next.progress)
            ? Math.min(100, Math.max(0, next.progress)) : undefined);
        },
      });
      if (!currentRequest() || !requireSameFarm()) return;
      revealCandidateRef.current = true;
      setCandidate(normalizeSaleStatementCandidate(result));
      setConfirmedFor(null);
      setStatus('読み取り候補を作成しました。内容を確認してください。');
      setProgress(100);
    } catch (caught) {
      if (!currentRequest() || !requireSameFarm()) return;
      setError(caught instanceof Error ? caught.message : '精算書を読み取れませんでした。');
    } finally {
      if (currentRequest()) {
        readingRef.current = false;
        setReading(false);
      }
    }
  }

  function editField(field: TextFieldKey, value: string) {
    setConfirmedFor(null);
    setCandidate((previous) => previous ? { ...previous, [field]: value } : previous);
  }
  function editLine(kind: LineKind, index: number, update: { label?: string; amountYen?: string }) {
    setConfirmedFor(null);
    setCandidate((previous) => previous ? {
      ...previous, [kind]: previous[kind].map((line, i) => i === index ? { ...line, ...update } : line),
    } : previous);
  }
  function addLine(kind: LineKind) {
    setConfirmedFor(null);
    setCandidate((previous) => previous ? {
      ...previous, [kind]: [...previous[kind], { label: '', amountYen: '' }],
    } : previous);
  }
  function removeLine(kind: LineKind, index: number) {
    setConfirmedFor(null);
    setCandidate((previous) => previous ? {
      ...previous, [kind]: previous[kind].filter((_line, i) => i !== index),
    } : previous);
  }
  function applyCandidate() {
    if (!candidate || !confirmed || !openRef.current || readingRef.current || disabledRef.current || !requireSameFarm()) return;
    try {
      const next = normalizeSaleStatementCandidate(candidate);
      const currentErrors = [...validateSaleStatementCandidate(next).errors, ...getSaleStatementTargetErrors(next, target)];
      if (!hasTarget || currentErrors.length) {
        setConfirmedFor(null);
        setError(currentErrors.join(' ') || '対象の牛を選んでください。');
        return;
      }
      onApply(next);
      closeDialog();
    } catch (caught) {
      setConfirmedFor(null);
      setError(caught instanceof Error ? caught.message : '入力欄へ反映できませんでした。内容を確認してください。');
    }
  }

  const locked = reading || disabled;
  const textField = (field: TextFieldKey, label: string, options: { date?: boolean; numeric?: boolean } = {}) => (
    <TextField key={field} label={label} value={candidate?.[field] || ''}
      onChange={(event) => editField(field, event.target.value)} fullWidth size="small" disabled={locked}
      type={options.date ? 'date' : 'text'} InputLabelProps={options.date ? { shrink: true } : undefined}
      inputProps={options.numeric ? { inputMode: 'decimal' } : undefined} />
  );
  const lines = (kind: LineKind, heading: string, singular: string) => (
    <Stack spacing={1.25}>
      <Typography fontWeight={800}>{heading}</Typography>
      {kind === 'adjustments' && <Typography variant="body2" color="text.secondary">返金などの加算は＋、支払額から差し引く調整は－で入力します。</Typography>}
      {candidate?.[kind].map((line, index) => (
        <Box key={index} sx={{ ...fieldsGrid, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(0, 1fr) auto' }, border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <TextField label={singular + (index + 1) + 'の名称'} value={line.label} fullWidth size="small" disabled={locked}
            onChange={(event) => editLine(kind, index, { label: event.target.value })} />
          <TextField label={singular + (index + 1) + 'の金額（円）'} value={line.amountYen} fullWidth size="small" disabled={locked}
            inputProps={{ inputMode: 'decimal' }} onChange={(event) => editLine(kind, index, { amountYen: event.target.value })} />
          <Button type="button" variant="outlined" disabled={locked} sx={touchButton}
            aria-label={singular + (index + 1) + 'を削除'} onClick={() => removeLine(kind, index)}>削除</Button>
        </Box>
      ))}
      <Button type="button" variant="outlined" onClick={() => addLine(kind)}
        disabled={locked || (candidate ? candidate.deductions.length + candidate.adjustments.length >= 100 : true)}
        sx={{ ...touchButton, alignSelf: { xs: 'stretch', md: 'flex-start' } }}>{singular}を追加</Button>
    </Stack>
  );

  return <>
    <Button type="button" variant="outlined" onClick={openDialog} disabled={disabled} sx={touchButton}>{buttonLabel}</Button>
    <Dialog open={open} onClose={closeDialog} aria-labelledby={titleId} fullWidth maxWidth="lg"
      PaperProps={{ sx: { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 64px)' }, maxHeight: 'calc(100% - 32px)' } }}>
      <DialogTitle id={titleId} fontWeight={800}>販売精算書から入力</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, minWidth: 0, overflowX: 'hidden', overflowWrap: 'anywhere' }}>
        <Stack spacing={2.5}>
          <Typography>1頭分の精算書を読み取り、内容を確認して入力欄へ反映します。反映後、登録画面で保存します。</Typography>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            <Typography fontWeight={800}>選択中の牛</Typography>
            <Typography>{target.targetName || '名号未入力'} ／ {target.targetNumber || '番号未入力'}</Typography>
            {target.identificationNumber && <Typography variant="body2">個体識別番号：{target.identificationNumber}</Typography>}
            {target.salePrice !== undefined && <Typography variant="body2">登録済み販売金額：{target.salePrice || '未入力'}円</Typography>}
            {target.saleDate && <Typography variant="body2">登録済み販売日：{target.saleDate}</Typography>}
          </Box>
          {!hasTarget && <Alert severity="info">反映する前に、出荷・販売画面で対象の牛を選んでください。</Alert>}
          {disabled && <Alert severity="info">この販売記録には、現在読み取り内容を反映できません。</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {isMobileCaptureDevice() && <Button component="label" variant="contained" disabled={disabled} sx={touchButton}>
              写真を撮る
              <input hidden type="file" accept="image/*" capture="environment" disabled={disabled} aria-label="精算書を撮影" onChange={chooseFile} />
            </Button>}
            <Button component="label" variant="outlined" disabled={disabled} sx={touchButton}>
              画像・PDFを選ぶ
              <input hidden type="file" accept="image/*,.pdf,application/pdf" disabled={disabled} aria-label="精算書の画像・PDF" onChange={chooseFile} />
            </Button>
          </Stack>
          {preview && <Stack spacing={1}>
            <Typography variant="body2">{preview.name}</Typography>
            {preview.image
              ? <Box component="img" src={preview.url} alt="選択した販売精算書" sx={{ width: '100%', maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 1 }} />
              : <Button component="a" href={preview.url} target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ ...touchButton, alignSelf: 'flex-start' }}>PDFを開いて確認</Button>}
            <Button type="button" variant="contained" onClick={readDocument} disabled={reading || disabled || !sameFarm} sx={touchButton}>{reading ? '読み取り中…' : '読み取る'}</Button>
          </Stack>}
          {reading && <LinearProgress aria-label="精算書を読み取り中" variant={progress === undefined ? 'indeterminate' : 'determinate'} value={progress} />}
          {status && <Typography variant="body2" role="status">{status}</Typography>}
          {candidate && <>
            <Typography component="h3" variant="h6" fontWeight={800} ref={candidateHeadingRef}
              tabIndex={-1} sx={{ scrollMarginTop: 8 }}>読み取り内容を確認</Typography>
            {candidate.notes.length > 0 && <Alert severity="warning"><Stack spacing={0.5}>{candidate.notes.map((note, index) => <Typography key={index} variant="body2">{note}</Typography>)}</Stack></Alert>}
            <Box sx={fieldsGrid}>
              <TextField select label="書類の種類" value={candidate.documentType} size="small" fullWidth disabled={locked}
                onChange={(event) => editField('documentType', event.target.value)}>
                <MenuItem value="unknown">未確認</MenuItem><MenuItem value="sale-settlement">販売精算書</MenuItem><MenuItem value="other">その他の書類</MenuItem>
              </TextField>
              {textField('animalCount', '頭数', { numeric: true })}
              {textField('statementNumber', '精算番号')}
              {textField('identificationNumber', '書類の個体識別番号（10桁）')}
              {textField('earTag', '書類の耳標番号')}
              {textField('animalName', '書類の名号')}
              {textField('saleDate', '販売日（市場日）', { date: true })}
              {textField('paymentDate', '精算日', { date: true })}
              {textField('marketName', '市場名')}
              {textField('issuerName', '精算元・発行元')}
            </Box>
            <Accordion disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>補助情報・読み取りメモ</Typography></AccordionSummary>
              <AccordionDetails><Box sx={fieldsGrid}>
                {textField('birthday', '生年月日', { date: true })}
                <TextField select label="性別" value={candidate.sex} size="small" fullWidth disabled={locked}
                  onChange={(event) => editField('sex', event.target.value)}>
                  <MenuItem value="">未確認</MenuItem><MenuItem value="雌">雌</MenuItem><MenuItem value="雄">雄</MenuItem><MenuItem value="去勢">去勢</MenuItem>
                </TextField>
                {textField('saleWeightKg', '販売体重（kg）', { numeric: true })}
                <TextField label="読み取りメモ" value={candidate.notes.join('\n')} multiline minRows={2} fullWidth disabled={locked}
                  sx={{ gridColumn: { md: '1 / -1' } }} onChange={(event) => {
                    setConfirmedFor(null);
                    const value = event.target.value;
                    setCandidate((previous) => previous ? { ...previous, notes: value ? value.split('\n') : [] } : previous);
                  }} />
              </Box></AccordionDetails>
            </Accordion>
            <Box sx={fieldsGrid}>
              {textField('grossYen', '販売金額（税込・円）', { numeric: true })}
              {textField('deductionTotalYen', '書類の控除合計（円）', { numeric: true })}
              {textField('netYen', '差引精算額（円）', { numeric: true })}
            </Box>
            <Typography variant="body2" color="text.secondary">内消費税・税率別の集計・控除合計は、下の明細へ重ねて入れないでください。</Typography>
            {lines('deductions', '控除明細', '控除')}
            {lines('adjustments', '加算・減算の調整', '調整')}
            {validation && <Box sx={fieldsGrid}>
              <Typography>控除明細計：{yen(validation.deductionsYen)}</Typography>
              <Typography>調整額計：{yen(validation.adjustmentYen)}</Typography>
              <Typography fontWeight={800}>計算した差引：{yen(validation.calculatedNetYen)}</Typography>
            </Box>}
            {errors.length > 0 && <Alert severity="error"><Stack spacing={0.5}>
              {errors.map((message) => <Typography variant="body2" key={message}>{message}</Typography>)}
            </Stack></Alert>}
            <FormControlLabel sx={{ minHeight: 44, alignItems: 'center', mr: 0 }} control={
              <Checkbox checked={confirmed} disabled={locked || !sameFarm}
                onChange={(event) => setConfirmedFor(event.target.checked ? confirmationKey : null)} />
            } label="対象の牛と読み取り内容を確認しました" />
            <Typography variant="body2" color="text.secondary">反映すると入力欄の内容を置き換えます。登録済み経費との紐付けは反映後に確認してください。</Typography>
          </>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, '& > :not(style) ~ :not(style)': { ml: 0 }, '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, minHeight: 44 } }}>
        <Button type="button" variant="outlined" onClick={closeDialog}>閉じる</Button>
        <Button type="button" variant="contained" onClick={applyCandidate} disabled={!canApply}>{applyLabel}</Button>
      </DialogActions>
    </Dialog>
  </>;
}
