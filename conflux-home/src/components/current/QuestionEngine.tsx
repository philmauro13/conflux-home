import React, { useState } from 'react';
import type { QuestionResult } from '../../types';

interface QuestionEngineProps {
  onSubmit: (question: string) => void;
  result: QuestionResult | null;
  history: QuestionResult[];
  loading: boolean;
}

function ConfidenceIndicator({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colors: Record<string, string> = {
    high: '#00cc88',
    medium: '#ffaa00',
    low: '#ff6644',
  };
  return (
    <span style={{
      background: colors[level] + '22',
      color: colors[level],
      padding: '2px 10px',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: 600,
    }}>
      {level} confidence
    </span>
  );
}

function QuestionResultDisplay({ result }: { result: QuestionResult }) {
  return (
    <div className="current-question-result">
      <div className="current-question-result-header">
        <strong>{result.question}</strong>
        <ConfidenceIndicator level={result.confidence_level} />
      </div>
      <div className="current-question-result-body">
        <p>{result.answer}</p>
        {result.key_points.length > 0 && (
          <ul style={{ paddingLeft: '1.2rem', opacity: 0.85 }}>
            {result.key_points.map((point, i) => (
              <li key={i} style={{ marginBottom: '4px' }}>{point}</li>
            ))}
          </ul>
        )}
      </div>
      {result.sources.length > 0 && (
        <div className="current-question-sources">
          <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>Sources:</span>
          {result.sources.map((src, i) => (
            <span key={i} style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              {src}{i < result.sources.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuestionEngine({ onSubmit, result, history, loading }: QuestionEngineProps) {
  const [question, setQuestion] = useState('');
  const [selectedHistory, setSelectedHistory] = useState<QuestionResult | null>(null);

  const handleSubmit = () => {
    if (question.trim()) {
      onSubmit(question.trim());
      setQuestion('');
      setSelectedHistory(null);
    }
  };

  const displayResult = selectedHistory || result;

  return (
    <div className="current-question">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          className="current-question-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask anything..."
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={loading}
        />
        <button
          className="current-question-submit"
          onClick={handleSubmit}
          disabled={loading || !question.trim()}
          style={{ opacity: loading || !question.trim() ? 0.5 : 1 }}
        >
          {loading ? '...' : 'Ask'}
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
          Researching your question...
        </div>
      )}

      {displayResult && !loading && (
        <QuestionResultDisplay result={displayResult} />
      )}

      {history.length > 0 && (
        <div className="current-question-history">
          <h4 style={{ opacity: 0.6, fontSize: '0.8rem', marginBottom: '8px' }}>Previous Questions</h4>
          {history.map((item) => (
            <div
              key={item.id}
              className="current-question-history-item"
              onClick={() => setSelectedHistory(selectedHistory?.id === item.id ? null : item)}
              style={{
                cursor: 'pointer',
                opacity: selectedHistory?.id === item.id ? 1 : 0.7,
                borderLeft: selectedHistory?.id === item.id
                  ? '3px solid var(--accent, #0088ff)'
                  : '3px solid transparent',
              }}
            >
              <span>{item.question}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.4 }}>
                {new Date(item.asked_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
