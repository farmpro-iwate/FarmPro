import { useState } from 'react';

type ActivityCandidate = {
  animalNumber: string;
  heatDate: string;
  inseminationTime: string;
};

export function AiActivityEntry() {
  const [inputText, setInputText] = useState('');
  const [candidate, setCandidate] = useState<ActivityCandidate | null>(null);

  const createCandidate = () => {
    const animalNumber = inputText.match(/(\d+)番/)?.[1] ?? '';
    const inseminationTime = inputText.match(/(午前|午後)?\s*(\d+)時/)?.[0] ?? '';

    setCandidate({
      animalNumber,
      heatDate: inputText.includes('今日') ? '今日' : '',
      inseminationTime,
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>AIで活動登録</h1>

      <p>
        現場で行った内容を文章で入力し、登録候補を作成します。
        現在は試作段階で、まだ本物のAIには接続していません。
      </p>

      <label htmlFor="activityText" style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>
        活動内容
      </label>

      <textarea
        id="activityText"
        value={inputText}
        onChange={(event) => setInputText(event.target.value)}
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