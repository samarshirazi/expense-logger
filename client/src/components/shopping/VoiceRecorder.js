import React, { useEffect, useRef, useState } from 'react';

/**
 * Records audio via MediaRecorder. Calls onComplete(blob, mimeType, durationSec)
 * when the user stops, or onCancel if they back out.
 *
 * Has four states: idle → recording → done. The "Stop" button is the
 * primary action while recording.
 */
export default function VoiceRecorder({ onComplete, onCancel, maxSeconds = 60 }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'recording' | 'denied' | 'unsupported'
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef('audio/webm');
  const startedAtRef = useRef(0);
  const tickerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTicker();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* noop */ }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  function pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
    if (typeof MediaRecorder === 'undefined') return null;
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c;
      } catch { /* skip */ }
    }
    return '';
  }

  function startTicker() {
    startedAtRef.current = Date.now();
    setElapsed(0);
    tickerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(sec);
      if (sec >= maxSeconds) {
        stop();
      }
    }, 200);
  }

  function stopTicker() {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }

  async function start() {
    setError(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('mic denied:', err);
      setStatus('denied');
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    if (mimeType === null) {
      setStatus('unsupported');
      return;
    }
    mimeTypeRef.current = mimeType || 'audio/webm';

    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      setError('Could not start recording: ' + err.message);
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stopTicker();
      const duration = (Date.now() - startedAtRef.current) / 1000;
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onComplete?.(blob, mimeTypeRef.current, duration);
    };
    recorder.onerror = (e) => {
      setError('Recorder error: ' + (e.error?.message || 'unknown'));
      setStatus('idle');
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };

    mediaRecorderRef.current = recorder;
    recorder.start(250); // capture in 250ms chunks
    startTicker();
    setStatus('recording');
  }

  function stop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  if (status === 'unsupported') {
    return (
      <div className="voice-recorder">
        <p className="muted">Audio recording isn't supported in this browser. Try Chrome or Safari.</p>
        <button type="button" onClick={onCancel}>Close</button>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="voice-recorder">
        <p className="muted">
          Microphone access was blocked. Allow it in your browser settings and try again.
        </p>
        <button type="button" onClick={onCancel}>Close</button>
      </div>
    );
  }

  const fmtTime = `${String(Math.floor(elapsed / 60)).padStart(1, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="voice-recorder">
      {error && <div className="error-banner">{error}</div>}

      {status === 'idle' && (
        <>
          <p>Tap the mic and say what you need to buy. You can mix English and Hindi.</p>
          <button type="button" className="mic-button" onClick={start} aria-label="Start recording">
            🎤
          </button>
          <p className="muted small">Up to {maxSeconds}s.</p>
          <button type="button" onClick={onCancel}>Cancel</button>
        </>
      )}

      {status === 'recording' && (
        <>
          <p className="recording-status">
            <span className="recording-dot" /> Recording… {fmtTime}
          </p>
          <button type="button" className="mic-button stop" onClick={stop} aria-label="Stop recording">
            ⏹
          </button>
          <p className="muted small">Tap to stop. We'll show you what we heard before saving.</p>
        </>
      )}
    </div>
  );
}
