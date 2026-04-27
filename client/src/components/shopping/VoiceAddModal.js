import React, { useState } from 'react';
import VoiceRecorder from './VoiceRecorder';
import { useHousehold } from '../../contexts/HouseholdContext';
import {
  transcribeShoppingVoice,
  addShoppingItems,
  listShoppingLists,
} from '../../services/householdApi';

/**
 * Orchestrates the voice-add flow:
 *
 *   record → uploading → confirming → saving → done
 *
 * Nothing is saved until the user clicks "Confirm & add" — that's the
 * reconfirmation philosophy. Items are editable in the confirm step:
 * the user can rename, change quantity, delete rows, or move an item to
 * a different list (using the AI's suggestion as a hint).
 */
export default function VoiceAddModal({ initialListId, onClose, onSaved }) {
  const { activeHouseholdId } = useHousehold();
  const [phase, setPhase] = useState('record'); // 'record' | 'uploading' | 'confirm' | 'saving' | 'error'
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [language, setLanguage] = useState(null);
  const [items, setItems] = useState([]);
  const [allLists, setAllLists] = useState([]);
  const [defaultListId, setDefaultListId] = useState(initialListId);

  async function handleRecorded(blob, mimeType, durationSec) {
    if (!blob || blob.size === 0) {
      setError('No audio captured. Try again.');
      setPhase('record');
      return;
    }
    if (durationSec < 0.5) {
      setError('Recording too short. Try again and speak for at least a second.');
      setPhase('record');
      return;
    }
    setPhase('uploading');
    setError(null);
    try {
      const filename = mimeType?.includes('mp4') ? 'voice.mp4' : 'voice.webm';
      const [result, lists] = await Promise.all([
        transcribeShoppingVoice(activeHouseholdId, blob, filename),
        listShoppingLists(activeHouseholdId),
      ]);
      setTranscript(result.transcript || '');
      setLanguage(result.language);
      setAllLists(lists);

      // Resolve each parsed item's target list. If the AI suggested a
      // store name that matches one of our lists (case-insensitive), use
      // that list's id; otherwise fall back to the list the user opened.
      const lookup = new Map(
        lists.map((l) => [String(l.name).toLowerCase(), l.id])
      );
      const seeded = (result.items || []).map((it) => {
        const matched =
          it.suggested_list && lookup.get(String(it.suggested_list).toLowerCase());
        return {
          tempId: Math.random().toString(36).slice(2),
          ...it,
          target_list_id: matched || initialListId,
        };
      });
      setItems(seeded);
      setPhase('confirm');
    } catch (err) {
      setError(err.message || 'Transcription failed');
      setPhase('record');
    }
  }

  function updateItem(tempId, patch) {
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)));
  }

  function removeItem(tempId) {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  }

  async function handleConfirm() {
    if (items.length === 0) {
      onClose?.();
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      // Group items by target list and dispatch one POST per list.
      const groups = new Map();
      for (const it of items) {
        const lid = it.target_list_id || defaultListId;
        if (!groups.has(lid)) groups.set(lid, []);
        groups.get(lid).push({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          notes: it.notes,
          source: 'voice',
        });
      }
      const created = [];
      for (const [listId, payload] of groups.entries()) {
        if (!listId) continue;
        const res = await addShoppingItems(listId, payload);
        if (res?.items) created.push({ listId, items: res.items });
      }
      onSaved?.(created);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to save items');
      setPhase('confirm');
    }
  }

  function handleReRecord() {
    setItems([]);
    setTranscript('');
    setLanguage(null);
    setPhase('record');
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal voice-modal" onClick={(e) => e.stopPropagation()}>
        <header className="voice-modal-header">
          <h2>Add by voice</h2>
          <button type="button" className="link-back" onClick={onClose}>✕</button>
        </header>

        {phase === 'record' && (
          <VoiceRecorder onComplete={handleRecorded} onCancel={onClose} />
        )}

        {phase === 'uploading' && (
          <div className="voice-loading">
            <div className="spinner" />
            <p>Transcribing and parsing items…</p>
            <p className="muted small">Whisper + GPT, usually 2-5 seconds.</p>
          </div>
        )}

        {phase === 'confirm' && (
          <div className="voice-confirm">
            {transcript && (
              <div className="transcript-box">
                <span className="muted small">
                  Heard{language ? ` (${language})` : ''}:
                </span>
                <p>"{transcript}"</p>
              </div>
            )}

            {error && <div className="error-banner">{error}</div>}

            {items.length === 0 ? (
              <p className="muted">No items detected. Try recording again.</p>
            ) : (
              <ul className="confirm-items">
                {items.map((it) => (
                  <li key={it.tempId} className="confirm-row">
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => updateItem(it.tempId, { name: e.target.value })}
                      className="confirm-name"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={it.quantity ?? 1}
                      onChange={(e) => updateItem(it.tempId, { quantity: Number(e.target.value) || 1 })}
                      className="confirm-qty"
                    />
                    <input
                      type="text"
                      placeholder="unit"
                      value={it.unit || ''}
                      onChange={(e) => updateItem(it.tempId, { unit: e.target.value })}
                      className="confirm-unit"
                    />
                    {allLists.length > 1 ? (
                      <select
                        value={it.target_list_id || defaultListId || ''}
                        onChange={(e) => updateItem(it.tempId, { target_list_id: e.target.value })}
                        className="confirm-list"
                      >
                        {allLists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.store_icon || ''} {l.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button
                      type="button"
                      className="link-danger"
                      onClick={() => removeItem(it.tempId)}
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {allLists.length > 1 && items.length > 0 && (
              <label className="default-list-row">
                <span className="muted small">Default list for new items:</span>
                <select
                  value={defaultListId || ''}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDefaultListId(next);
                    setItems((prev) =>
                      prev.map((it) => ({
                        ...it,
                        target_list_id: it.target_list_id || next,
                      }))
                    );
                  }}
                >
                  {allLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.store_icon || ''} {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="modal-actions">
              <button type="button" onClick={handleReRecord}>Re-record</button>
              <button type="button" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="primary"
                onClick={handleConfirm}
                disabled={items.length === 0}
              >
                Confirm &amp; add ({items.length})
              </button>
            </div>
          </div>
        )}

        {phase === 'saving' && (
          <div className="voice-loading">
            <div className="spinner" />
            <p>Saving…</p>
          </div>
        )}
      </div>
    </div>
  );
}
