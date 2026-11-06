import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { findLifecycleAlertAnimal, type LifecycleAnimalLedger } from '../utils/animalLifecycleAlerts';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type Row = Readonly<Record<string, any>>;
const text = (value: unknown) => String(value ?? '').trim();

/** A treatment target is an ear/temporary/public number, not a device-local ID. */
export function resolveTreatmentAnimal(row: Row, ledger: LifecycleAnimalLedger): { kind: 'cattle' | 'calf'; animal: Row } | null {
  if (row.deletedAt || row.treatmentSyncDeletePending) return null;
  let animal = findLifecycleAlertAnimal(row, ledger);
  // Older saves replaced TEMP-* with a display number. A shared birthday alone
  // cannot identify a calf; require its recorded name and a unique ledger match.
  if (!animal && /^仮-\d{4}$/.test(text(row.targetNumber)) && text(row.targetName)) {
    const matches = ledger.calves.filter(calf => !calf.deletedAt && text(calf.name) === text(row.targetName) &&
      [calf.calfNumber, calf.temporaryCalfNumber].some(number => text(number).startsWith('TEMP-') &&
        formatTemporaryCalfNumber(text(number), text(calf.birthday)) === text(row.targetNumber)));
    if (matches.length === 1) {
      const calf = matches[0];
      const originalNumber = [calf.calfNumber, calf.temporaryCalfNumber].find(number => text(number).startsWith('TEMP-'));
      const resolved = findLifecycleAlertAnimal({ ...row, targetNumber: text(originalNumber) }, ledger);
      if (resolved === calf) animal = resolved;
    }
  }
  if (!animal) return null;
  return { kind: ledger.calves.includes(animal) ? 'calf' : 'cattle', animal };
}

export function medicationHistoryDetail(row: Row): string {
  return [
    `薬品：${text(row.medicine) || '未登録'}`,
    `投薬量：${text(row.dosage) || '未登録'}`,
    `休薬終了日：${text(row.withdrawalEndDate).slice(0, 10) || '未設定'}`,
  ].join('　');
}

export function treatmentHistoryEditPath(row: Row, returnTo: string): string {
  return `/treatments/${encodeURIComponent(text(row.id))}/edit?${new URLSearchParams({ returnTo })}`;
}

/** Display only: saving and inventory changes remain in the existing treatment form. */
export function TreatmentHistory({ rows, returnTo, initialLimit, canEdit = true }: {
  rows: readonly Row[]; returnTo: string; initialLimit?: number; canEdit?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const records = rows.filter(row => !row.deletedAt && !row.treatmentSyncDeletePending)
    .sort((a, b) => text(b.treatmentDate).localeCompare(text(a.treatmentDate)));
  const visible = !expanded && initialLimit ? records.slice(0, initialLimit) : records;
  if (!records.length) return <Typography color="text.secondary">この個体の治療・投薬記録はまだありません。</Typography>;
  return <Stack spacing={1}>
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="治療・投薬の履歴">
        <TableHead><TableRow>
          <TableCell>実施日</TableCell><TableCell>区分</TableCell><TableCell>内容</TableCell>
          <TableCell>休薬終了日</TableCell>{canEdit && <TableCell className="no-print">操作</TableCell>}
        </TableRow></TableHead>
        <TableBody>{visible.map(row => {
          const medication = row.recordType === '投薬';
          return <TableRow key={text(row.id)}>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{text(row.treatmentDate).slice(0, 10) || '-'}</TableCell>
            <TableCell><Chip size="small" label={text(row.recordType) || '治療'} /></TableCell>
            <TableCell sx={{ minWidth: 180 }}>
              {!medication && text(row.symptom || row.diagnosis) && <Typography variant="body2">{text(row.symptom || row.diagnosis)}</Typography>}
              {text(row.medicine) && <Typography variant="body2">薬品：{text(row.medicine)}</Typography>}
              {text(row.dosage) && <Typography variant="body2">投薬量：{text(row.dosage)}</Typography>}
              {!medication && text(row.progress) && <Typography variant="body2" color="text.secondary">{text(row.progress)}</Typography>}
            </TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{text(row.withdrawalEndDate).slice(0, 10) || '未設定'}</TableCell>
            {canEdit && <TableCell className="no-print"><Button component={RouterLink} to={treatmentHistoryEditPath(row, returnTo)}
              variant="outlined" size="small" sx={{ whiteSpace: 'nowrap', minHeight: 44 }}>確認・編集</Button></TableCell>}
          </TableRow>;
        })}</TableBody>
      </Table>
    </Box>
    {initialLimit && records.length > initialLimit && <Button onClick={() => setExpanded(value => !value)} size="small" sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
      {expanded ? '最近の記録だけ表示' : `すべて表示（${records.length}件）`}
    </Button>}
  </Stack>;
}
