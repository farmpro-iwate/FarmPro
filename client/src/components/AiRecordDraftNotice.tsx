import { Alert, Box, Typography } from '@mui/material';
import type { AiRecordFormDraft } from '../ai/recordFormDraft';

export function AiRecordDraftNotice({ draft }: { draft: AiRecordFormDraft | null }) {
  if (!draft) return null;
  return <Alert severity="info">
    <Typography variant="body2">AIの入力候補です。空欄を補い、内容を確認してから保存してください。</Typography>
    <Box component="details" sx={{ mt: 0.5, minWidth: 0 }}>
      <Box component="summary" sx={{ cursor: 'pointer', py: 1 }}>入力した内容を見る</Box>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{draft.sourceText}</Typography>
    </Box>
  </Alert>;
}
