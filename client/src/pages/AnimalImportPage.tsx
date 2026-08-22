import { ChangeEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Divider, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import * as XLSX from 'xlsx';
import { CsvPreviewTable } from '../components/CsvPreviewTable';
import { ImportFieldMapping } from '../components/ImportFieldMapping';
import { createCattle, getCattleList } from '../services/api';
import { CattleImportCandidate, emptyCattleImportCandidate, getCattleDocumentReader } from '../services/cattleDocumentReader';
import { parseCsv } from '../utils/csv';

type Preview = { fileName: string; headers: string[]; rows: string[][] };
type DocumentPreview = { fileName: string; fileType: '画像' | 'PDF'; objectUrl: string; isImage: boolean };
type DuplicateMatch = {
  id: number;
  name: string;
  earTag: string;
  identificationNumber?: string;
  birthday?: string;
  reasons: string[];
  strong: boolean;
};

function parseExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excelファイルにシートがありません。');
  const sheet = workbook.Sheets[firstSheetName];
  const values = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(sheet, { header: 1, raw: false, defval: '' });
  const normalized = values.map((row) => row.map((cell) => String(cell).trim())).filter((row) => row.some((cell) => cell !== ''));
  if (normalized.length === 0) throw new Error('Excelファイルにデータがありません。');
  const [headers, ...rows] = normalized;
  if (headers.every((header) => header === '')) throw new Error('Excelファイルの1行目に項目名がありません。');
  return { headers, rows };
}

