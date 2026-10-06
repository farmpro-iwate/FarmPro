import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography, type ChipProps } from '@mui/material';

type HomeTaskCardProps = {
  to: string;
  status: string;
  statusColor: ChipProps['color'];
  category?: string;
  date?: string;
  dateLabel?: string;
  title: string;
  detail: string;
  note?: string;
};

// Presentation only: callers retain all scheduling, identity and route decisions.
export function HomeTaskCard({ to, status, statusColor, category, date, dateLabel, title, detail, note }: HomeTaskCardProps) {
  return (
    <Card variant="outlined">
      <CardActionArea component={RouterLink} to={to}>
        <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' },
            alignItems: 'center',
            columnGap: 2,
            rowGap: 1,
          }}>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Chip size="small" color={statusColor} label={status} sx={{ flexShrink: 0, maxWidth: '100%' }} />
                {category && <Chip size="small" variant="outlined" label={category} sx={{ flexShrink: 0 }} />}
                {date && (
                  <Typography fontWeight={800} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {dateLabel ? `${dateLabel}：${date}` : date}
                  </Typography>
                )}
                <Typography fontWeight={900} sx={{ flexShrink: 0, maxWidth: '100%', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                  {title}
                </Typography>
              </Box>
              <Typography sx={{ overflowWrap: 'anywhere' }}>{detail}</Typography>
              {note && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{note}</Typography>}
            </Stack>
            <Typography variant="body2" color="primary" fontWeight={800} sx={{ justifySelf: 'end', whiteSpace: 'nowrap' }}>
              開く →
            </Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
