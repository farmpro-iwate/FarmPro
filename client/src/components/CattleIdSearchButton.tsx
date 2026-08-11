import { Button } from '@mui/material';

const CATTLE_ID_SEARCH_URL = 'https://www.id.nlbc.go.jp/CattleSearch/search/agreement';

type Props = {
  size?: 'small' | 'medium' | 'large';
};

export function CattleIdSearchButton({ size = 'small' }: Props) {
  return (
    <Button
      component="a"
      href={CATTLE_ID_SEARCH_URL}
      target="_blank"
      rel="noopener noreferrer"
      variant="outlined"
      size={size}
    >
      個体識別検索
    </Button>
  );
}

export default CattleIdSearchButton;
