import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { requestCoachInsights } from '../services/apiService';
import './AICoachPanel.css';

const VIEW_CONTEXT_COPY = {
  dashboard: { topic: 'your dashboard overview', placeholder: 'dashboard trends' },
  expenses: { topic: 'your expenses', placeholder: 'your expenses' },
  categories: { topic: 'your categories', placeholder: 'category spending' },
  manage: { topic: 'your budgets and goals', placeholder: 'budgets or goals' },
  'income-savings': { topic: 'income and savings', placeholder: 'income or savings' },
  log: { topic: 'logging expenses', placeholder: 'recent uploads or manual entries' },
  settings: { topic: 'your settings', placeholder: 'settings or preferences' }
};

const getContextCopy = (view) => VIEW_CONTEXT_COPY[view] || { topic: 'your finances', placeholder: 'your finances' };

function AICoachPanel({
  isOpen,
  onClose,
  analysisData,
  analysisKey,
  onRefreshHandled,
  onAssistantMessage,
  contextView = 'dashboard'
}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const lastAnalysisKeyRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wasOpenRef = useRef(false);
  const conversationContextRef = useRef(null);

  const contextCopy = useMemo(() => getContextCopy(contextView), [contextView]);
  const greetingMessage = useMemo(() => `Hello! Need any help with ${contextCopy.topic}?`, [contextCopy.topic]);
  const enrichedAnalysis = useMemo(() => {
    if (!analysisData) {
      return null;
    }
    return {
      ...analysisData,
      context: {
        activeView: contextView
      }
    };
  }, [analysisData, contextView]);

  const hasConversation = useMemo(() => messages.length > 0, [messages.length]);
  const hasUserQuestion = useMemo(
    () => messages.some(message => message.role === 'user'),
    [messages]
  );

  const fetchInsights = useCallback(async ({ userMessage, retry = false } = {}) => {
    if (!enrichedAnalysis) {
      return;
    }

    conversationContextRef.current = contextView;

    const baseConversation = messages.map(message => ({
      role: message.role,
      content: message.content
    }));

    const conversationPayload = userMessage
      ? [...baseConversation, { role: 'user', content: userMessage }]
      : baseConversation;

    if (!userMessage && !retry && conversationPayload.length === 0) {
      return;
    }

    if (userMessage) {
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await requestCoachInsights({
        conversation: conversationPayload,
        analysis: enrichedAnalysis
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.message
      };

      setMessages(prev => [...prev, assistantMessage]);
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
  }, [analysisKey, contextView, enrichedAnalysis, messages, onAssistantMessage, onRefreshHandled]);

  useEffect(() => {
    if (analysisKey === undefined) {
      return;
    }
    if (analysisKey !== lastAnalysisKeyRef.current && hasUserQuestion) {
      setNeedsRefresh(true);
    }
  }, [analysisKey, hasUserQuestion]);

  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        const shouldReset = conversationContextRef.current !== contextView || messages.length === 0;
        if (shouldReset) {
          setMessages([{ role: 'assistant', content: greetingMessage }]);
          setNeedsRefresh(false);
        }
        setError(null);
        conversationContextRef.current = contextView;
        lastAnalysisKeyRef.current = analysisKey ?? null;
      }
      wasOpenRef.current = true;
    } else {
      wasOpenRef.current = false;
    }
  }, [analysisKey, contextView, greetingMessage, isOpen, messages.length]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isLoading]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    const text = inputRef.current?.value?.trim();
    if (!text) {
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    void fetchInsights({ userMessage: text });
  };

  const handleRetry = () => {
    void fetchInsights({ retry: true });
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
            <p>The coach is ready whenever you are. Ask a question to get started.</p>
          </div>
        )}

        {needsRefresh && !error && hasUserQuestion && (
          <div className="ai-coach__notice">
            <p>New data is available. Ask another question to refresh the insights.</p>
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
          placeholder={`Ask the coach about ${contextCopy.placeholder}...`}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}

export default AICoachPanel;