export function AnimalImportPage() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreview | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [candidate, setCandidate] = useState<CattleImportCandidate | null>(null);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [readingDocument, setReadingDocument] = useState(false);
  const [readStatus, setReadStatus] = useState('');
  const [readProgress, setReadProgress] = useState(0);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [showRegistrationReview, setShowRegistrationReview] = useState(false);
  const [registrationEarTag, setRegistrationEarTag] = useState('');
  const [registrationSex, setRegistrationSex] = useState<'' | '雌' | '雄' | '去勢'>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => () => {
    if (documentPreview?.objectUrl) URL.revokeObjectURL(documentPreview.objectUrl);
  }, [documentPreview]);

  const resetReviewState = () => {
    setDuplicateChecked(false);
    setDuplicateMatches([]);
    setShowRegistrationReview(false);
  };

  const clearDocument = () => {
    setDocumentPreview((current) => {
      if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
      return null;
    });
    setDocumentFile(null);
    setCandidate(null);
    setRawText('');
    setReadStatus('');
    setReadProgress(0);
    setRegistrationEarTag('');
    setRegistrationSex('');
    resetReviewState();
  };

  const handleDocumentFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clearDocument();
    setPreview(null);
    setError('');
    const lowerName = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(lowerName);
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    if (!isImage && !isPdf) {
      setError('画像またはPDFファイルを選んでください。');
      return;
    }
    setDocumentFile(file);
    setDocumentPreview({ fileName: file.name, fileType: isPdf ? 'PDF' : '画像', objectUrl: URL.createObjectURL(file), isImage });
  };

  const handleReadDocument = async () => {
    if (!documentFile) return;
    setError('');
    setCandidate(null);
    setRawText('');
    resetReviewState();
    setReadProgress(0);
    setReadStatus('AI画像解析を準備しています…');
    setReadingDocument(true);
    try {
      const reader = getCattleDocumentReader('ai');
      const result = await reader.read(documentFile, {
        onProgress: ({ status, progress }) => {
          setReadStatus(status);
          if (typeof progress === 'number') setReadProgress(progress);
        },
      });
      setCandidate(result.candidate);
      setRegistrationSex(result.candidate.sex);
      setRawText(result.rawText);
      setReadProgress(100);
      setReadStatus('読み取り候補を作成しました。内容を確認してください。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '画像・PDFを読み取れませんでした。');
      setReadStatus('');
    } finally {
      setReadingDocument(false);
    }
  };

  const updateCandidate = (key: keyof Omit<CattleImportCandidate, 'offspring'>, value: string) => {
    setCandidate((current) => ({ ...(current || emptyCattleImportCandidate), [key]: value }));
    resetReviewState();
  };

  const updateOffspring = (index: number, key: 'name' | 'birthday' | 'sex' | 'sire' | 'calvingIntervalDays' | 'salePrice', value: string) => {
    setCandidate((current) => {
      if (!current) return current;
      return { ...current, offspring: current.offspring.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) };
    });
    setShowRegistrationReview(false);
  };

  const handleDuplicateCheck = async () => {
    if (!candidate) return;
    setDuplicateChecking(true);
    setError('');
    setShowRegistrationReview(false);
    try {
      const rows = await getCattleList();
      const candidateId = candidate.identificationNumber.trim();
      const candidateName = candidate.name.trim();
      const candidateBirthday = candidate.birthday.trim();
      const matches: DuplicateMatch[] = rows.flatMap((row) => {
        const reasons: string[] = [];
        const sameIdentification = Boolean(candidateId) && (row.identificationNumber || '').trim() === candidateId;
        const sameNameAndBirthday = Boolean(candidateName && candidateBirthday) && row.name.trim() === candidateName && (row.birthday || '').slice(0, 10) === candidateBirthday;
        if (sameIdentification) reasons.push('個体識別番号が一致');
        if (sameNameAndBirthday) reasons.push('名号＋生年月日が一致');
        if (reasons.length === 0) return [];
        return [{ id: row.id, name: row.name, earTag: row.earTag, identificationNumber: row.identificationNumber, birthday: row.birthday, reasons, strong: sameIdentification }];
      });
      setDuplicateMatches(matches);
      setDuplicateChecked(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重複確認に失敗しました。');
      setDuplicateChecked(false);
    } finally {
      setDuplicateChecking(false);
    }
  };

  const hasStrongDuplicate = duplicateMatches.some((match) => match.strong);
  const registrationReady = Boolean(candidate && registrationEarTag.trim() && registrationSex && candidate.name.trim() && candidate.birthday.trim());

  const handleRegister = async () => {
    if (!candidate || !registrationReady) return;
    setSaving(true);
    setError('');
    try {
      const created = await createCattle({
        earTag: registrationEarTag.trim(),
        identificationNumber: candidate.identificationNumber.trim(),
        name: candidate.name.trim(),
        birthday: candidate.birthday.trim(),
        sex: registrationSex as '雌' | '雄' | '去勢',
        sire: candidate.sire.trim(),
        dam: candidate.dam.trim(),
        parity: candidate.offspring.length,
        blvStatus: '未検査',
        stage: '繁殖牛',
        note: '',
        registrationNumber: candidate.registrationNumber.trim(),
        sourceReferenceNumber: candidate.sourceReferenceNumber?.trim() || '',
        maternalSire: candidate.maternalSire.trim(),
        maternalGrandSire: candidate.maternalGrandSire.trim(),
        importedOffspringHistory: candidate.offspring.map((row) => ({ ...row })),
        importSourceFileName: documentPreview?.fileName || '',
        importSourceType: 'ai-document',
      });
      navigate(`/cattle/${created.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '正式登録に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const handleTableFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clearDocument();
    setPreview(null);
    setError('');
    setLoading(true);
    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.csv')) {
        const parsed = parseCsv(await file.text());
        setPreview({ fileName: file.name, ...parsed });
        return;
      }
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const parsed = parseExcel(await file.arrayBuffer());
        setPreview({ fileName: file.name, ...parsed });
        return;
      }
      throw new Error('CSVまたはExcelファイルを選んでください。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ファイルを読み取れませんでした。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>牛情報の取り込み</Typography>
      <Alert severity="info">画像・PDF・CSV・Excelから牛情報を確認できます。正式データへ保存する前に、必ず読み取り結果を確認します。</Alert>

      <Card><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>画像・PDFから取り込む</Typography>
        <Typography color="text.secondary">牛の通信簿や成績表などをAIで読み取り、FarmProの項目候補へ整理します。この段階では既存データを変更しません。</Typography>
        <Alert severity="info">
          写真を撮るときは、紙の向きに合わせてスマホを向けてください。A4横の帳票はスマホも横向きにすると読み取りやすくなります。帳票全体が画面いっぱいに入るよう、できるだけ真上から撮影してください。
        </Alert>
        <Button component="label" variant="contained" size="large" disabled={readingDocument}>画像・PDFを選ぶ<input hidden type="file" accept="image/*,.pdf,application/pdf" onChange={handleDocumentFile} /></Button>
        {documentPreview && <Card variant="outlined"><CardContent><Stack spacing={1.5}>
          <Typography fontWeight={800}>選択したファイル</Typography>
          <Typography>{documentPreview.fileName}（{documentPreview.fileType}）</Typography>
          {documentPreview.isImage && <img src={documentPreview.objectUrl} alt="選択した牛情報帳票" style={{ width: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 8 }} />}
          <Button variant="contained" onClick={handleReadDocument} disabled={readingDocument}>{readingDocument ? 'AIで読み取り中…' : 'AIで内容を読み取る'}</Button>
          {readStatus && <Typography>{readStatus}</Typography>}
          {(readingDocument || readProgress > 0) && <LinearProgress variant="determinate" value={readProgress} />}
        </Stack></CardContent></Card>}
      </Stack></CardContent></Card>

      {candidate && <Card><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>読み取り候補</Typography>
        <Alert severity="info">AIが作った候補です。誤読や空欄はここで修正できます。まだ保存されません。</Alert>
        <TextField label="個体識別番号（公的10桁）" value={candidate.identificationNumber} onChange={(e) => updateCandidate('identificationNumber', e.target.value)} helperText="判読できない場合は空欄のままで構いません。" />
        <TextField label="登録番号" value={candidate.registrationNumber} onChange={(e) => updateCandidate('registrationNumber', e.target.value)} />
        <TextField label="名号" value={candidate.name} onChange={(e) => updateCandidate('name', e.target.value)} />
        <TextField label="生年月日" type="date" InputLabelProps={{ shrink: true }} value={candidate.birthday} onChange={(e) => updateCandidate('birthday', e.target.value)} />
        <TextField label="性別" select value={candidate.sex} onChange={(e) => {
          const sex = e.target.value as '' | '雌' | '雄' | '去勢';
          updateCandidate('sex', sex);
          setRegistrationSex(sex);
        }} helperText="帳票から判別できない場合は未選択のままです。登録前に確認してください。">
          <MenuItem value="">未選択</MenuItem><MenuItem value="雌">♀ 雌</MenuItem><MenuItem value="雄">♂ 雄</MenuItem><MenuItem value="去勢">♂ 去勢</MenuItem>
        </TextField>
        <TextField label="父牛" value={candidate.sire} onChange={(e) => updateCandidate('sire', e.target.value)} />
        <TextField label="母牛" value={candidate.dam} onChange={(e) => updateCandidate('dam', e.target.value)} />
        <TextField label="母の父" value={candidate.maternalSire} onChange={(e) => updateCandidate('maternalSire', e.target.value)} />
        <TextField label="祖母の父" value={candidate.maternalGrandSire} onChange={(e) => updateCandidate('maternalGrandSire', e.target.value)} />

        <Divider />
        <Typography fontWeight={800}>産歴・子牛候補：{candidate.offspring.length}件</Typography>
        <Alert severity="info">各産子の性別も帳票から読み取り、ここで確認・修正できます。分娩間隔と販売価格は過去実績の参考情報として保存し、FarmProの正式な分娩・販売記録とは分けて扱います。</Alert>
        {candidate.offspring.length === 0 ? <Alert severity="warning">産歴・子牛情報は候補を作れませんでした。</Alert> : <Stack spacing={1.5}>
          {candidate.offspring.map((row, index) => <Card key={`${row.parity}-${index}`} variant="outlined"><CardContent><Stack spacing={1.5}>
            <Typography fontWeight={800}>{row.parity || index + 1}産</Typography>
            <TextField label="子牛名号" value={row.name} onChange={(e) => updateOffspring(index, 'name', e.target.value)} />
            <TextField label="生年月日" type="date" InputLabelProps={{ shrink: true }} value={row.birthday} onChange={(e) => updateOffspring(index, 'birthday', e.target.value)} />
            <TextField label="産子の性別" select value={row.sex} onChange={(e) => updateOffspring(index, 'sex', e.target.value)} helperText="AIで判別できない場合は未選択のままです。">
              <MenuItem value="">未選択</MenuItem><MenuItem value="雌">♀ 雌</MenuItem><MenuItem value="雄">♂ 雄</MenuItem><MenuItem value="去勢">♂ 去勢</MenuItem>
            </TextField>
            <TextField label="父牛" value={row.sire} onChange={(e) => updateOffspring(index, 'sire', e.target.value)} />
            <TextField label="分娩間隔（日）" inputMode="numeric" value={row.calvingIntervalDays} onChange={(e) => updateOffspring(index, 'calvingIntervalDays', e.target.value.replace(/[^0-9]/g, ''))} helperText="帳票に記載がある場合だけ。1産目など該当しない場合は空欄で構いません。" />
            <TextField label="販売価格（円）" inputMode="numeric" value={row.salePrice} onChange={(e) => updateOffspring(index, 'salePrice', e.target.value.replace(/[^0-9]/g, ''))} helperText="過去帳票の販売・落札価格。正式な販売記録とは別の参考実績です。" />
          </Stack></CardContent></Card>)}
        </Stack>}

        <Divider />
        <Typography fontWeight={800}>重複確認・登録前確認</Typography>
        <Alert severity="info">現在この端末に保存されている繁殖牛台帳と照合します。個体識別番号の一致、または名号＋生年月日の一致を確認します。</Alert>
        <Button variant="contained" onClick={handleDuplicateCheck} disabled={duplicateChecking}>{duplicateChecking ? '重複を確認中…' : '既存の牛と重複確認する'}</Button>
        {duplicateChecked && duplicateMatches.length === 0 && <Alert severity="success">一致する既存牛は見つかりませんでした。</Alert>}
        {duplicateChecked && duplicateMatches.length > 0 && <Alert severity={hasStrongDuplicate ? 'error' : 'warning'}>
          <Typography fontWeight={800}>{hasStrongDuplicate ? '同一個体の可能性が高い牛があります' : '重複の可能性がある牛があります'}</Typography>
          {duplicateMatches.map((match) => <Typography key={match.id} variant="body2">・{match.name}（耳標 {match.earTag || '-'} / 個体識別番号 {match.identificationNumber || '-'} / 生年月日 {match.birthday || '-'}）— {match.reasons.join('、')}</Typography>)}
        </Alert>}
        {duplicateChecked && !hasStrongDuplicate && <Button variant="outlined" onClick={() => setShowRegistrationReview(true)}>登録前確認へ進む</Button>}
        {duplicateChecked && hasStrongDuplicate && <Alert severity="warning">個体識別番号が一致する既存牛があるため、新規登録には進みません。</Alert>}

        {showRegistrationReview && !hasStrongDuplicate && <Card variant="outlined"><CardContent><Stack spacing={1.5}>
          <Typography fontWeight={800}>登録前確認</Typography>
          <Alert severity="warning">最後に「この内容で正式登録」を押した時だけ、この端末へ保存します。</Alert>
          <TextField label="耳標番号" value={registrationEarTag} onChange={(e) => setRegistrationEarTag(e.target.value)} required helperText="農場内でこの牛を見分ける耳標番号を入力してください。" />
          <TextField label="性別" select value={registrationSex} onChange={(e) => setRegistrationSex(e.target.value as '' | '雌' | '雄' | '去勢')} required helperText={registrationSex ? 'AI読み取り結果を確認してから登録してください。' : '性別を確認して選択してください。'}>
            <MenuItem value="">選択してください</MenuItem><MenuItem value="雌">♀ 雌</MenuItem><MenuItem value="雄">♂ 雄</MenuItem><MenuItem value="去勢">♂ 去勢</MenuItem>
          </TextField>
          <Typography>名号：{candidate.name || '-'}</Typography>
          <Typography>生年月日：{candidate.birthday || '-'}</Typography>
          <Typography>個体識別番号：{candidate.identificationNumber || '要確認'}</Typography>
          <Typography>登録番号：{candidate.registrationNumber || '-'}</Typography>
          <Typography>父牛：{candidate.sire || '-'} / 母牛：{candidate.dam || '-'}</Typography>
          <Typography>産歴候補：{candidate.offspring.length}件</Typography>
          {registrationReady ? <Alert severity="success">基本登録に必要な項目が揃っています。</Alert> : <Alert severity="warning">耳標番号・性別・名号・生年月日を確認してください。</Alert>}
          <Button variant="contained" size="large" onClick={handleRegister} disabled={!registrationReady || saving}>{saving ? '正式登録中…' : 'この内容で正式登録'}</Button>
        </Stack></CardContent></Card>}

        <Divider />
        <TextField label="AI解析結果（確認用）" value={rawText} multiline minRows={4} InputProps={{ readOnly: true }} />
      </Stack></CardContent></Card>}

      <Card><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>CSV・Excelファイルを選ぶ</Typography>
        <Button component="label" variant="contained" size="large" disabled={loading}>{loading ? '読み込み中…' : 'CSV・Excelファイルを選ぶ'}<input hidden type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={handleTableFile} /></Button>
      </Stack></CardContent></Card>

      {error && <Alert severity="warning">{error}</Alert>}
      {preview && <><ImportFieldMapping headers={preview.headers} /><CsvPreviewTable fileName={preview.fileName} headers={preview.headers} rows={preview.rows} onReset={() => setPreview(null)} /></>}
    </Stack>
  );
}
