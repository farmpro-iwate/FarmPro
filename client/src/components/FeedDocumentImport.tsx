import { ChangeEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { getStoredAuthUser } from '../services/authClient';
import { readFeedDocument } from '../services/feedDocumentReader';
import {
  normalizeFeedDocumentCandidate, validateFeedDocumentLine,
  type FeedDocumentCandidate, type FeedDocumentLine, type FeedDocumentSelection,
} from '../utils/feedDocumentImport';

type Props = {
  onApply: (selection: FeedDocumentSelection) => void;
  initialSelection?: FeedDocumentSelection;
  completedLineIndexes?: number[];
  autoOpen?: boolean;
  disabled?: boolean;
  buttonLabel?: string;
};
type Preview = { url: string; name: string; image: boolean };
type DocumentTextField = 'documentNumber' | 'issueDate' | 'deliveryDate' | 'supplier';
type LineTextField = 'feedName' | 'deliveryDate' | 'quantity' | 'originalUnit' |
  'bagWeightKg' | 'unitPriceYen' | 'grossYen' | 'netYen' | 'taxYen';

const touchButton = { minHeight: 44 };
const fieldsGrid = {
  display: 'grid', gap: 1.5, minWidth: 0,
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
  '& .MuiFormControl-root': { minWidth: 0 },
  '& .MuiInputBase-root': { minHeight: 44 },
};
const units: FeedDocumentLine['unit'][] = ['', 'kg', '袋', 'ロール', '束', '個', 'その他'];
const ownerError = 'ログイン中の農場または利用者が変わりました。画面を開き直してください。';
const loginError = 'ログイン状態を確認してから、納品書・請求書を読み取ってください。';
const yen = (value?: string) => !value ? '未入力' : `${Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 6 })}円`;

function ownerScope(): string | null {
  const user = getStoredAuthUser();
  return user?.farmId ? JSON.stringify([user.farmId, user.id || '']) : null;
}
function newSessionId() {
  return globalThis.crypto?.randomUUID?.() || `feed-document-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function isMobileCaptureDevice() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
    (/Macintosh/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
}

/** Creates editable input candidates only. Formal inventory saves belong to the parent form. */
export function FeedDocumentImport({
  onApply, initialSelection, completedLineIndexes = [], autoOpen = false, disabled = false,
  buttonLabel = '納品書・請求書から入力',
}: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [candidate, setCandidate] = useState<FeedDocumentCandidate | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [lineIndex, setLineIndex] = useState(-1);
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
  const revealCandidateRef = useRef(false);
  const disabledRef = useRef(disabled);
  const autoOpenedRef = useRef(false);
  openRef.current = open;
  disabledRef.current = disabled;

  const currentOwner = ownerScope();
  const sameOwner = Boolean(ownerRef.current && currentOwner === ownerRef.current);
  const completionKey = JSON.stringify(sessionId && sessionId === initialSelection?.sessionId
    ? completedLineIndexes.filter((index) => Number.isInteger(index) && index >= 0) : []);
  const completed = useMemo(() => new Set<number>(JSON.parse(completionKey)), [completionKey]);
  const selectedLine = candidate?.lines[lineIndex];
  const validation = useMemo(() => candidate && lineIndex >= 0
    ? validateFeedDocumentLine(candidate, lineIndex) : null, [candidate, lineIndex]);
  const confirmationKey = JSON.stringify([candidate, lineIndex, sessionId, ownerRef.current, currentOwner, completionKey]);
  const confirmed = confirmedFor !== null && confirmedFor === confirmationKey;
  const isCompleted = completed.has(lineIndex);
  const canApply = Boolean(candidate && sessionId && selectedLine && validation?.input &&
    !validation.errors.length && !isCompleted && confirmed && sameOwner && !reading && !disabled);
  const quantityOnly = Boolean(candidate?.documentType === 'delivery-note' && selectedLine && [selectedLine.unitPriceYen, selectedLine.grossYen,
    selectedLine.netYen, selectedLine.taxYen].every((value) => !value.trim()));

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
  const resetFile = useCallback(() => {
    invalidateRead();
    releasePreview();
    setFile(null);
    setPreview(null);
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
      resetFile();
      setCandidate(null);
      setSessionId('');
      setLineIndex(-1);
      setError(owner ? ownerError : loginError);
      return;
    }
    if (!initialSelection) return;
    // The original file stays available while reviewing another line from this document.
    if (sessionId !== initialSelection.sessionId) resetFile();
    try {
      if (!initialSelection.sessionId?.trim()) throw new Error('読み取り候補を確認できませんでした。書類を選び直してください。');
      const next = normalizeFeedDocumentCandidate(initialSelection.candidate);
      const index = initialSelection.lineIndex;
      setCandidate(next);
      setSessionId(initialSelection.sessionId);
      setLineIndex(Number.isInteger(index) && index >= 0 && index < next.lines.length &&
        !completedLineIndexes.includes(index) ? index : -1);
    } catch (caught) {
      resetFile();
      setCandidate(null);
      setSessionId('');
      setLineIndex(-1);
      setError(caught instanceof Error ? caught.message : '読み取り候補を確認できませんでした。');
    }
  }, [initialSelection, completedLineIndexes, sessionId, invalidateRead, resetFile]);

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
  useEffect(() => { setConfirmedFor(null); }, [completionKey, currentOwner]);
  useEffect(() => {
    if (ownerRef.current && currentOwner !== ownerRef.current) resetFile();
  }, [currentOwner, resetFile]);
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

  function requireSameOwner() {
    if (ownerRef.current && ownerScope() === ownerRef.current) return true;
    resetFile();
    setConfirmedFor(null);
    setError(ownerError);
    return false;
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    event.target.value = '';
    if (!nextFile || disabledRef.current || !requireSameOwner()) return;
    resetFile();
    setCandidate(null);
    setSessionId('');
    setLineIndex(-1);
    setConfirmedFor(null);
    setError('');
    const type = nextFile.type.toLowerCase();
    const untyped = !type || type === 'application/octet-stream';
    const pdf = type === 'application/pdf' || (untyped && /\.pdf$/i.test(nextFile.name));
    const image = /^image\/(?:jpeg|png|webp|heic|heif)$/.test(type) ||
      (untyped && /\.(?:jpe?g|png|webp|heic|heif)$/i.test(nextFile.name));
    if ((!pdf && !image) || (image && /\.pdf$/i.test(nextFile.name))) {
      setError('納品書・請求書の画像またはPDFファイルを選んでください。');
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
    setConfirmedFor(null);
    setError('');
    setProgress(undefined);
    setStatus('納品書・請求書を読み取っています…');
    try {
      const result = await readFeedDocument(file, {
        onProgress: (next) => {
          if (!currentRequest() || ownerScope() !== ownerRef.current) return;
          setStatus(next.status);
          setProgress(typeof next.progress === 'number' && Number.isFinite(next.progress)
            ? Math.min(100, Math.max(0, next.progress)) : undefined);
        },
      });
      if (!currentRequest() || !requireSameOwner()) return;
      const next = normalizeFeedDocumentCandidate(result);
      revealCandidateRef.current = true;
      setCandidate(next);
      setSessionId(newSessionId());
      setLineIndex(next.lines.length === 1 ? 0 : -1);
      setConfirmedFor(null);
      setStatus('読み取り候補を作成しました。取り込む品目を確認してください。');
      setProgress(100);
    } catch (caught) {
      if (!currentRequest() || !requireSameOwner()) return;
      setError(caught instanceof Error ? caught.message : '納品書・請求書を読み取れませんでした。');
    } finally {
      if (currentRequest()) {
        readingRef.current = false;
        setReading(false);
      }
    }
  }

  function editDocument<K extends keyof Omit<FeedDocumentCandidate, 'lines'>>(field: K, value: FeedDocumentCandidate[K]) {
    setConfirmedFor(null);
    setCandidate((previous) => previous ? { ...previous, [field]: value } : previous);
  }
  function editLine<K extends keyof FeedDocumentLine>(field: K, value: FeedDocumentLine[K]) {
    setConfirmedFor(null);
    setCandidate((previous) => previous ? { ...previous,
      lines: previous.lines.map((line, index) => index === lineIndex ? { ...line, [field]: value } : line),
    } : previous);
  }
  function applySelection() {
    if (!candidate || !sessionId || !confirmed || !openRef.current || readingRef.current ||
        disabledRef.current || !requireSameOwner()) return;
    try {
      const next = normalizeFeedDocumentCandidate(candidate);
      const check = validateFeedDocumentLine(next, lineIndex);
      if (completed.has(lineIndex) || !check.input || check.errors.length) {
        setConfirmedFor(null);
        setError(completed.has(lineIndex) ? 'この品目は登録済みです。別の品目を選んでください。' :
          check.errors.join(' ') || '取り込む品目を確認してください。');
        return;
      }
      onApply({ sessionId, candidate: next, lineIndex });
      closeDialog();
    } catch (caught) {
      setConfirmedFor(null);
      setError(caught instanceof Error ? caught.message : '入力欄へ反映できませんでした。内容を確認してください。');
    }
  }

  const locked = reading || disabled;
  const lineLocked = locked || isCompleted;
  const documentField = (field: DocumentTextField, label: string, date = false) => (
    <TextField key={field} label={label} value={candidate?.[field] || ''} fullWidth size="small" disabled={locked}
      type={date ? 'date' : 'text'} InputLabelProps={date ? { shrink: true } : undefined}
      onChange={(event) => editDocument(field, event.target.value)} />
  );
  const lineField = (field: LineTextField, label: string, options: { date?: boolean; numeric?: boolean; helperText?: string } = {}) => (
    <TextField key={field} label={label} value={selectedLine?.[field] || ''} fullWidth size="small" disabled={lineLocked}
      type={options.date ? 'date' : 'text'} InputLabelProps={options.date ? { shrink: true } : undefined}
      inputProps={options.numeric ? { inputMode: 'decimal' } : undefined} helperText={options.helperText}
      onChange={(event) => editLine(field, event.target.value)} />
  );

  return <>
    <Button type="button" variant="outlined" onClick={openDialog} disabled={disabled} sx={touchButton}>{buttonLabel}</Button>
    <Dialog open={open} onClose={closeDialog} aria-labelledby={titleId} fullWidth maxWidth="lg"
      PaperProps={{ sx: { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 64px)' }, maxHeight: 'calc(100% - 32px)' } }}>
      <DialogTitle id={titleId} fontWeight={800}>納品書・請求書から入力</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, minWidth: 0, overflowX: 'hidden', overflowWrap: 'anywhere' }}>
        <Stack spacing={2.5}>
          <Typography>納品書・請求書を読み取り、1品目ずつ確認して入庫の入力欄へ反映します。</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {disabled && <Alert severity="info">現在は読み取り内容を反映できません。</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {isMobileCaptureDevice() && <Button component="label" variant="contained" disabled={disabled} sx={touchButton}>
              写真を撮る
              <input hidden type="file" accept="image/*" capture="environment" disabled={disabled} aria-label="納品書・請求書を撮影" onChange={chooseFile} />
            </Button>}
            <Button component="label" variant="outlined" disabled={disabled} sx={touchButton}>
              画像・PDFを選ぶ
              <input hidden type="file" accept="image/*,.pdf,application/pdf" disabled={disabled} aria-label="納品書・請求書の画像・PDF" onChange={chooseFile} />
            </Button>
          </Stack>
          {preview && <Stack spacing={1}>
            <Typography variant="body2">{preview.name}</Typography>
            {preview.image
              ? <Box component="img" src={preview.url} alt="選択した納品書・請求書" sx={{ width: '100%', maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 1 }} />
              : <Button component="a" href={preview.url} target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ ...touchButton, alignSelf: 'flex-start' }}>PDFを開いて確認</Button>}
            <Button type="button" variant="contained" onClick={readDocument} disabled={reading || disabled || !sameOwner} sx={touchButton}>{reading ? '読み取り中…' : '読み取る'}</Button>
          </Stack>}
          {reading && <LinearProgress aria-label="納品書・請求書を読み取り中" variant={progress === undefined ? 'indeterminate' : 'determinate'} value={progress} />}
          {status && <Typography variant="body2" role="status">{status}</Typography>}
          {candidate && <>
            <Typography component="h3" variant="h6" fontWeight={800} ref={candidateHeadingRef}
              tabIndex={-1} sx={{ scrollMarginTop: 8 }}>読み取り内容を確認</Typography>
            {candidate.notes.length > 0 && <Alert severity="warning"><Stack spacing={0.5}>
              {candidate.notes.map((note, index) => <Typography key={index} variant="body2">{note}</Typography>)}
            </Stack></Alert>}
            <Box sx={fieldsGrid}>
              <TextField select label="書類の種類" value={candidate.documentType} fullWidth size="small" disabled={locked}
                onChange={(event) => editDocument('documentType', event.target.value as FeedDocumentCandidate['documentType'])}>
                <MenuItem value="unknown">未確認</MenuItem><MenuItem value="delivery-note">納品書</MenuItem>
                <MenuItem value="invoice">請求書</MenuItem><MenuItem value="other">その他の書類</MenuItem>
              </TextField>
              {documentField('supplier', '仕入先')}
              {documentField('deliveryDate', '書類共通の納品日', true)}
            </Box>
            <Typography variant="body2" color="text.secondary">入庫日は、実際に飼料が届いた日を確認してください。</Typography>
            <TextField select label="取り込む品目" value={lineIndex >= 0 ? String(lineIndex) : ''} fullWidth disabled={locked}
              SelectProps={{ MenuProps: { PaperProps: { sx: { maxWidth: 'calc(100vw - 32px)' } },
                MenuListProps: { sx: { '& .MuiMenuItem-root': { minHeight: 44, whiteSpace: 'normal', overflowWrap: 'anywhere' } } } } }}
              onChange={(event) => { setConfirmedFor(null); setError(''); setLineIndex(event.target.value === '' ? -1 : Number(event.target.value)); }}>
              <MenuItem value="" disabled>品目を選んでください</MenuItem>
              {candidate.lines.map((line, index) => <MenuItem key={index} value={String(index)} disabled={completed.has(index)}>
                {index + 1}. {line.feedName || '品目名未確認'} ／ {line.quantity || '数量未確認'}{line.unit || line.originalUnit}
                {completed.has(index) ? '（登録済み）' : ''}
              </MenuItem>)}
            </TextField>
            {candidate.lines.length === 0 && <Alert severity="warning">取り込む品目がありません。飼料の明細がある書類を選び直してください。</Alert>}
            {candidate.lines.length > 0 && candidate.lines.every((_line, index) => completed.has(index)) &&
              <Alert severity="info">この書類の品目はすべて登録済みです。別の書類を選べます。</Alert>}
            {selectedLine && <>
              {isCompleted && <Alert severity="info">この品目は登録済みです。別の品目を選んでください。</Alert>}
              {selectedLine.notes.length > 0 && <Alert severity="warning"><Stack spacing={0.5}>
                {selectedLine.notes.map((note, index) => <Typography key={index} variant="body2">{note}</Typography>)}
              </Stack></Alert>}
              <Box sx={fieldsGrid}>
                <TextField select label="品目の種類" value={selectedLine.kind} size="small" fullWidth disabled={lineLocked}
                  onChange={(event) => editLine('kind', event.target.value as FeedDocumentLine['kind'])}>
                  <MenuItem value="unknown">未確認</MenuItem><MenuItem value="feed">飼料</MenuItem><MenuItem value="other">飼料以外</MenuItem>
                </TextField>
                {lineField('feedName', '飼料名')}
                {lineField('deliveryDate', '品目の納品日', { date: true, helperText: '空欄の場合は書類共通の納品日を使います' })}
                {lineField('quantity', '数量', { numeric: true })}
                <TextField select label="単位" value={selectedLine.unit} size="small" fullWidth disabled={lineLocked}
                  onChange={(event) => editLine('unit', event.target.value as FeedDocumentLine['unit'])}>
                  {units.map((unit) => <MenuItem key={unit || 'unknown'} value={unit}>{unit || '未確認'}</MenuItem>)}
                </TextField>
                {selectedLine.unit === '袋' && lineField('bagWeightKg', '1袋の重量（kg）', { numeric: true })}
                {lineField('grossYen', '書類の税込金額（円）', { numeric: true })}
                {lineField('netYen', '書類の税抜金額（円）', { numeric: true })}
                {lineField('taxYen', '書類の消費税額（円）', { numeric: true })}
                <TextField select label="消費税率" value={selectedLine.taxRate} size="small" fullWidth disabled={lineLocked}
                  onChange={(event) => editLine('taxRate', event.target.value as FeedDocumentLine['taxRate'])}>
                  <MenuItem value="">未確認</MenuItem><MenuItem value="10">10%</MenuItem><MenuItem value="8">8%</MenuItem><MenuItem value="0">非課税</MenuItem>
                </TextField>
              </Box>
              <Accordion disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>単価・書類の補助情報</Typography></AccordionSummary>
                <AccordionDetails><Box sx={fieldsGrid}>
                  {documentField('documentNumber', '伝票番号')}
                  {documentField('issueDate', '書類の発行日', true)}
                  {lineField('originalUnit', '書類の単位表記')}
                  {lineField('unitPriceYen', '書類の単価（円）', { numeric: true })}
                  <TextField select label="単価の税込・税抜" value={selectedLine.unitPriceBasis} size="small" fullWidth disabled={lineLocked}
                    onChange={(event) => editLine('unitPriceBasis', event.target.value as FeedDocumentLine['unitPriceBasis'])}>
                    <MenuItem value="unknown">未確認</MenuItem><MenuItem value="tax-included">税込</MenuItem><MenuItem value="tax-excluded">税抜</MenuItem>
                  </TextField>
                  <TextField select label="単価の単位" value={selectedLine.priceUnit} size="small" fullWidth disabled={lineLocked}
                    onChange={(event) => editLine('priceUnit', event.target.value as FeedDocumentLine['priceUnit'])}>
                    {units.map((unit) => <MenuItem key={unit || 'unknown'} value={unit}>{unit || '未確認'}</MenuItem>)}
                  </TextField>
                  <TextField label="書類の読み取りメモ" value={candidate.notes.join('\n')} multiline minRows={2} fullWidth disabled={locked}
                    sx={{ gridColumn: { md: '1 / -1' } }} onChange={(event) => editDocument('notes', event.target.value ? event.target.value.split('\n') : [])} />
                  <TextField label="品目の読み取りメモ" value={selectedLine.notes.join('\n')} multiline minRows={2} fullWidth disabled={lineLocked}
                    sx={{ gridColumn: { md: '1 / -1' } }} onChange={(event) => editLine('notes', event.target.value ? event.target.value.split('\n') : [])} />
                </Box></AccordionDetails>
              </Accordion>
              {quantityOnly && <Alert severity="info">金額の記載がない場合は、数量だけを反映できます。金額は登録画面で入力できます。</Alert>}
              {validation?.warnings.length ? <Alert severity="warning"><Stack spacing={0.5}>
                {validation.warnings.map((message) => <Typography variant="body2" key={message}>{message}</Typography>)}
              </Stack></Alert> : null}
              {validation?.taxCalculated && <Typography variant="body2" color="text.secondary">税率から換算した金額を含みます。書類と照合して確認してください。</Typography>}
              {validation?.input && <Box sx={{ ...fieldsGrid, bgcolor: 'action.hover', p: 1.5, borderRadius: 1 }}>
                <Typography>反映する入庫日：{validation.input.transactionDate}</Typography>
                <Typography>数量：{validation.input.quantity}{validation.input.unit}</Typography>
                <Typography fontWeight={800}>反映する税込金額：{yen(validation.input.totalPrice)}</Typography>
                <Typography>反映する単価（税込）：{yen(validation.input.unitPrice)}</Typography>
                <Typography>反映する税抜金額：{yen(validation.input.taxExcludedPrice)}</Typography>
                <Typography>反映する消費税額：{yen(validation.input.taxAmount)}</Typography>
              </Box>}
              {validation?.errors.length ? <Alert severity="error"><Stack spacing={0.5}>
                {validation.errors.map((message) => <Typography variant="body2" key={message}>{message}</Typography>)}
              </Stack></Alert> : null}
              <Typography variant="body2" color="text.secondary">反映すると、入力中の入庫内容を置き換えます。反映後、登録画面で保存します。</Typography>
              <FormControlLabel sx={{ minHeight: 44, alignItems: 'center', mr: 0 }} control={
                <Checkbox checked={confirmed} disabled={lineLocked || !sameOwner}
                  onChange={(event) => { if (requireSameOwner()) setConfirmedFor(event.target.checked ? confirmationKey : null); }} />
              } label="品目・数量・金額と、未登録の入庫であることを確認しました" />
            </>}
          </>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, '& > :not(style) ~ :not(style)': { ml: 0 }, '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, minHeight: 44 } }}>
        <Button type="button" variant="outlined" onClick={closeDialog}>閉じる</Button>
        <Button type="button" variant="contained" onClick={applySelection} disabled={!canApply}>入庫の入力欄に反映</Button>
      </DialogActions>
    </Dialog>
  </>;
}
