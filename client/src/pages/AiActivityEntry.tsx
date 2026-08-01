import { useState } from 'react';

type ActivityCandidate = {
  animalNumber: string;
  heatDate: string;
  inseminationTime: string;
};

type TranscriptionResponse = {
  text?: string;
  message?: string;
};

export function AiActivityEntry() {
  const [inputText, setInputText] = useState('');
  const [candidate, setCandidate] = useState<ActivityCandidate | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');

  const createCandidate = () => {
    const animalNumber = inputText.match(/(\d+)番/)?.[1] ?? '';
    const inseminationTime = inputText.match(/(午前|午後)?\s*(\d+)時/)?.[0] ?? '';

    setCandidate({
      animalNumber,
      heatDate: inputText.includes('今日') ? '今日' : '',
      inseminationTime,
    });
  };

  const transcribeAudio = async () => {
    if (!audioFile) return;

    setIsTranscribing(true);
    setVoiceMessage('');

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);

      const response = await fetch('/api/ai-voice/transcribe', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const result = (await response.json()) as TranscriptionResponse;

      if (!response.ok) {
        throw new Error(result.message || '音声の文字起こしに失敗しました。');
      }

      const transcription = result.text?.trim();
      if (!transcription) {
        throw new Error('文字起こし結果が空でした。');
      }

      setInputText(transcription);
      setCandidate(null);
      setVoiceMessage('音声を文字にしました。内容を確認してください。');
    } catch (error) {
      setVoiceMessage(
        error instanceof Error ? error.message : '音声の文字起こしに失敗しました。',
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>AIで活動登録</h1>

      <p>
        現場で行った内容を音声または文章で入力し、登録候補を作成します。
        AIが正式データを勝手に保存することはありません。
      </p>

      <section
        style={{
          marginBottom: 24,
          padding: 20,
          border: '1px solid #aaa',
          borderRadius: 12,
          background: '#fafafa',
        }}
      >
        <h2 style={{ marginTop: 0 }}>音声入力</h2>
        <p>スマホでは録音、PCでは音声ファイルの選択ができます。</p>

        <input
          type="file"
          accept="audio/*"
          capture="environment"
          onChange={(event) => {
            setAudioFile(event.target.files?.[0] ?? null);
            setVoiceMessage('');
          }}
          disabled={isTranscribing}
          style={{ display: 'block', marginBottom: 12, fontSize: 16 }}
        />

        <button
          type="button"
          onClick={transcribeAudio}
          disabled={!audioFile || isTranscribing}
          style={{
            padding: '12px 20px',
            fontSize: 17,
            fontWeight: 700,
            cursor: audioFile && !isTranscribing ? 'pointer' : 'not-allowed',
          }}
        >
          {isTranscribing ? '文字起こし中…' : '音声を文字にする'}
        </button>

        {audioFile && <p>選択中：{audioFile.name}</p>}
        {voiceMessage && <p role="status">{voiceMessage}</p>}
      </section>

      <label htmlFor="activityText" style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>
        活動内容
      </label>

      <textarea
        id="activityText"
        value={inputText}
        onChange={(event) => {
          setInputText(event.target.value);
          setCandidate(null);
        }}
        placeholder="例：123番、今日発情。午後3時に授精"
        rows={6}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: 12,
          fontSize: 18,
          borderRadius: 8,
          border: '1px solid #999',
        }}
      />

      <button
        type="button"
        onClick={createCandidate}
        disabled={!inputText.trim()}
        style={{
          marginTop: 16,
          padding: '12px 24px',
          fontSize: 18,
          fontWeight: 700,
          cursor: inputText.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        登録候補を作る
      </button>

      {candidate && (
        <section style={{ marginTop: 24, padding: 20, border: '2px solid #2e7d32', borderRadius: 12 }}>
          <h2>登録候補</h2>

          <p>牛番号：{candidate.animalNumber || '未判定'}</p>
          <p>発情日：{candidate.heatDate || '未判定'}</p>
          <p>授精時刻：{candidate.inseminationTime || '未判定'}</p>

          <button type="button" disabled style={{ marginTop: 12, padding: '10px 20px' }}>
            確認して保存
          </button>
        </section>
      )}
    </div>
  );
}
