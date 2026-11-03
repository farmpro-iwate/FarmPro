import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAiRecordFormDraft, getAiRecordFormValues } from './recordFormDraft';
import { useAiRecordFormDraft } from './useAiRecordFormDraft';

function owner(farmId = 'draft-farm') {
  localStorage.setItem('farmpro.authUser', JSON.stringify({ id: 'draft-user', farmId, plan: 'free' }));
}

function Form({ editing = false }: { editing?: boolean }) {
  const ai = useAiRecordFormDraft('expense', !editing);
  const [description, setDescription] = useState(() => editing ? '保存済みの内容' : getAiRecordFormValues<{ description: string }>(ai.draft).description || '');
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <input aria-label="内容" value={description} onChange={e => setDescription(e.target.value)} />
    <pre data-testid="router-state">{JSON.stringify(location.state)}</pre>
    <button onClick={() => navigate('/next')}>次へ</button>
    <button onClick={() => { try { ai.assertCurrent(); setError('確認済み'); } catch (cause) { setError((cause as Error).message); } }}>確認</button>
    {error && <p role="alert">{error}</p>}
  </>;
}
function Next() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>戻る</button>;
}
function mount(editing = false) {
  const draft = createAiRecordFormDraft({ kind: 'expense', sourceText: '修理代', fields: { description: '修理代' } });
  return render(<MemoryRouter initialEntries={[{ pathname: '/form', state: { farmproAiDraft: draft, unrelated: 'kept' } }]}>
    <Routes><Route path="/form" element={<Form editing={editing} />} /><Route path="/next" element={<Next />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => owner());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('AI下書きの画面間引き継ぎ', () => {
  it('初回だけ候補を適用し、履歴には他のstateだけを残して手入力を維持する', async () => {
    mount();
    expect(screen.getByLabelText('内容')).toHaveValue('修理代');
    await waitFor(() => expect(screen.getByTestId('router-state')).toHaveTextContent('{"unrelated":"kept"}'));
    fireEvent.change(screen.getByLabelText('内容'), { target: { value: '利用者が修正した内容' } });
    fireEvent.click(screen.getByText('確認'));
    expect(screen.getByLabelText('内容')).toHaveValue('利用者が修正した内容');
  });

  it('画面を離れてブラウザで戻っても、消費済み候補をもう一度入れない', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('router-state')).not.toHaveTextContent('farmproAiDraft'));
    fireEvent.click(screen.getByText('次へ'));
    fireEvent.click(await screen.findByText('戻る'));
    expect(await screen.findByLabelText('内容')).toHaveValue('');
  });

  it('編集画面に渡された候補では保存済みの内容を上書きしない', async () => {
    mount(true);
    await waitFor(() => expect(screen.getByTestId('router-state')).not.toHaveTextContent('farmproAiDraft'));
    expect(screen.getByLabelText('内容')).toHaveValue('保存済みの内容');
  });

  it('初期表示後に農場が変わった候補を確認済みとして扱わない', async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId('router-state')).not.toHaveTextContent('farmproAiDraft'));
    owner('other-draft-farm');
    fireEvent.click(screen.getByText('確認'));
    expect(screen.getByRole('alert')).toHaveTextContent('利用者または農場が変わりました');
  });
});
