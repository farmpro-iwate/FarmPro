import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { BreedingInput } from '../types/breeding';
import { createBreeding, getBreeding, updateBreeding } from '../services/breedingApi';
import {
  calculateExpectedCalvingDate,
  calculateNextHeatExpectedDate,
  calculatePregnancyCheckExpected