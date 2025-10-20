import React, { useEffect, useMemo, useRef, useState } from 'react';
import { requestCoachInsights } from '../services/apiService';
import './AICoachPanel.css';

const AUTO_REFRESH_PROMPT = 'Please review the latest expense snapshot and share updated insights for the user.';

function AICoachPanel({
  isOpen,
  onClose,
  analysisData,
  analysisKey,
  onRefreshHandled,
  onAssistantMessage
}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lastAnalysisKeyRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!analysisKey) {
      return;
    }
    if (analysisKey !== lastAnalysisKeyRef.current) {
      setNeedsRefresh(true);
    }
  }, [analysisKey]);

  useEffect(() => {
    if (isOpen && needsRefresh) {
      void fetchInsights({ mode: 'auto' });
    }
  }, [isOpen, needsRefresh]);

  useEffect(() => {
    if (isOpen && messages.length === 0 && analysisData) {
      void fetchInsights({ mode: 'auto' });
    }
  }, [isOpen, analysisData, messages.length]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isLoading]);

  const hasConversation = useMemo(() => messages.length > 0, [messages.length]);

  const fetchInsights = async ({ mode, userMessage } = {}) => {
    if (!analysisData) {
      return;
    }

    const isAuto = mode === 'auto';
    const baseConversation = messages.map(message => ({
      role: message.role,
      content: message.content
    }));

    const payloadConversation = isAuto && baseConversation.length === 0
      ? []
      : baseConversation;

    const conversationWithPrompt = isAuto
      ? [...payloadConversation, { role: 'user', content: AUTO_REFRESH_PROMPT }]
      : userMessage
        ? [...payloadConversation, { role: 'user', content: userMessage }]
        : payloadConversation;

    if (userMessage) {
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await requestCoachInsights({
        conversation: conversationWithPrompt,
        analysis: analysisData
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.message
      };

      setMessages(prev => [...(userMessage ? prev : baseConversation), assistantMessage]);
      setNeedsRefresh(false);
      lastAnalysisKeyRef.current = analysisKey;
      if (onRefreshHandled) {
        onRefreshHandled();
      }
      if (onAssistantMessage) {
        onAssistantMessage(assistantMessage);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch insights');
      setNeedsRefresh(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!analysisData || isLoading) {
      return;
    }
    const text = inputRef.current?.value?.trim();
    if (!text) {
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    void fetchInsights({ mode: 'user', userMessage: text });
  };

  const handleRetry = () => {
    void fetchInsights({ mode: 'auto' });
  };

  return (
    <div className={`ai-coach ${isOpen ? 'open' : ''}`}>
      <div className="ai-coach__header">
        <div>
          <h3>AI Coach</h3>
          <span className="ai-coach__subtitle">Personal insights from your spending data</span>
        </div>
        <button className="ai-coach__close" onClick={onClose} aria-label="Close AI Coach">
          ✕
        </button>
      </div>

      <div className="ai-coach__body" ref={listRef}>
        {!hasConversation && !isLoading && !error && (
          <div className="ai-coach__placeholder">
            <p>Open the coach to generate insights from your latest expenses.</p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`ai-coach__message ai-coach__message--${message.role}`}
          >
            {message.content.split('\n').map((line, lineIndex) => (
              <span key={lineIndex}>
                {line}
                {lineIndex !== message.content.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
        ))}

        {isLoading && (
          <div className="ai-coach__message ai-coach__message--assistant ai-coach__message--typing">
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </div>
        )}

        {error && (
          <div className="ai-coach__error">
            <p>{error}</p>
            <button onClick={handleRetry}>Try again</button>
          </div>
        )}
      </div>

      <form className="ai-coach__form" onSubmit={handleSubmit}>
        <input
          type="text"
          ref={inputRef}
          placeholder="Ask the coach a question about your spending..."
          disabled={isLoading || !analysisData}
        />
        <button type="submit" disabled={isLoading || !analysisData}>
          Send
        </button>
      </form>
    </div>
  );
}

export default AICoachPanel;
