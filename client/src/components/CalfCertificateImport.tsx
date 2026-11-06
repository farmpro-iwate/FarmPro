import { ChangeEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { CalfInput } from '../types/calf';
import { getStoredAuthUser } from '../services/authClient';
import { readCalfCertificate } from '../services/calfCertificateReader';
import {
  buildCalfCertificatePatch, normalizeCalfCertificateCandidate,
  type CalfCertificateCandidate,
} from '../utils/calfCertificateImport';

type Props = {
  onApply: (candidate: CalfCertificateCandidate) => void;
  currentInput: CalfInput;
  autoOpen?: boolean;
  disabled?: boolean;
  targetLabel?: string;
};
type Preview = { url: string; name: string; image: boolean };
type CandidateTextField = Exclude<keyof CalfCertificateCandidate, 'documentType' | 'sex' | 'notes'>;

const touchButton = { minHeight: 44 };
const fieldsGrid = {
  display: 'grid', gap: 1.5, minWidth: 0,
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
  '& .MuiFormControl-root': { minWidth: 0 },
  '& .MuiInputBase-root': { minHeight: 44 },
};
const ownerError = 'ログイン中の農場または利用者が変わりました。画面を開き直してください。';
const loginError = 'ログイン状態を確認してから、登録証明書を読み取ってください。';
const reflectedFields = [
  ['identificationNumber', '個体識別番号'], ['calfNumber', '耳標番号'], ['name', '名号'],
  ['birthday', '生年月日'], ['sex', '性別'], ['sireName', '父牛'], ['motherName', '血統上の母牛'],
] as const;

function ownerScope(): string | null {
  const user = getStoredAuthUser();
  return user?.farmId ? JSON.stringify([user.farmId, user.id || '']) : null;
}

function isMobileCaptureDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
    (/Macintosh/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
}

/** Supplies reviewed fields to the existing calf form; it never saves an animal. */
export function CalfCertificateImport({
  onApply, currentInput, autoOpen = false, disabled = false, targetLabel,
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [candidate, setCandidate] = useState<CalfCertificateCandidate | null>(null);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<number | undefined>();
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const openRef = useRef(false);
  const ownerRef = useRef(ownerScope());
  const requestRef = useRef(0);
  const readingRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  const candidateHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const revealCandidateRef = useRef(false);
  const disabledRef = useRef(disabled);
  const autoOpenedRef = useRef(false);
  openRef.current = open;
  disabledRef.current = disabled;

  const currentOwner = ownerScope();
  const sameOwner = Boolean(ownerRef.current && currentOwner === ownerRef.current);
  const inputKey = JSON.stringify(currentInput);
  const patchResult = useMemo(() => candidate
    ? buildCalfCertificatePatch(candidate, currentInput) : null, [candidate, currentInput]);
  const confirmationKey = JSON.stringify([candidate, inputKey, targetLabel || '', ownerRef.current, currentOwner]);
  const confirmed = confirmedFor !== null && confirmedFor === confirmationKey;
  const canApply = Boolean(candidate && patchResult?.patch && !patchResult.errors.length &&
    confirmed && sameOwner && !reading && !disabled);

  const releasePreview = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);
  const invalidateRead = useCallback(() => {
    requestRef.current += 1;
    readingRef.current = false;
    revealCandidateRef.current = false;
    setReading(false);
    setStatus('');
    setProgress(undefined);
  }, []);
  const resetDocument = useCallback(() => {
    invalidateRead();
    releasePreview();
    setFile(null);
    setPreview(null);
    setCandidate(null);
    setConfirmedFor(null);
  }, [invalidateRead, releasePreview]);

  const openDialog = useCallback(() => {
    if (disabledRef.current) return;
    invalidateRead();
    const owner = ownerScope();
    if (!ownerRef.current) ownerRef.current = owner;
    openRef.current = true;
    setOpen(true);
    setConfirmedFor(null);
    setError('');
    if (!owner || owner !== ownerRef.current) {
      resetDocument();
      setError(owner ? ownerError : loginError);
      return;
    }
    revealCandidateRef.current = true;
  }, [invalidateRead, resetDocument]);

  const closeDialog = () => {
    openRef.current = false;
    invalidateRead();
    setConfirmedFor(null);
    setOpen(false);
  };

  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current && !disabled) {
      autoOpenedRef.current = true;
      openDialog();
    }
  }, [autoOpen, disabled, openDialog]);
  useEffect(() => { setConfirmedFor(null); }, [inputKey, targetLabel, currentOwner]);
  useEffect(() => {
    if (ownerRef.current && currentOwner !== ownerRef.current) resetDocument();
  }, [currentOwner, resetDocument]);
  useEffect(() => {
    if (!open || !candidate || !revealCandidateRef.current) return;
    revealCandidateRef.current = false;
    candidateHeadingRef.current?.focus({ preventScroll: true });
    candidateHeadingRef.current?.scrollIntoView?.({ block: 'start' });
  }, [candidate, open]);
  useEffect(() => {
    if (!open || !error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView?.({ block: 'start' });
  }, [error, open]);
  useEffect(() => {
    if (!disabled) return;
    invalidateRead();
    setConfirmedFor(null);
  }, [disabled, invalidateRead]);
  useEffect(() => () => {
    openRef.current = false;
    requestRef.current += 1;
    releasePreview();
  }, [releasePreview]);

  function requireSameOwner() {
    if (ownerRef.current && ownerScope() === ownerRef.current) return true;
    resetDocument();
    setError(ownerError);
    return false;
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    event.target.value = '';
    if (!nextFile || disabledRef.current || !requireSameOwner()) return;
    resetDocument();
    setError('');
    const type = nextFile.type.toLowerCase();
    const untyped = !type || type === 'application/octet-stream';
    const pdf = type === 'application/pdf' || (untyped && /\.pdf$/i.test(nextFile.name));
    const image = /^image\/(?:jpeg|png|webp|heic|heif)$/.test(type) ||
      (untyped && /\.(?:jpe?g|png|webp|heic|heif)$/i.test(nextFile.name));
    if ((!pdf && !image) || (image && /\.pdf$/i.test(nextFile.name))) {
      setError('登録証明書の画像またはPDFファイルを選んでください。');
      return;
    }
    if (!nextFile.size || nextFile.size > 10 * 1024 * 1024) {
      setError('空ではない10MB以下の画像またはPDFを選んでください。');
      return;
    }
    try {
      const url = URL.createObjectURL(nextFile);
      objectUrlRef.current = url;
      setPreview({ url, name: nextFile.name, image });
      setFile(nextFile);
    } catch {
      setError('ファイルを表示できませんでした。選び直してください。');
    }
  }

  async function readDocument() {
    if (!file || readingRef.current || disabledRef.current || !requireSameOwner()) return;
    const request = ++requestRef.current;
    const currentRequest = () => openRef.current && request === requestRef.current && !disabledRef.current;
    readingRef.current = true;
    setReading(true);
    setCandidate(null);
    setConfirmedFor(null);
    setError('');
    setProgress(undefined);
    setStatus('登録証明書を読み取っています…');
    try {
      const result = await readCalfCertificate(file, {
        onProgress: (next) => {
          if (!currentRequest() || ownerScope() !== ownerRef.current) return;
          setStatus(next.status);
          setProgress(typeof next.progress === 'number' && Number.isFinite(next.progress)
            ? Math.min(100, Math.max(0, next.progress)) : undefined);
        },
      });
      if (!currentRequest() || !requireSameOwner()) return;
      const next = normalizeCalfCertificateCandidate(result);
      revealCandidateRef.current = true;
      setCandidate(next);
      setConfirmedFor(null);
      setStatus('読み取り候補を作成しました。証明書と見比べて確認してください。');
      setProgress(100);
    } catch (caught) {
      if (!currentRequest() || !requireSameOwner()) return;
      setError(caught instanceof Error ? caught.message : '登録証明書を読み取れませんでした。');
    } finally {
      if (currentRequest()) {
        readingRef.current = false;
        setReading(false);
      }
    }
  }

  function editCandidate<K extends CandidateTextField | 'sex'>(field: K, value: CalfCertificateCandidate[K]) {
    setConfirmedFor(null);
    setError('');
    setCandidate(previous => previous ? { ...previous, [field]: value } : previous);
  }

  function applyCandidate() {
    if (!candidate || !confirmed || !openRef.current || readingRef.current ||
        disabledRef.current || !requireSameOwner()) return;
    try {
      const next = normalizeCalfCertificateCandidate(candidate);
      const check = buildCalfCertificatePatch(next, currentInput);
      if (!check.patch || check.errors.length) {
        setConfirmedFor(null);
        setError(check.errors.join(' / ') || '読み取り内容を確認してください。');
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
  const textField = (field: CandidateTextField, label: string, options: { date?: boolean; numeric?: boolean; helperText?: string } = {}) => (
    <TextField key={field} label={label} value={candidate?.[field] || ''} fullWidth size="small" disabled={locked}
      type={options.date ? 'date' : 'text'} InputLabelProps={options.date ? { shrink: true } : undefined}
      inputProps={options.numeric ? { inputMode: 'numeric' } : undefined} helperText={options.helperText}
      onChange={event => editCandidate(field, event.target.value)} />
  );
  const changedFields = reflectedFields.filter(([key]) => patchResult?.patch?.[key] !== undefined &&
    patchResult.patch[key] !== currentInput[key]);
  const changedNote = patchResult?.patch?.note !== undefined && patchResult.patch.note !== currentInput.note;

  return <>
    <Button type="button" variant="outlined" onClick={openDialog} disabled={disabled} sx={touchButton}>登録証明書から入力</Button>
    <Dialog open={open} onClose={closeDialog} aria-labelledby={titleId} fullWidth maxWidth="lg"
      PaperProps={{ sx: { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 64px)' }, maxHeight: 'calc(100% - 32px)' } }}>
      <DialogTitle id={titleId} fontWeight={800}>登録証明書から入力</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, minWidth: 0, overflowX: 'hidden', overflowWrap: 'anywhere' }}>
        <Stack spacing={2.5}>
          {targetLabel && <Typography fontWeight={800}>対象：{targetLabel}</Typography>}
          <Typography>1頭分の子牛登録証明書を読み取り、内容を確認して子牛の入力欄に反映します。</Typography>
          {error && <Alert severity="error" ref={errorRef} tabIndex={-1}>{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {isMobileCaptureDevice() && <Button component="label" variant="contained" disabled={disabled} sx={touchButton}>
              写真を撮る
              <input hidden type="file" accept="image/*" capture="environment" disabled={disabled} aria-label="登録証明書を撮影" onChange={chooseFile} />
            </Button>}
            <Button component="label" variant="outlined" disabled={disabled} sx={touchButton}>
              画像・PDFを選ぶ
              <input hidden type="file" accept="image/*,.pdf,application/pdf" disabled={disabled} aria-label="登録証明書の画像・PDF" onChange={chooseFile} />
            </Button>
          </Stack>
          {preview && <Stack spacing={1}>
            <Typography variant="body2">{preview.name}</Typography>
            {preview.image
              ? <Box component="img" src={preview.url} alt="選択した登録証明書" sx={{ width: '100%', maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 1 }} />
              : <Button component="a" href={preview.url} target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ ...touchButton, alignSelf: 'flex-start' }}>PDFを開いて確認</Button>}
            <Button type="button" variant="contained" onClick={readDocument} disabled={reading || disabled || !sameOwner} sx={touchButton}>{reading ? '読み取り中…' : '読み取る'}</Button>
          </Stack>}
          {reading && <LinearProgress aria-label="登録証明書を読み取り中" variant={progress === undefined ? 'indeterminate' : 'determinate'} value={progress} />}
          {status && <Typography variant="body2" role="status">{status}</Typography>}
          {candidate && <>
            <Typography component="h3" variant="h6" fontWeight={800} ref={candidateHeadingRef}
              tabIndex={-1} sx={{ scrollMarginTop: 8 }}>読み取り内容を確認</Typography>
            {candidate.documentType !== 'calf-registration-certificate' && <Alert severity="error">子牛登録証明書として確認できませんでした。登録証明書の写真・PDFを選び直してください。</Alert>}
            {candidate.notes.length > 0 && <Alert severity="warning"><Stack spacing={0.5}>
              {candidate.notes.map((note, index) => <Typography key={index} variant="body2">{note}</Typography>)}
            </Stack></Alert>}
            <Box sx={fieldsGrid}>
              {textField('identificationNumber', '個体識別番号（10桁）', { numeric: true })}
              {textField('earTag', '耳標番号', { helperText: '農場で使用する番号。個体識別番号とは別項目です' })}
              {textField('name', '名号')}
              {textField('birthday', '生年月日', { date: true })}
              <TextField select label="性別" value={candidate.sex} size="small" fullWidth disabled={locked}
                SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
                onChange={event => editCandidate('sex', event.target.value as CalfCertificateCandidate['sex'])}>
                <MenuItem value="">確認してください</MenuItem><MenuItem value="雌">雌</MenuItem>
                <MenuItem value="雄">雄</MenuItem><MenuItem value="去勢">去勢</MenuItem>
              </TextField>
              {textField('sire', '父牛')}
              {textField('dam', '血統上の母牛', { helperText: '代理母・受卵牛とは分けて確認します' })}
            </Box>
            <Accordion disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>登録番号・血統の補助情報</Typography></AccordionSummary>
              <AccordionDetails><Box sx={fieldsGrid}>
                {textField('registrationNumber', '登録番号')}
                {textField('maternalSire', '母の父')}
                {textField('maternalGrandSire', '祖母の父')}
              </Box></AccordionDetails>
            </Accordion>
            {patchResult?.warnings.length ? <Alert severity="warning"><Stack spacing={0.5}>
              {patchResult.warnings.map(message => <Typography variant="body2" key={message}>{message}</Typography>)}
            </Stack></Alert> : null}
            {patchResult?.patch && <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1 }}>
              <Stack spacing={1.5}>
                <Typography fontWeight={800}>入力欄に反映する内容</Typography>
                {changedFields.length > 0 && <Box sx={fieldsGrid}>
                  {changedFields.map(([key, label]) => <Typography key={key} variant="body2">{label}：{String(patchResult.patch?.[key] ?? '')}</Typography>)}
                </Box>}
                {changedNote && <TextField label="反映後の備考" value={patchResult.patch.note || ''} multiline minRows={2} maxRows={5}
                  fullWidth size="small" InputProps={{ readOnly: true }} />}
                {!changedFields.length && !changedNote && <Typography variant="body2">入力欄と同じ内容です。</Typography>}
              </Stack>
            </Box>}
            {patchResult?.errors.length ? <Alert severity="error"><Stack spacing={0.5}>
              {patchResult.errors.map(message => <Typography variant="body2" key={message}>{message}</Typography>)}
            </Stack></Alert> : null}
            <Typography variant="body2" color="text.secondary">空欄の項目は入力済みの情報を残します。反映後、子牛の登録・編集画面で保存してください。</Typography>
            <FormControlLabel sx={{ minHeight: 44, alignItems: 'center', mr: 0 }} control={
              <Checkbox checked={confirmed} disabled={locked || !sameOwner}
                onChange={event => { if (requireSameOwner()) setConfirmedFor(event.target.checked ? confirmationKey : null); }} />
            } label="この子牛の証明書であることと、読み取り内容を確認しました" />
          </>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, '& > :not(style) ~ :not(style)': { ml: 0 }, '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, minHeight: 44 } }}>
        <Button type="button" variant="outlined" onClick={closeDialog}>閉じる</Button>
        <Button type="button" variant="contained" onClick={applyCandidate} disabled={!canApply}>入力欄に反映</Button>
      </DialogActions>
    </Dialog>
  </>;
}
