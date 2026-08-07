import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Checkbox, FormControlLabel, Grid, Stack, TextField, Typography } from '@mui/material';
import { CattlePicker } from '../components/CattlePicker';
import { createBreeding } from '../services/breedingApi';
import type { BreedingInput } from '../types/breeding';

const initialForm