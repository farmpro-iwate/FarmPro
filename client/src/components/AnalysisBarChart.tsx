import { Box, Button, Stack, Typography } from '@mui/material';

export type AnalysisBarItem = { key: string; label: string; value: number | null; sample?: string };
export function AnalysisBarChart({ title, items, format, unit, reference, onSelect }: {
  title: string; items: AnalysisBarItem[]; format: (value: number | null) => string; unit: string;
  reference?: { value: number | null; label: string }; onSelect?: (key: string) => void;
}) {
  const values = items.flatMap(item => item.value === null ? [] : [item.value]);
  const maximum = Math.max(1, ...values, reference?.value ?? 0);
  const step = 10 ** Math.floor(Math.log10(maximum));
  const scale = Math.ceil(maximum / step) * step;
  const referencePosition = reference?.value === null || reference?.value === undefined ? null : reference.value / scale * 100;
  return <Box component="figure" aria-label={title} sx={{ m: 0, p: { xs: 1.5, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
    <Typography component="figcaption" fontWeight={800} sx={{ mb: 1 }}>{title}</Typography>
    <Typography variant="body2" color="text.secondary">棒の長さ：{unit} ／ すべて0からの共通目盛で比較</Typography>
    {reference && referencePosition !== null && <Typography variant="body2" sx={{ color: 'text.secondary', my: 1 }}>破線：{reference.label} {format(reference.value)}</Typography>}
    {!values.length && <Typography sx={{ my: 2 }}>グラフにできる実績がまだありません。</Typography>}
    <Stack spacing={1.5} sx={{ mt: 2 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ ml: { md: '32%' } }} aria-hidden="true"><Typography variant="caption">0</Typography><Typography variant="caption">{format(scale)}</Typography></Stack>
      {items.map(item => <Box key={item.key} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 2.2fr)' }, gap: { xs: 0.5, md: 2 }, alignItems: 'center' }}>
        <Box sx={{ minWidth: 0 }}>
          {onSelect ? <Button onClick={() => onSelect(item.key)} sx={{ minHeight: 44, textAlign: 'left', justifyContent: 'flex-start', px: 0, overflowWrap: 'anywhere', maxWidth: '100%' }}>{item.label}</Button> : <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{item.label}</Typography>}
          {item.sample && <Typography variant="caption" color="text.secondary" display="block">{item.sample}</Typography>}
        </Box>
        <Box>
          <Typography fontWeight={800}>{format(item.value)}</Typography>
          <Box aria-hidden="true" sx={{ height: 24, position: 'relative', bgcolor: 'action.hover', borderLeft: '1px solid', borderColor: 'divider', borderRadius: 0.5 }}>
            {item.value !== null && <Box sx={{ height: '100%', width: `${item.value / scale * 100}%`, bgcolor: 'primary.main', borderRadius: '0 3px 3px 0' }} />}
            {referencePosition !== null && <Box sx={{ position: 'absolute', left: `calc(${referencePosition}% - 1px)`, top: -3, bottom: -3, borderLeft: '2px dashed', borderColor: 'text.primary' }} />}
          </Box>
        </Box>
      </Box>)}
    </Stack>
  </Box>;
}
