import { Alert, Button, Chip, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { breedingPlanDaysUntil } from '../utils/breedingPlans';
import { cattlePlanDestination, type CattlePlanSummary, type PlanAnimal } from '../utils/cattleBreedingPlans';

type Props = {
  animal: PlanAnimal;
  summary: CattlePlanSummary | null;
  today: string;
  compact?: boolean;
  hideEmpty?: boolean;
};

export function CattleBreedingPlanItems({ animal, summary, today, compact = false, hideEmpty = false }: Props) {
  if (!summary) return <Typography variant="body2" color="text.secondary">繁殖予定を確認中...</Typography>;
  if (summary.isSold) return null;
  if (!summary.plans.length && !summary.issues.length) return hideEmpty ? null : <Typography variant="body2" color="text.secondary">{compact ? '予定なし' : '現在、次の予定はありません。'}</Typography>;
  return (
    <Stack spacing={compact ? 0.5 : 0.75}>
      {summary.issues.map((message) => <Alert key={message} severity="warning" sx={{ py: 0.25 }}><Typography variant="body2">{message}</Typography></Alert>)}
      {summary.issues.length > 0 && !compact && <Button component={RouterLink} to="/breedings" variant="outlined" size="small" className="no-print" sx={{ alignSelf: 'flex-start' }}>繁殖記録を確認</Button>}
      {summary.plans.map((item) => {
        const remaining = item.date ? breedingPlanDaysUntil(item.date, today) : null;
        const guidance = ['post-calving-heat', 'breeding-choice', 'feed-review'].includes(item.kind);
        const destination = cattlePlanDestination(item, animal, `/cattle/${animal.id}`);
        const label = item.date ? `${item.title} ${item.date}` : `${item.title}${guidance ? '' : '（日付未登録）'}`;
        return (
          <Stack key={`${item.sourceRecordId || ''}:${item.kind}`} spacing={0.25} data-plan-kind={item.kind} data-plan-date={item.date || ''}>
            {compact ? <Chip label={label} size="small" color={remaining !== null && remaining <= 3 ? 'warning' : 'info'} sx={{ alignSelf: 'flex-start', maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.4 } }} /> : <>
              <Typography fontWeight={800}>{item.title}</Typography>
              {item.date ? <Typography color="text.secondary">予定日：{item.date}</Typography> : !guidance && <Typography color="text.secondary">予定日：未登録</Typography>}
            </>}
            {item.kind === 'feed-review' && item.relatedDate && <Typography variant="body2" color="text.secondary">分娩予定日：{item.relatedDate}（継続中の確認）</Typography>}
            {item.note && (!compact || item.kind === 'post-calving-heat') && <Typography variant="body2" color="text.secondary">{item.note}</Typography>}
            {!compact && item.kind !== 'feed-review' && <Button component={RouterLink} to={destination.to} variant="outlined" size="small" className="no-print" sx={{ alignSelf: 'flex-start' }}>{destination.label}</Button>}
          </Stack>
        );
      })}
    </Stack>
  );
}
