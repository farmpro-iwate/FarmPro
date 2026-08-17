import { useEffect, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';

export function PwaUpdatePrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleUpdateReady = () => setOpen(true);
    window.addEventListener('farmpro-update-ready', handleUpdateReady);
    return () => window.removeEventListener('farmpro-update-ready', handleUpdateReady);
  }, []);
