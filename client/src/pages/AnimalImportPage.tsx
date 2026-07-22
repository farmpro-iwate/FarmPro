import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';

export function AnimalImportPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>牛情報の取り込み</Typography>
      <Alert severity="info">
        この画面では、登録前にファイルの内容を確認します。既存データは変更されません。
      </Alert>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>ファイルを選ぶ</Typography>
            <Button component="label" variant="contained" size="large">
              CSV・Excelファイルを選ぶ
              <input hidden type="file" accept=".csv,.xlsx,.xls" />
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
