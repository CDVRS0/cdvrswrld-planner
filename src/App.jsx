import { useState, useEffect } from 'react';
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

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('cdvrs_theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cdvrs_theme', theme);
  }, [theme]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return [theme, toggle];
}

function WeekProgress({ week, weekStart }) {
  let total = 0, done = 0, goalsDone = 0;
  DAYS_CONFIG.forEach((_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const dk = dateKey(d);
    const day = week.days[dk];
    if (day) { total += day.tasks.length; done += day.tasks.filter(t => t.done).length; }
  });
  goalsDone = week.goals.filter(g => g.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="week-progress">
      <div className="progress-header">
        <span className="progress-title">Week Progress</span>
        <span className="progress-pct">{pct}%</span>
      </div>
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-stats">
        <div className="stat-card"><div className="stat-value">{done}</div><div className="stat-label">Tasks done</div></div>
        <div className="stat-card"><div className="stat-value">{total - done}</div><div className="stat-label">Remaining</div></div>
        <div className="stat-card"><div className="stat-value">{goalsDone}/{week.goals.length}</div><div className="stat-label">Goals hit</div></div>
        <div className="stat-card"><div className="stat-value">{pct}%</div><div className="stat-label">Complete</div></div>
      </div>
    </div>
  );
}

function GoalsPanel({ goals, onAdd, onToggle, onDelete }) {
  const [input, setInput] = useState('');
  const submit = () => { if (!input.trim()) return; onAdd(input.trim()); setInput(''); };
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
  const doneTasks = dayData.tasks.filter(t => t.done).length;
  const totalTasks = dayData.tasks.length;
  const pct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  const submitTask = () => { if (!taskInput.trim()) return; onAddTask(dk, taskInput.trim()); setTaskInput(''); };
  const submitBlock = () => {
    if (!blockInput.trim()) return;
    const parts = blockInput.trim().match(/^(\S+(?:\s*[–-]\s*\S+)?)\s+(.+)$/);
    if (parts) onAddBlock(dk, parts[1], parts[2]);
    else onAddBlock(dk, '', blockInput.trim());
    setBlockInput('');
  };

  return (
    <div className={`day-col${today ? ' today' : ''}`}>
      <div className="day-header">
        <div className="day-name">{cfg.emoji} {cfg.short}{today && <span className="today-badge">today</span>}</div>
        <div className="day-theme">{cfg.theme}</div>
        <div className="day-date">{dateStr} · {doneTasks}/{totalTasks} done</div>
        <div className="day-progress-bar"><div className="day-progress-fill" style={{ width: `${pct}%` }} /></div>
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

function DaySwiper({ weekStart, week, onAddTask, onToggleTask, onDeleteTask, onAddBlock, onDeleteBlock }) {
  const todayIdx = () => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      if (isToday(d)) return i;
    }
    return 0;
  };
  const [idx, setIdx] = useState(todayIdx);
  const cfg = DAYS_CONFIG[idx];
  const d = new Date(weekStart); d.setDate(d.getDate() + idx);
  const dk = dateKey(d);
  const dayData = week.days[dk] || { tasks: [], blocks: [] };

  return (
    <div className="day-swiper">
      <div className="swiper-header">
        <button className="swiper-nav" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>&#8592;</button>
        <span className="swiper-day-label">{cfg.emoji} {cfg.name} — {cfg.theme}</span>
        <button className="swiper-nav" onClick={() => setIdx(i => Math.min(6, i + 1))} disabled={idx === 6}>&#8594;</button>
      </div>
      <DayColumn cfg={cfg} dayDate={d} dayData={dayData}
        onAddTask={onAddTask} onToggleTask={onToggleTask} onDeleteTask={onDeleteTask}
        onAddBlock={onAddBlock} onDeleteBlock={onDeleteBlock} />
    </div>
  );
}

// Bottom nav icons
const Icons = {
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  stats: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 20h18M7 20V10M12 20V4M17 20v-7"/></svg>,
  goals: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>,
  notes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
};

export default function App() {
  const p = usePlanner();
  const [theme, toggleTheme] = useTheme();
  const [mobileTab, setMobileTab] = useState('calendar');

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="logo">CDVRSWRLD</div>
          <div className="tagline">Create Your World — Weekly Planner</div>
        </div>
        <div className="header-right">
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="week-nav">
            <button onClick={() => p.setWeekOffset(o => o - 1)}>&#8592;</button>
            <span className="week-label">{formatRange(p.weekStart)}</span>
            <button onClick={() => p.setWeekOffset(o => o + 1)}>&#8594;</button>
          </div>
        </div>
      </header>

      {/* Desktop layout */}
      <WeekProgress week={p.week} weekStart={p.weekStart} />

      <div className="top-panels">
        <GoalsPanel goals={p.week.goals} onAdd={p.addGoal} onToggle={p.toggleGoal} onDelete={p.deleteGoal} />
        <NotesPanel notes={p.week.notes} onChange={p.setNotes} />
      </div>

      <div className="days-grid">
        {DAYS_CONFIG.map((cfg, i) => {
          const d = new Date(p.weekStart); d.setDate(d.getDate() + i);
          const dk = dateKey(d);
          return (
            <DayColumn key={dk} cfg={cfg} dayDate={d}
              dayData={p.week.days[dk] || { tasks: [], blocks: [] }}
              onAddTask={p.addTask} onToggleTask={p.toggleTask} onDeleteTask={p.deleteTask}
              onAddBlock={p.addBlock} onDeleteBlock={p.deleteBlock} />
          );
        })}
      </div>

      {/* Mobile layout */}
      <div className={`mobile-section${mobileTab === 'calendar' ? ' active' : ''}`}>
        <DaySwiper weekStart={p.weekStart} week={p.week}
          onAddTask={p.addTask} onToggleTask={p.toggleTask} onDeleteTask={p.deleteTask}
          onAddBlock={p.addBlock} onDeleteBlock={p.deleteBlock} />
      </div>

      <div className={`mobile-section${mobileTab === 'stats' ? ' active' : ''}`}>
        <WeekProgress week={p.week} weekStart={p.weekStart} />
      </div>

      <div className={`mobile-section${mobileTab === 'goals' ? ' active' : ''}`}>
        <GoalsPanel goals={p.week.goals} onAdd={p.addGoal} onToggle={p.toggleGoal} onDelete={p.deleteGoal} />
      </div>

      <div className={`mobile-section${mobileTab === 'notes' ? ' active' : ''}`}>
        <NotesPanel notes={p.week.notes} onChange={p.setNotes} />
      </div>

      {/* Bottom nav (mobile only) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {[['calendar','Week'], ['stats','Stats'], ['goals','Goals'], ['notes','Notes']].map(([tab, label]) => (
            <button key={tab} className={`nav-btn${mobileTab === tab ? ' active' : ''}`} onClick={() => setMobileTab(tab)}>
              {Icons[tab]}{label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}