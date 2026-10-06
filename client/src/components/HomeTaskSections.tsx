import type { ReactNode } from 'react';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { groupHomeTasks, type HomeTaskGroup, type TimedHomeTask } from '../utils/homeTaskGroups';

export type HomeTaskItem = TimedHomeTask & {
  id: string;
  content: ReactNode;
};

type Props = {
  items: readonly HomeTaskItem[];
  today: string;
  loading?: boolean;
  issues?: readonly string[];
};

const sections: { key: HomeTaskGroup; title: string; description: string; empty: string }[] = [
  { key: 'today', title: '今日の対応', description: '期限を過ぎた予定と、要対応の項目もここに表示します。', empty: '今日の対応予定はありません。' },
  { key: 'upcoming', title: '近日の対応', description: 'これからの日付が入っている対応です。', empty: '近日の対応予定はありません。' },
  { key: 'ongoing', title: '継続中・確認事項', description: '日付未定の継続対応、休薬期間、出荷準備などを確認します。', empty: '継続中の確認事項はありません。' },
];

export function HomeTaskSections({ items, today, loading = false, issues = [] }: Props) {
  const groups = groupHomeTasks(items, today);
  const complete = !loading && issues.length === 0;

  return (
    <Stack spacing={2}>
      {loading && <Alert severity="info">対応予定を確認しています...</Alert>}
      {issues.map((issue) => <Alert key={issue} severity="warning">{issue}</Alert>)}
      {sections.map(({ key, title, description, empty }) => (
        <Box component="section" key={key} aria-label={title}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={900}>{title}</Typography>
              {complete && <Chip size="small" label={`${groups[key].length} 件`} />}
            </Stack>
            <Typography variant="body2" color="text.secondary">{description}</Typography>
            {groups[key].map((item) => <Box key={item.id}>{item.content}</Box>)}
            {groups[key].length === 0 && complete && (
              <Typography variant="body2" color="text.secondary">{empty}</Typography>
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}
