import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  assertAiRecordFormDraftOwner,
  readAiRecordFormDraft,
  type AiRecordFormKind,
} from './recordFormDraft';

/** A draft initializes a new form once; it is never a persisted business record. */
export function useAiRecordFormDraft(
  kind: AiRecordFormKind | readonly AiRecordFormKind[],
  enabled = true,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const [draft] = useState(() => enabled ? readAiRecordFormDraft(location.state, kind) : null);
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    const state = location.state;
    if (!state || typeof state !== 'object' || !Object.prototype.hasOwnProperty.call(state, 'farmproAiDraft')) return;
    consumed.current = true;
    const { farmproAiDraft: _draft, ...rest } = state;
    // Remove the handoff from browser history after initialization. Reload/back
    // must not unexpectedly re-apply an old candidate over later form input.
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: Object.keys(rest).length ? rest : null,
    });
  }, [location, navigate]);

  return useMemo(() => ({
    draft: enabled ? draft : null,
    assertCurrent: () => { if (enabled) assertAiRecordFormDraftOwner(draft); },
  }), [draft, enabled]);
}
