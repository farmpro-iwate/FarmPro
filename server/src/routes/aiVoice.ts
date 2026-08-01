import { Router } from 'express';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';

export const aiVoiceRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

aiVoiceRouter.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '音声ファイルが選択されていません。' });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return res.status(503).json({ message: 'OpenAI APIキーが設定されていません。' });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const audioFile = await toFile(
      req.file.buffer,
      req.file.originalname || 'farmpro-voice.webm',
      { type: req.file.mimetype || 'audio/webm' },
    );

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'ja',
      prompt: '繁殖和牛農家の作業記録です。牛の耳標番号、発情、人工授精、受精卵移植、妊娠鑑定、分娩、治療、投薬、ワクチン、給餌などを正確に文字起こししてください。',
    });

    return res.json({
      text: transcription.text,
    });
  } catch (error) {
    console.error('AI voice transcription failed:', error);
    return res.status(502).json({ message: '音声の文字起こしに失敗しました。' });
  }
});
