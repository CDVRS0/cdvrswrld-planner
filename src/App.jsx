import { useState } from 'react';
import { DAYS_CONFIG } from './data/days';
import { usePlanner, dateKey } from './hooks/usePlanner';
import './App.css';

function formatRange(ws) {
  const we = new Date(ws);
  we.setDate(we.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(ws)} – ${fmt(we)}`;
}

function isToday(d) {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function GoalsPanel({ goals, onAdd, onToggle, onDelete }) {
  const [input, setInput] = useState('');
  const submit = () => {
    if (!input.trim()) return;
    onAdd(input.trim());
    setInput('');
  };
  return (
    <div className="panel">
      <div className="panel-title">🎯 Weekly Goals</div>
      {goals.map((g, i) => (
        <div key={i} className={`goal-item${g.done ? ' done' : ''}`}>
          <input type="checkbox" checked={g.done} onChange={() => onToggle(i)} />
          <span>{g.text}</span>
          <button className="del-btn" onClick={() => onDelete(i)}>×</button>
        </div>
      ))}
      <div className="input-row">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Add a goal..." />
        <button onClick={submit}>Add</button>
      </div>
    </div>
  );
}

function NotesPanel({ notes, onChange }) {
  return (
    <div className="panel">
      <div className="panel-title">📝 Notes</div>
      <textarea className="notes-ta" value={notes} onChange={e => onChange(e.target.value)} placeholder="Thoughts, ideas, reminders..." />
    </div>
  );
}

function DayColumn({ cfg, dayDate, dayData, onAddTask, onToggleTask, onDeleteTask, onAddBlock, onDeleteBlock }) {
  const [taskInput, setTaskInput] = useState('');
  const [blockInput, setBlockInput] = useState('');
  const dk = dateKey(dayDate);
  const today = isToday(dayDate);
  const dateStr = dayDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const submitTask = () => {
    if (!taskInput.trim()) return;
    onAddTask(dk, taskInput.trim());
    setTaskInput('');
  };

  const submitBlock = () => {
    if (!blockInput.trim()) return;
    const parts = blockInput.trim().match(/^(\S+(?:\s*–\s*\S+)?)\s+(.+)$/);
    if (parts) onAddBlock(dk, parts[1], parts[2]);
    else onAddBlock(dk, '', blockInput.trim());
    setBlockInput('');
  };

  return (
    <div className={`day-col${today ? ' today' : ''}`}>
      <div className="day-header">
        <div className="day-name">{cfg.emoji} {cfg.short}{today && <span className="today-badge">today</span>}</div>
        <div className="day-theme">{cfg.theme}</div>
        <div className="day-date">{dateStr}</div>
      </div>

      <div className="day-section">
        <div className="section-label">Tasks</div>
        {dayData.tasks.map((t, i) => (
          <div key={i} className={`task-item${t.done ? ' done' : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => onToggleTask(dk, i)} />
            <span>{t.text}</span>
            <button className="del-btn" onClick={() => onDeleteTask(dk, i)}>×</button>
          </div>
        ))}
        <div className="mini-input-row">
          <input value={taskInput} onChange={e => setTaskInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitTask()} placeholder="Add task..." />
          <button onClick={submitTask}>+</button>
        </div>
      </div>

      <div className="day-section">
        <div className="section-label">Time blocks</div>
        {dayData.blocks.map((b, i) => (
          <div key={i} className="time-block">
            <div className="tb-time">{b.time}</div>
            <div className="tb-label">{b.label}</div>
            <button className="del-btn tb-del" onClick={() => onDeleteBlock(dk, i)}>×</button>
          </div>
        ))}
        <div className="mini-input-row">
          <input value={blockInput} onChange={e => setBlockInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitBlock()} placeholder="10am–12pm label" />
          <button onClick={submitBlock}>+</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const p = usePlanner();

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="logo">CDVRSWRLD</div>
          <div className="tagline">Create Your World — Weekly Planner</div>
        </div>
        <div className="week-nav">
          <button onClick={() => p.setWeekOffset(o => o - 1)}>&#8592;</button>
          <span className="week-label">{formatRange(p.weekStart)}</span>
          <button onClick={() => p.setWeekOffset(o => o + 1)}>&#8594;</button>
        </div>
      </header>

      <div className="top-panels">
        <GoalsPanel goals={p.week.goals} onAdd={p.addGoal} onToggle={p.toggleGoal} onDelete={p.deleteGoal} />
        <NotesPanel notes={p.week.notes} onChange={p.setNotes} />
      </div>

      <div className="days-grid">
        {DAYS_CONFIG.map((cfg, i) => {
          const d = new Date(p.weekStart);
          d.setDate(d.getDate() + i);
          const dk = dateKey(d);
          return (
            <DayColumn
              key={dk}
              cfg={cfg}
              dayDate={d}
              dayData={p.week.days[dk] || { tasks: [], blocks: [] }}
              onAddTask={p.addTask}
              onToggleTask={p.toggleTask}
              onDeleteTask={p.deleteTask}
              onAddBlock={p.addBlock}
              onDeleteBlock={p.deleteBlock}
            />
          );
        })}
      </div>
    </div>
  );
}