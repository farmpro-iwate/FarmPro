import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardActionArea, CardContent, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { getCattle } from '../services/api';
import { getBreedingList } from '../services/breedingApi';
import { getVaccineList } from '../services/v