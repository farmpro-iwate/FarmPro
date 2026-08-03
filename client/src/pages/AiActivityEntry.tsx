import { useRef, useState } from 'react';

type ActivityCandidate = {
  animalNumber: string;
  heatDate: string;
  inseminationTime: string;
};

type SpeechRecognitionResultEventLike = {
  results: ArrayLike<{
    isFinal: boolean;
    0: {
      transcript: string;
    };
  }>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function AiActivityEntry() {
  const [inputText, setInputText] = useState('');
  const [candidate, setCandidate] = useState<ActivityCandidate | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const createCandidate = () => {
    const animalNumber = inputText.match(/(\d+)番/)?.[1] ?? '';
    const inseminationTime = inputText.match(/(午前|午後)?\s*(\d+)時/)?.[0] ?? '';

    setCandidate({
      animalNumber,
      heatDate: inputText.includes('今日') ? '今日' : '',
      inseminationTime,
    });
  };

  const startVoiceInput = () => {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceMessage(
        'このブラウザは音声入力に対応していません。ChromeまたはEdgeでお試しください。',
      );
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      let confirmedText = '';
      let interimText = '';

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? '';

        if (result.isFinal) {
          confirmedText += transcript;
        } else {
          interimText += transcript;
        }
      }

      const recognizedText = `${confirmedText}${interimText}`.trim();

      if (recognizedText) {
        setInputText(recognizedText);
        setCandidate(null);
        setVoiceMessage('音声を文字にしています。内容を確認してください。');
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);

      if (event.error === 'not-allowed') {
        setVoiceMessage(
          'マイクの使用が許可されていません。ブラウザのマイク設定を確認してください。',
        );
        return;
      }

      setVoiceMessage(`音声入力でエラーが発生しました：${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      setVoiceMessage('音声入力中です。活動内容を話してください。');
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceMessage('音声入力を開始できませんでした。');
    }
  };

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
    setVoiceMessage('音声入力を停止しました。内容を確認してください。');
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
        <h2 style={{ marginTop: 0 }}>ブラウザ音声入力</h2>

        <p>
          マイクボタンを押して、牛番号や活動内容を話してください。
          OpenAI APIキーや音声ファイルは使用しません。
        </p>

        {!isListening ? (
          <button
            type="button"
            onClick={startVoiceInput}
            style={{
              padding: '12px 20px',
              fontSize: 17,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            音声入力を開始
          </button>
        ) : (
          <button
            type="button"
            onClick={stopVoiceInput}
            style={{
              padding: '12px 20px',
              fontSize: 17,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            音声入力を停止
          </button>
        )}

        {voiceMessage && <p role="status">{voiceMessage}</p>}
      </section>

      <label
        htmlFor="activityText"
        style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}
      >
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
        <section
          style={{
            marginTop: 24,
            padding: 20,
            border: '2px solid #2e7d32',
            borderRadius: 12,
          }}
        >
          <h2>登録候補</h2>

          <p>牛番号：{candidate.animalNumber || '未判定'}</p>
          <p>発情日：{candidate.heatDate || '未判定'}</p>
          <p>授精時刻：{candidate.inseminationTime || '未判定'}</p>

          <button
            type="button"
            disabled
            style={{ marginTop: 12, padding: '10px 20px' }}
          >
            確認して保存
          </button>
        </section>
      )}
    </div>
  );
}
