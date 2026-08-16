import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deleteCattle, getCattleList } from '../services/api';
import { getBreedingList } from '../services/breedingApi';
import { formatSex } from '../utils/sex';

type CattleRow = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday?: string;
  sex?: '雌' | '雄' | '去勢';
  sire?: string;
  dam?: string;
  stage?: '育成牛' | '繁殖牛';
  note?: string;
};