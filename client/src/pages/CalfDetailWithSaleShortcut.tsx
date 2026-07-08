import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Stack } from '@mui/material';
import { getCalf } from '../services/calfApi';
import { CalfDetail } from './CalfDetail';

type CalfForSale = {
  id?: number | string;
  calfNumber?: string;
  earTag?: string;
  name?: string;
  calfName?: string;
  sex?: string;
  birthday?: string;
  birthDate?: string;
  motherName?: string;
  motherId?: string;
};

const noPrintSx = {
  '@media print': {
    display: 'none'
  }
};

function value(v: unknown) {
  return String(v ?? '').trim();
}

function salePrefillLink(calf: CalfForSale | null) {
  const params = new URLSearchParams();
  params.set('targetType', '子牛');
  params.set('targetNumber', value(calf?.calfNumber || calf?.earTag));
  params.set('targetName', value(calf?.name || calf?.calfName));
  params.set('sex', value(calf?.sex));
  params.set('birthday', value(calf?.birthday || calf?.birthDate));
  params.set('motherName', value(calf?.motherName || calf?.motherId));
  params.set('reason', '子牛販売');
  params.set('memo', '子牛カルテから登録');
  return `/sales/new?${params.toString()}`;
}

export function CalfDetailWithSaleShortcut() {
  const { id } = useParams();
  const [calf, setCalf] = useState<CalfForSale | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!id) return;
      try {
        const data = await getCalf(id);
        if (active) setCalf(data as CalfForSale);
      } catch {
        if (active) setCalf(null);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [id]);

  const link = useMemo(() => salePrefillLink(calf), [calf]);
  const disabled = !calf || (!value(calf.calfNumber || calf.earTag) && !value(calf.name || calf.calfName));

  return (
    <Stack spacing={2}>
      <Alert
        severity="info"
        sx={noPrintSx}
        action={
          <Button
            color="success"
            component={RouterLink}
            disabled={disabled}
            to={link}
            variant="contained"
          >
            この子を出荷・販売登録
          </Button>
        }
      >
        この子牛を出荷・販売する場合は、対象情報を引き継いで登録できます。
      </Alert>
      <CalfDetail />
    </Stack>
  );
}

export default CalfDetailWithSaleShortcut;
