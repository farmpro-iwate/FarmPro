import {
  Alert,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';

type Props = {
  headers: string[];
};

const FIELD_ALIASES: Record<string, string[]> = {
  耳標番号: ['耳標番号', '耳標', '管理番号'],
  個体識別番号: ['個体識別番号', '個体番号', '10桁番号'],
  名号: ['名号', '名前', '牛名'],
  生年月日: ['生年月日', '誕生日'],
  性別: ['性別'],
  父牛: ['父牛', '父', '種雄牛'],
  母牛耳標番号: ['母牛耳標番号', '母牛耳標', '母牛番号'],
};

function normalize(value: string) {
  return value.replace(/\s/g, '').toLowerCase();
}

function findFarmProField(header: string) {
  const normalizedHeader = normalize(header);

  return Object.entries(FIELD_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => normalize(alias) === normalizedHeader),
  )?.[0];
}

export function ImportFieldMapping({ headers }: Props) {
  const mappings = headers.map((header) => ({
    source: header,
    target: findFarmProField(header),
  }));

  const unmatched = mappings.filter((mapping) => !mapping.target);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={800}>
            項目の対応確認
          </Typography>

          <Typography color="text.secondary">
            ファイルの項目名が、FarmProのどの項目として扱われるか確認します。
          </Typography>

          <Stack spacing={1}>
            {mappings.map((mapping, index) => (
              <Stack
                key={`${mapping.source}-${index}`}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Chip label={mapping.source || `項目${index + 1}`} />
                <Typography>→</Typography>
                <Chip
                  label={mapping.target ?? '未対応'}
                  color={mapping.target ? 'success' : 'warning'}
                  variant={mapping.target ? 'filled' : 'outlined'}
                />
              </Stack>
            ))}
          </Stack>

          {unmatched.length > 0 ? (
            <Alert severity="warning">
              未対応の項目があります。現時点では牛台帳への登録対象にしません。
            </Alert>
          ) : (
            <Alert severity="success">
              すべての項目がFarmProの項目へ対応しています。
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
