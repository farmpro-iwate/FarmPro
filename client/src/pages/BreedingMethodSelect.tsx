import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';

export function BreedingMethodSelect() {
  return (
    <Stack spacing={1.5}>
      <Typography variant="h5" fontWeight={800}>種付方法を選択</Typography>
      <Alert severity="info" sx={{ py: 0.5 }}>
        人工授精（AI）か受精卵移植（ET）を選んでください。
      </Alert>

      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6" fontWeight={900}>人工授精（AI）</Typography>
                <Typography color="text.secondary">
                  種付・授精日、種雄牛、授精師を登録します。
                </Typography>
                <Button
                  component={RouterLink}
                  to="/breedings/insemination/new"
                  variant="contained"
                  size="large"
                  fullWidth
                >
                  AIを登録
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography variant="h6" fontWeight={900}>受精卵移植（ET）</Typography>
                <Typography color="text.secondary">
                  発情確認日を登録すると、7日後を移植予定日として予定・アラートへ連携します。
                </Typography>
                <Button
                  component={RouterLink}
                  to="/breedings/transfer-plan/new"
                  variant="contained"
                  size="large"
                  fullWidth
                >
                  ET予定を登録
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Button component={RouterLink} to="/" variant="outlined">戻る</Button>
    </Stack>
  );
}

export default BreedingMethodSelect;
