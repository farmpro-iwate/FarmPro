import { useEffect, useState } from 'react';
import { Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { api } from '../services/api';

type Cattle = { id: number; earTag: string; name: string; birthday: string; sire: string; dam: string; parity: number; blvStatus: string };

export function CattleList() {
  const [cattle, setCattle] = useState<Cattle[]>([]);
  useEffect(() => { api.get<Cattle[]>('/cattle').then((res) => setCattle(res.data)); }, []);
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>牛台帳</Typography>
      <Card><CardContent>
        <Table size="small">
          <TableHead><TableRow><TableCell>個体番号</TableCell><TableCell>名号</TableCell><TableCell>生年月日</TableCell><TableCell>産次</TableCell><TableCell>BLV</TableCell></TableRow></TableHead>
          <TableBody>{cattle.map((cow) => (
            <TableRow key={cow.id}>
              <TableCell>{cow.earTag}</TableCell><TableCell>{cow.name}</TableCell><TableCell>{cow.birthday}</TableCell><TableCell>{cow.parity}産</TableCell>
              <TableCell><Chip size="small" label={cow.blvStatus} color={cow.blvStatus === '陰性' ? 'success' : 'warning'} /></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
    </Stack>
  );
}
