import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import '../styles/google.css';

// ── Types ──

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  colorId?: string;
}

interface EmailThread {
  id: string;
  subject: string;
  from: string;
  date: string;
  labels: string[];
  messageCount: number;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  due?: string;
  notes?: string;
  completed?: string;
}

// ── Helpers ──

function formatEventTime(ev: CalendarEvent): string {
  const dt = ev.start?.dateTime;
  if (!dt) return 'All day';
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatEventDate(ev: CalendarEvent): string {
  const dt = ev.start?.dateTime || ev.start?.date;
  if (!dt) return '';
  const d = new Date(dt);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function getFileIcon(mimeType: string): string {
  if (mimeType.includes('document')) return '📄';
  if (mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('presentation')) return '📽️';
  if (mimeType.includes('folder')) return '📁';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('image')) return '🖼️';
  return '📎';
}

function getTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function isUnread(email: EmailThread): boolean {
  return email.labels?.includes('UNREAD');
}

// ── Component ──

export default function GoogleView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [emails, setEmails] = useState<EmailThread[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'calendar' | 'gmail' | 'drive' | 'tasks'>('overview');
  const [nlInput, setNlInput] = useState('');
  const [nlResult, setNlResult] = useState<string | null>(null);
  const [nlLoading, setNlLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, em, dr, tk] = await Promise.allSettled([
        invoke<any>('google_get_events', { days: 7 }),
        invoke<any>('google_get_emails', { query: 'in:inbox', limit: 15 }),
        invoke<any>('google_get_drive_files', { limit: 12 }),
        invoke<any>('google_get_tasks'),
      ]);

      if (ev.status === 'fulfilled') {
        const arr = Array.isArray(ev.value) ? ev.value : (ev.value?.events ?? []);
        setEvents(arr);
      }
      if (em.status === 'fulfilled') {
        setEmails(Array.isArray(em.value) ? em.value : []);
      }
      if (dr.status === 'fulfilled') {
        setFiles(Array.isArray(dr.value) ? dr.value : []);
      }
      if (tk.status === 'fulfilled') {
        const taskData = tk.value;
        const taskArr = Array.isArray(taskData?.tasks) ? taskData.tasks : [];
        setTasks(taskArr);
      }

      const failures = [ev, em, dr, tk].filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        console.warn('Some Google fetches failed:', failures);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleNLCommand = async () => {
    if (!nlInput.trim()) return;
    setNlLoading(true);
    setNlResult(null);
    try {
      const parsed = await invoke<any>('google_create_event_nl', { nlText: nlInput });
      setNlResult(JSON.stringify(parsed, null, 2));
      setNlInput('');
    } catch (e) {
      setNlResult(`Error: ${e}`);
    } finally {
      setNlLoading(false);
    }
  };

  const unreadCount = emails.filter(isUnread).length;
  const todayEvents = events.filter(e => formatEventDate(e) === 'Today');
  const upcomingEvents = events.filter(e => formatEventDate(e) !== 'Today');

  return (
    <div className="google-view">
      {/* Hero Header */}
      <div className="google-hero">
        <div className="google-hero-glow" />
        <div className="google-hero-content">
          <div className="google-hero-icon">🔍</div>
          <h1 className="google-hero-title">Google Center</h1>
          <p className="google-hero-sub">Your workspace, at a glance</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="google-tabs">
        {[
          { id: 'overview' as const, label: 'Overview', icon: '◈' },
          { id: 'calendar' as const, label: 'Calendar', icon: '📅', badge: todayEvents.length || undefined },
          { id: 'gmail' as const, label: 'Mail', icon: '✉️', badge: unreadCount || undefined },
          { id: 'drive' as const, label: 'Drive', icon: '📂' },
          { id: 'tasks' as const, label: 'Tasks', icon: '☑️', badge: tasks.filter(t => t.status !== 'completed').length || undefined },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`google-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="google-tab-icon">{tab.icon}</span>
            <span className="google-tab-label">{tab.label}</span>
            {tab.badge && <span className="google-tab-badge">{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* NL Command Bar */}
      <div className="google-nl-bar">
        <input
          className="google-nl-input"
          placeholder='Try: "add meeting tomorrow at 2pm" or "show my unread emails"'
          value={nlInput}
          onChange={(e) => setNlInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleNLCommand()}
          disabled={nlLoading}
        />
        <button className="google-nl-send" onClick={handleNLCommand} disabled={nlLoading || !nlInput.trim()}>
          {nlLoading ? '...' : '⚡'}
        </button>
      </div>
      {nlResult && (
        <div className="google-nl-result">
          <pre>{nlResult}</pre>
          <button onClick={() => setNlResult(null)} className="google-nl-dismiss">✕</button>
        </div>
      )}

      {/* Content Area */}
      <div className="google-content">
        {loading ? (
          <div className="google-loading">
            <div className="google-loading-pulse" />
            <span>Loading your workspace...</span>
          </div>
        ) : error ? (
          <div className="google-error">{error}</div>
        ) : (
          <>
            {/* ── Overview ── */}
            {activeTab === 'overview' && (
              <div className="google-overview-grid">
                {/* Today's Schedule */}
                <div className="google-card google-card-calendar">
                  <div className="google-card-header">
                    <span className="google-card-icon">📅</span>
                    <h3>Today's Schedule</h3>
                    <button className="google-card-action" onClick={() => setActiveTab('calendar')}>View all →</button>
                  </div>
                  <div className="google-card-body">
                    {todayEvents.length === 0 ? (
                      <div className="google-empty">No events today 🎉</div>
                    ) : (
                      todayEvents.slice(0, 4).map((ev) => (
                        <div key={ev.id} className="google-event-row">
                          <div className="google-event-time">{formatEventTime(ev)}</div>
                          <div className="google-event-info">
                            <div className="google-event-title">{ev.summary}</div>
                            {ev.description && <div className="google-event-desc">{ev.description.slice(0, 80)}...</div>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Unread Mail */}
                <div className="google-card google-card-mail">
                  <div className="google-card-header">
                    <span className="google-card-icon">✉️</span>
                    <h3>Unread Mail</h3>
                    <span className="google-card-count">{unreadCount}</span>
                    <button className="google-card-action" onClick={() => setActiveTab('gmail')}>View all →</button>
                  </div>
                  <div className="google-card-body">
                    {emails.filter(isUnread).slice(0, 5).length === 0 ? (
                      <div className="google-empty">Inbox zero! ✨</div>
                    ) : (
                      emails.filter(isUnread).slice(0, 5).map((email) => (
                        <div key={email.id} className="google-email-row">
                          <div className="google-email-dot" />
                          <div className="google-email-info">
                            <div className="google-email-from">{email.from.split('<')[0].trim()}</div>
                            <div className="google-email-subject">{email.subject}</div>
                          </div>
                          <div className="google-email-time">{getTimeAgo(email.date)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recent Files */}
                <div className="google-card google-card-drive">
                  <div className="google-card-header">
                    <span className="google-card-icon">📂</span>
                    <h3>Recent Files</h3>
                    <button className="google-card-action" onClick={() => setActiveTab('drive')}>View all →</button>
                  </div>
                  <div className="google-card-body">
                    {files.slice(0, 5).length === 0 ? (
                      <div className="google-empty">No recent files</div>
                    ) : (
                      files.slice(0, 5).map((file) => (
                        <a key={file.id} href={file.webViewLink} target="_blank" rel="noreferrer" className="google-file-row">
                          <span className="google-file-icon">{getFileIcon(file.mimeType)}</span>
                          <div className="google-file-info">
                            <div className="google-file-name">{file.name}</div>
                            <div className="google-file-time">{getTimeAgo(file.modifiedTime)}</div>
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                </div>

                {/* Tasks */}
                <div className="google-card google-card-tasks">
                  <div className="google-card-header">
                    <span className="google-card-icon">☑️</span>
                    <h3>Tasks</h3>
                    <button className="google-card-action" onClick={() => setActiveTab('tasks')}>View all →</button>
                  </div>
                  <div className="google-card-body">
                    {tasks.filter(t => t.status !== 'completed').slice(0, 5).length === 0 ? (
                      <div className="google-empty">All tasks done! 🎯</div>
                    ) : (
                      tasks.filter(t => t.status !== 'completed').slice(0, 5).map((task) => (
                        <div key={task.id} className="google-task-row">
                          <div className="google-task-check">○</div>
                          <div className="google-task-info">
                            <div className="google-task-title">{task.title}</div>
                            {task.due && <div className="google-task-due">Due: {new Date(task.due).toLocaleDateString()}</div>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Calendar ── */}
            {activeTab === 'calendar' && (
              <div className="google-section">
                <div className="google-section-header">
                  <h2>📅 Upcoming Events</h2>
                  <button className="google-refresh-btn" onClick={fetchData}>↻ Refresh</button>
                </div>
                {events.length === 0 ? (
                  <div className="google-empty-state">No upcoming events</div>
                ) : (
                  <div className="google-events-list">
                    {events.map((ev) => (
                      <div key={ev.id} className="google-event-card">
                        <div className="google-event-card-time">
                          <div className="google-event-card-date">{formatEventDate(ev)}</div>
                          <div className="google-event-card-hour">{formatEventTime(ev)}</div>
                        </div>
                        <div className="google-event-card-body">
                          <div className="google-event-card-title">{ev.summary}</div>
                          {ev.description && <div className="google-event-card-desc">{ev.description}</div>}
                          {ev.htmlLink && (
                            <a href={ev.htmlLink} target="_blank" rel="noreferrer" className="google-event-card-link">
                              Open in Google Calendar →
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Gmail ── */}
            {activeTab === 'gmail' && (
              <div className="google-section">
                <div className="google-section-header">
                  <h2>✉️ Inbox</h2>
                  <button className="google-refresh-btn" onClick={fetchData}>↻ Refresh</button>
                </div>
                {emails.length === 0 ? (
                  <div className="google-empty-state">No emails found</div>
                ) : (
                  <div className="google-emails-list">
                    {emails.map((email) => (
                      <div key={email.id} className={`google-email-card ${isUnread(email) ? 'unread' : ''}`}>
                        <div className="google-email-card-dot" />
                        <div className="google-email-card-body">
                          <div className="google-email-card-top">
                            <span className="google-email-card-from">{email.from.split('<')[0].trim()}</span>
                            <span className="google-email-card-time">{getTimeAgo(email.date)}</span>
                          </div>
                          <div className="google-email-card-subject">{email.subject}</div>
                          <div className="google-email-card-meta">
                            {email.labels?.filter(l => !l.startsWith('CATEGORY_') && l !== 'INBOX' && l !== 'UNREAD').map(l => (
                              <span key={l} className="google-email-label">{l}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Drive ── */}
            {activeTab === 'drive' && (
              <div className="google-section">
                <div className="google-section-header">
                  <h2>📂 Recent Files</h2>
                  <button className="google-refresh-btn" onClick={fetchData}>↻ Refresh</button>
                </div>
                {files.length === 0 ? (
                  <div className="google-empty-state">No files found</div>
                ) : (
                  <div className="google-files-grid">
                    {files.map((file) => (
                      <a key={file.id} href={file.webViewLink} target="_blank" rel="noreferrer" className="google-file-card">
                        <div className="google-file-card-icon">{getFileIcon(file.mimeType)}</div>
                        <div className="google-file-card-name">{file.name}</div>
                        <div className="google-file-card-time">{getTimeAgo(file.modifiedTime)}</div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tasks ── */}
            {activeTab === 'tasks' && (
              <div className="google-section">
                <div className="google-section-header">
                  <h2>☑️ Google Tasks</h2>
                  <button className="google-refresh-btn" onClick={fetchData}>↻ Refresh</button>
                </div>
                {tasks.length === 0 ? (
                  <div className="google-empty-state">No tasks found</div>
                ) : (
                  <div className="google-tasks-list">
                    {tasks.map((task) => (
                      <div key={task.id} className={`google-task-card ${task.status === 'completed' ? 'completed' : ''}`}>
                        <div className="google-task-card-check">
                          {task.status === 'completed' ? '●' : '○'}
                        </div>
                        <div className="google-task-card-body">
                          <div className="google-task-card-title">{task.title}</div>
                          {task.notes && <div className="google-task-card-notes">{task.notes}</div>}
                          {task.due && <div className="google-task-card-due">Due: {new Date(task.due).toLocaleDateString()}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
