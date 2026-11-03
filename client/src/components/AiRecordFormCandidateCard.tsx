import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { assertAiRecordFormDraftOwner, getAiRecordFormDefinition, type AiRecordFormDraft } from '../ai/recordFormDraft';

const readableValues: Record<string, string> = {
  farm_stock: '農場在庫', veterinarian: '獣医師処方',
  'purchased-calf': '子牛を購入', 'purchased-pregnant': '妊娠牛を購入', retained: '自家保留',
};

export function AiRecordFormCandidateCard({ draft }: { draft: AiRecordFormDraft }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const definition = getAiRecordFormDefinition(draft.kind);
  const fields = Object.entries(draft.fields).filter(([key, value]) => definition.fields[key] && value !== '');
  const openForm = () => {
    try {
      assertAiRecordFormDraftOwner(draft);
      navigate(definition.route, { state: { farmproAiDraft: draft } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登録画面を開けませんでした。もう一度お試しください。');
    }
  };
  return <Card variant="outlined">
    <CardContent>
      <Stack spacing={1.5}>
        <Typography variant="h6" fontWeight={900}>{definition.label}の入力候補</Typography>
        <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.sourceText}</Typography>
        {fields.length > 0 && <Stack spacing={0.75}>
          {fields.map(([key, value]) => <Typography key={key} sx={{ overflowWrap: 'anywhere' }}>
            <strong>{definition.fields[key].label}：</strong>{readableValues[value] || value}
          </Typography>)}
        </Stack>}
        <Alert severity="info">まだ保存していません。登録画面で空欄を補い、内容を確認してから保存してください。</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        <Button variant="contained" size="large" onClick={openForm}>登録画面で確認・修正する</Button>
      </Stack>
    </CardContent>
  </Card>;
}
