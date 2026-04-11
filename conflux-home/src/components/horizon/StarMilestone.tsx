import { useState, useCallback } from 'react';
import type { DreamMilestone, DreamTask } from '../../types';

interface StarMilestoneProps {
  milestone: DreamMilestone;
  tasks: DreamTask[];
  onCompleteMilestone: (id: string) => void;
  onCompleteTask: (id: string) => void;
  onClose: () => void;
}

export default function StarMilestone({
  milestone,
  tasks,
  onCompleteMilestone,
  onCompleteTask,
  onClose,
}: StarMilestoneProps) {
  const [showTasks, setShowTasks] = useState(false);

  const handleComplete = useCallback(async () => {
    await onCompleteMilestone(milestone.id);
  }, [milestone.id, onCompleteMilestone]);

  return (
    <div className="star-milestone-card">
      <div className="star-milestone-header">
        <div className="star-milestone-star">
          <span className={milestone.is_completed ? 'amber' : 'cyan'}>
            {milestone.is_completed ? '⭐' : '✨'}
          </span>
        </div>
        <div className="star-milestone-title-section">
          <h3 className="star-milestone-title">{milestone.title}</h3>
          {milestone.target_date && (
            <span className="star-milestone-date">{milestone.target_date}</span>
          )}
        </div>
        <button className="star-milestone-close" onClick={onClose}>
          ×
        </button>
      </div>

      {milestone.description && (
        <p className="star-milestone-desc">{milestone.description}</p>
      )}

      <div className="star-milestone-status">
        <span className={`star-milestone-badge ${milestone.is_completed ? 'complete' : 'pending'}`}>
          {milestone.is_completed ? '✓ Illuminated' : '○ Pending'}
        </span>
      </div>

      {!milestone.is_completed && (
        <button
          className="star-milestone-complete-btn"
          onClick={handleComplete}
        >
          Illuminate Star
        </button>
      )}

      {/* Sub-tasks toggle */}
      {tasks.length > 0 && (
        <div className="star-milestone-tasks">
          <button
            className="star-milestone-tasks-toggle"
            onClick={() => setShowTasks(!showTasks)}
          >
            {showTasks ? '▼' : '▶'} Sub-tasks ({tasks.length})
          </button>
          {showTasks && (
            <div className="star-milestone-task-list">
              {tasks.map((task) => (
                <div key={task.id} className={`star-milestone-task ${task.is_completed ? 'completed' : ''}`}>
                  <button
                    className="star-milestone-task-check"
                    onClick={() => onCompleteTask(task.id)}
                  >
                    {task.is_completed ? '☑' : '☐'}
                  </button>
                  <span className="star-milestone-task-title">{task.title}</span>
                  {task.due_date && (
                    <span className="star-milestone-task-date">{task.due_date}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
