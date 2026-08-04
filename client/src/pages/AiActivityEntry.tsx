import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCattleList } from '../services/api';

type ActivityCandidate = {
  animalNumber: string;
  activityDate: string;
  activityType: string;
  activityTime: string;
  note: string;
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

const calvingResultOptions = ['自然分娩', '難産', '外科的処置', '死産'];

export function AiActivityEntry() {
  const navigate = useNavigate();
  const [inputText, setInputText] = useState('');
  const [candidate, setCandidate] = useState<ActivityCandidate | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('');
  const [breedingError, setBreedingError] = useState('');
  const [isOpeningBreeding, setIsOpeningBreeding] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const createCandidate = () => {
    const animalNumber =
      inputText.match(/(\d+)番/)?.[1] ??
      inputText.match(/^\s*(\d+)/)?.[1] ??
      '';

    const activityDate =
      inputText.includes('今日')
        ? '今日'
        : inputText.includes('昨日')
          ? '昨日'
          : '';

    const activityType =
      ['発情', '授精', '治療', '分娩'].find((type) =>
        inputText.includes(type),
      ) ?? '';

    const activityTime =
      inputText.match(/(午前|午後)?\s*(\d+)時/)?.[0] ?? '';

    const note =
      inputText
        .split(/[、。]/)
        .map((part) => part.trim())
        .filter((part) => part.startsWith('薬は') || part.startsWith('補足'))
        .join('、');

    setBreedingError('');
    setCandidate({
      animalNumber,
      activityDate,
      activityType,
      activityTime,
      note,
    });
  };

  const openBreedingForm = async () => {
    if (
      !candidate ||
      !candidate.animalNumber ||
      !candidate.activityDate ||
      !candidate.activityType
    ) {
      return;
    }

    setBreedingError('');
    setIsOpeningBreeding(true);

    try {
      const cattleList = await getCattleList();
      const cattle = cattleList.find(
        (item) => item.earTag.trim() === candidate.animalNumber.trim(),
      );

      if (!cattle) {
        setBreedingError(
          `耳標番号「${candidate.animalNumber}」に一致する牛が牛台帳に見つかりません。耳標番号を確認してください。`,
        );
        return;
      }

      const activityDate = new Date();
      if (candidate.activityDate === '昨日') {
        activityDate.setDate(activityDate.getDate() - 1);
      }
      const dateText = [
        activityDate.getFullYear(),
        String(activityDate.getMonth() + 1).padStart(2, '0'),
        String(activityDate.getDate()).padStart(2, '0'),
      ].join('-');
      const cleanedNote = candidate.note
        .replace(/^補足\s*[：:]?\s*/, '')
        .trim();
      const note = [
        candidate.activityTime ? `確認時刻：${candidate.activityTime}` : '',
        cleanedNote,
      ]
        .filter(Boolean)
        .join(' ');
      const searchParams = new URLSearchParams({
        targetNumber: cattle.earTag,
        targetName: cattle.name,
        note,
      });

      if (candidate.activityType === '授精') {
        searchParams.set('breedingMethod', '種付');
        searchParams.set('breedingStatus', '種付実施');
        searchParams.set('inseminationDate', dateText);
      } else {
        searchParams.set('heatDate', dateText);
        searchParams.set('breedingStatus', '発情確認');
      }

      navigate(`/breedings/new?${searchParams.toString()}`);
    } catch {
      setBreedingError(
        '牛台帳を取得できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setIsOpeningBreeding(false);
    }
  };

  const openTreatmentForm = async () => {
    if (
      !candidate ||
      !candidate.animalNumber ||
      !candidate.activityDate ||
      !candidate.activityType
    ) {
      return;
    }

    setBreedingError('');
    setIsOpeningBreeding(true);

    try {
      const cattleList = await getCattleList();
      const cattle = cattleList.find(
        (item) => item.earTag.trim() === candidate.animalNumber.trim(),
      );

      if (!cattle) {
        setBreedingError(
          `耳標番号「${candidate.animalNumber}」に一致する牛が牛台帳に見つかりません。耳標番号を確認してください。`,
        );
        return;
      }

      const treatmentDate = new Date();
      if (candidate.activityDate === '昨日') {
        treatmentDate.setDate(treatmentDate.getDate() - 1);
      }
      const dateText = [
        treatmentDate.getFullYear(),
        String(treatmentDate.getMonth() + 1).padStart(2, '0'),
        String(treatmentDate.getDate()).padStart(2, '0'),
      ].join('-');
      const noteParts = candidate.note
        .split('、')
        .map((part) => part.trim())
        .filter(Boolean);
      const medicine =
        noteParts.find((part) => part.startsWith('薬は'))?.replace(/^薬は\s*/, '').trim() ??
        '';
      const supplementalNote = noteParts
        .filter((part) => !part.startsWith('薬は'))
        .map((part) => part.replace(/^補足\s*[：:]?\s*/, '').trim())
        .filter(Boolean)
        .join(' ');
      const note = [
        candidate.activityTime ? `確認時刻：${candidate.activityTime}` : '',
        supplementalNote,
      ]
        .filter(Boolean)
        .join(' ');
      const searchParams = new URLSearchParams({
        targetNumber: cattle.earTag,
        targetName: cattle.name,
        recordType: '治療',
        treatmentDate: dateText,
        medicine,
        note,
      });

      navigate(`/treatments/new?${searchParams.toString()}`);
    } catch {
      setBreedingError(
        '牛台帳を取得できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setIsOpeningBreeding(false);
    }
  };

  const openCalvingForm = async () => {
    if (
      !candidate ||
      !candidate.animalNumber ||
      !candidate.activityDate ||
      !candidate.activityType
    ) {
      return;
    }

    setBreedingError('');
    setIsOpeningBreeding(true);

    try {
      const cattleList = await getCattleList();
      const cattle = cattleList.find(
        (item) => item.earTag.trim() === candidate.animalNumber.trim(),
      );

      if (!cattle) {
        setBreedingError(
          `耳標番号「${candidate.animalNumber}」に一致する牛が牛台帳に見つかりません。耳標番号を確認してください。`,
        );
        return;
      }

      const calvingDate = new Date();
      if (candidate.activityDate === '昨日') {
        calvingDate.setDate(calvingDate.getDate() - 1);
      }
      const dateText = [
        calvingDate.getFullYear(),
        String(calvingDate.getMonth() + 1).padStart(2, '0'),
        String(calvingDate.getDate()).padStart(2, '0'),
      ].join('-');
      const supplementalNote = candidate.note
        .replace(/^補足\s*[：:]?\s*/, '')
        .trim();
      const calvingResult = calvingResultOptions.find((result) =>
        supplementalNote.includes(result),
      );
      const memo = [
        candidate.activityTime ? `確認時刻：${candidate.activityTime}` : '',
        supplementalNote,
      ]
        .filter(Boolean)
        .join(' ');
      const searchParams = new URLSearchParams({
        cattleId: String(cattle.id),
        targetNumber: cattle.earTag,
        targetName: cattle.name,
        actualCalvingDate: dateText,
        memo,
      });

      if (calvingResult) {
        searchParams.set('calvingResult', calvingResult);
      }

      navigate(`/calvings/new?${searchParams.toString()}`);
    } catch {
      setBreedingError(
        '牛台帳を取得できませんでした。時間をおいてもう一度お試しください。',
      );
    } finally {
      setIsOpeningBreeding(false);
    }
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
          setBreedingError('');
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

          <p>耳標番号：{candidate.animalNumber || '未判定'}</p>
          <p>日付：{candidate.activityDate || '未判定'}</p>
          <p>活動区分：{candidate.activityType || '未判定'}</p>
          <p>時刻：{candidate.activityTime || '未判定'}</p>
          <p>補足：{candidate.note || '未判定'}</p>

          <button
            type="button"
            disabled
            style={{ marginTop: 12, padding: '10px 20px' }}
          >
            確認して保存
          </button>

          {(candidate.activityType === '発情' ||
            candidate.activityType === '授精') && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={openBreedingForm}
                disabled={
                  isOpeningBreeding ||
                  !candidate.animalNumber ||
                  !candidate.activityDate ||
                  !candidate.activityType
                }
                style={{ padding: '10px 20px' }}
              >
                {isOpeningBreeding
                  ? '牛台帳を確認中...'
                  : '繁殖記録画面で確認'}
              </button>
            </div>
          )}

          {candidate.activityType === '治療' && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={openTreatmentForm}
                disabled={
                  isOpeningBreeding ||
                  !candidate.animalNumber ||
                  !candidate.activityDate ||
                  !candidate.activityType
                }
                style={{ padding: '10px 20px' }}
              >
                {isOpeningBreeding
                  ? '牛台帳を確認中...'
                  : '治療記録画面で確認'}
              </button>
            </div>
          )}

          {candidate.activityType === '分娩' && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={openCalvingForm}
                disabled={
                  isOpeningBreeding ||
                  !candidate.animalNumber ||
                  !candidate.activityDate ||
                  !candidate.activityType
                }
                style={{ padding: '10px 20px' }}
              >
                {isOpeningBreeding
                  ? '牛台帳を確認中...'
                  : '分娩記録画面で確認'}
              </button>
            </div>
          )}

          {breedingError && (
            <p role="alert" style={{ color: '#c62828', fontWeight: 700 }}>
              {breedingError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
