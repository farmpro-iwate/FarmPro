import { Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { animalLifecycleLabel, type LifecycleDisplayAnimal } from '../utils/animalLifecycleDisplay';

type Props = { animal: LifecycleDisplayAnimal; kind: 'cattle' | 'calf'; animalId: string | number };

export function AnimalLifecycleCard({ animal, kind, animalId }: Props) {
  const death = animal.lifecycle?.death;
  const culling = animal.lifecycle?.culling;
  const label = animalLifecycleLabel(animal);
  if (!death && !culling && !label) return null;
  const returnTo = `/${kind === 'cattle' ? 'cattle' : 'calves'}/${encodeURIComponent(String(animalId))}`;
  const query = new URLSearchParams({ animalKind: kind, animalId: String(animalId), returnTo });
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
        <Stack spacing={1}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Typography fontWeight={900} sx={{ flexGrow: 1 }}>死亡・廃用の記録</Typography>
            {label && <Chip label={label} size="small" />}
            <Button component={RouterLink} to={`/animal-lifecycle/new?${query}`} variant="outlined" size="small" className="no-print">内容を確認・修正</Button>
          </Stack>
          {death && <Stack spacing={0.25}>
            <Typography fontWeight={800}>死亡日：{death.date || '未登録'}</Typography>
            {death.reason && <Typography>理由：{death.reason}</Typography>}
            {death.note && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{death.note}</Typography>}
          </Stack>}
          {culling && <Stack spacing={0.25}>
            <Typography fontWeight={800}>廃用日：{culling.date || '未登録'}</Typography>
            <Typography>移行先：{culling.route === 'fattening' ? '肥育' : '出荷待ち'}</Typography>
            {culling.reason && <Typography>理由：{culling.reason}</Typography>}
            {culling.note && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{culling.note}</Typography>}
          </Stack>}
          {!death && label === '死亡・その他' && <Typography color="text.secondary">死亡・その他として登録された過去の記録です。日付は未登録です。</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}
