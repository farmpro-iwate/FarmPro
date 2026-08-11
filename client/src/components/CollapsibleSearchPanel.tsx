import { ReactNode, useState } from 'react';
import { Button, Card, CardContent, Collapse, Stack } from '@mui/material';

type Props = {
  children: ReactNode;
  active?: boolean;
  defaultOpen?: boolean;
  openLabel?: string;
  closeLabel?: string;
};

export function CollapsibleSearchPanel({
  children,
  active = false,
  defaultOpen = false,
  openLabel = '検索・絞り込みを開く',
  closeLabel = '検索・絞り込みを閉じる',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Stack spacing={1}>
      <Button
        variant="outlined"
        onClick={() => setOpen((value) => !value)}
        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
      >
        {open ? `${closeLabel} ▲` : `${openLabel} ▼${active ? '（適用中）' : ''}`}
      </Button>
      <Collapse in={open}>
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5 }}>
            {children}
          </CardContent>
        </Card>
      </Collapse>
    </Stack>
  );
}

export default CollapsibleSearchPanel;
