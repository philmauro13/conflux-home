import React, { useState } from 'react';
import type { SignalThread, SignalThreadEntry } from '../../types';

interface SignalThreadProps {
  threads: SignalThread[];
  onCreateThread?: (topic: string) => void;
}

function PredictionCard({ prediction, confidence }: { prediction: string; confidence: number }) {
  return (
    <div className="current-signal-prediction">
      <strong>AI Prediction</strong> ({confidence}% confidence)
      <p>{prediction}</p>
    </div>
  );
}

function TimelineEntry({ entry, index }: { entry: SignalThreadEntry; index: number }) {
  return (
    <div className="current-signal-timeline-item">
      <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '2px' }}>
        {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
      <div>{entry.summary}</div>
    </div>
  );
}

function ThreadCard({ thread }: { thread: SignalThread }) {
  return (
    <div className="current-signal-thread">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 className="current-signal-title">{thread.topic}</h4>
        <span className="current-signal-count">{thread.entries_count} entries</span>
      </div>
      <p className="current-signal-summary">{thread.summary}</p>
      <div className="current-signal-timeline">
        {thread.entries.map((entry, idx) => (
          <TimelineEntry key={idx} entry={entry} index={idx} />
        ))}
      </div>
      {thread.prediction && (
        <PredictionCard prediction={thread.prediction} confidence={thread.prediction_confidence} />
      )}
    </div>
  );
}

export default function SignalThread({ threads, onCreateThread }: SignalThreadProps) {
  const [newTopic, setNewTopic] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleCreate = () => {
    if (newTopic.trim() && onCreateThread) {
      onCreateThread(newTopic.trim());
      setNewTopic('');
      setShowInput(false);
    }
  };

  return (
    <div className="current-signals">
      <div className="current-signals-header">
        <h3>Signal Threads</h3>
        {onCreateThread && (
          <button
            onClick={() => setShowInput(!showInput)}
            style={{
              background: 'var(--accent, #0088ff)',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            + New Thread
          </button>
        )}
      </div>
      {showInput && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Thread topic..."
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: 'inherit',
              fontSize: '0.9rem',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} style={{
            background: 'var(--accent, #0088ff)',
            border: 'none',
            color: '#fff',
            borderRadius: '8px',
            padding: '8px 16px',
            cursor: 'pointer',
          }}>
            Create
          </button>
        </div>
      )}
      {threads.length === 0 ? (
        <p style={{ opacity: 0.5, padding: '1rem' }}>No signal threads yet.</p>
      ) : (
        threads.map((thread) => <ThreadCard key={thread.id} thread={thread} />)
      )}
    </div>
  );
}
