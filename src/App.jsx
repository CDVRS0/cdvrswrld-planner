import { useState, useEffect } from 'react';
import { DAYS_CONFIG } from './data/days';
import { usePlanner, dateKey } from './hooks/usePlanner';
import './App.css';

function formatRange(ws) {
  const we = new Date(ws); we.setDate(we.getDate() + 6);
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
  return [theme, () => setTheme(t => t === 'dark' ? 'light' : 'dark')];
}

// ── Stats bar ──────────────────────────────────────────────
function WeekProgress({ week, weekStart }) {
  let total = 0, done = 0;
  DAYS_CONFIG.forEach((_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const day = week.days[dateKey(d)];
    if (day) day.blocks.forEach(b => { total += b.tasks.length; done += b.tasks.filter(t => t.done).length; });
  });
  const goalsDone = week.goals.filter(g => g.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="week-progress">
      <div className="progress-header">
        <span className="progress-title">Week Progress</span>
        <span className="progress-pct">{pct}%</span>
      </div>
      <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
      <div className="progress-stats">
        <div className="stat-card"><div className="stat-value">{done}</div><div className="stat-label">Tasks done</div></div>
        <div className="stat-card"><div className="stat-value">{total - done}</div><div className="stat-label">Remaining</div></div>
        <div className="stat-card"><div className="stat-value">{goalsDone}/{week.goals.length}</div><div className="stat-label">Goals hit</div></div>
        <div className="stat-card"><div className="stat-value">{pct}%</div><div className="stat-label">Complete</div></div>
      </div>
    </div>
  );
}

// ── Block card with linked tasks ───────────────────────────
function BlockCard({ block, dk, bi, onToggle, onAdd, onDelete, onDeleteBlock }) {
  const [input, setInput] = useState('');
  const done = block.tasks.filter(t => t.done).length;
  const total = block.tasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const submit = () => { if (!input.trim()) return; onAdd(dk, bi, input.trim()); setInput(''); };

  return (
    <div className="block-card">
      <div className="block-card-header">
        <div className="block-card-title">
          <span className="block-emoji">{block.emoji}</span>
          <div>
            <div className="block-label">{block.label}</div>
            <div className="block-time">{block.time}</div>
          </div>
        </div>
        <div className="block-header-right">
          <span className="block-count">{done}/{total}</span>
          <button className="del-btn" onClick={() => onDeleteBlock(dk, bi)}>×</button>
        </div>
      </div>
      {total > 0 && (
        <div className="block-progress-bar"><div className="block-progress-fill" style={{ width: `${pct}%` }} /></div>
      )}
      <div className="block-tasks">
        {block.tasks.map((t, ti) => (
          <div key={ti} className={`task-item${t.done ? ' done' : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => onToggle(dk, bi, ti)} />
            <span>{t.text}</span>
            <button className="del-btn" onClick={() => onDelete(dk, bi, ti)}>×</button>
          </div>
        ))}
        <div className="mini-input-row">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Add task..." />
          <button onClick={submit}>+</button>
        </div>
      </div>
    </div>
  );
}

// ── Full day view ──────────────────────────────────────────
function DayView({ cfg, dayDate, dayData, p, compact }) {
  const dk = dateKey(dayDate);
  const today = isToday(dayDate);
  const dateStr = dayDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const allTasks = dayData.blocks.flatMap(b => b.tasks);
  const done = allTasks.filter(t => t.done).length;
  const total = allTasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const [blockInput, setBlockInput] = useState('');

  const submitBlock = () => {
    if (!blockInput.trim()) return;
    const m = blockInput.trim().match(/^(.+?)\s{2,}(.+)$/);
    p.addBlock(dk, m ? m[1] : '', m ? m[2] : blockInput.trim());
    setBlockInput('');
  };

  return (
    <div className={`day-col${today ? ' today' : ''}${compact ? ' compact' : ''}`}>
      <div className="day-header">
        <div className="day-name">{cfg.emoji} {compact ? cfg.short : cfg.name}{today && <span className="today-badge">today</span>}</div>
        {!compact && <div className="day-theme">{cfg.theme}</div>}
        <div className="day-date">{dateStr} · {done}/{total}</div>
        <div className="day-progress-bar"><div className="day-progress-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="blocks-list">
        {dayData.blocks.map((b, bi) => (
          <BlockCard key={bi} block={b} dk={dk} bi={bi}
            onToggle={p.toggleTask} onAdd={p.addTask} onDelete={p.deleteTask} onDeleteBlock={p.deleteBlock} />
        ))}
      </div>
      <div className="mini-input-row add-block-row">
        <input value={blockInput} onChange={e => setBlockInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitBlock()}
          placeholder="Add block (e.g. 5pm–6pm  Label)" />
        <button onClick={submitBlock}>+</button>
      </div>
    </div>
  );
}

// ── Goals panel ────────────────────────────────────────────
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

// ── Icons ──────────────────────────────────────────────────
const Icons = {
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  stats:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 20h18M7 20V10M12 20V4M17 20v-7"/></svg>,
  goals:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>,
  notes:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
};

// ── App ────────────────────────────────────────────────────
export default function App() {
  const p = usePlanner();
  const [theme, toggleTheme] = useTheme();
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'day'
  const [activeDayIdx, setActiveDayIdx] = useState(() => {
    const dow = new Date().getDay();
    return dow === 0 ? 6 : dow - 1;
  });
  const [mobileTab, setMobileTab] = useState('calendar');

  const getDayDate = i => { const d = new Date(p.weekStart); d.setDate(d.getDate() + i); return d; };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="logo">CDVRSWRLD</div>
          <div className="tagline">Create Your World — Weekly Planner</div>
        </div>
        <div className="header-right">
          <button className="theme-toggle" onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          {/* View toggle */}
          <div className="view-toggle">
            <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>Week</button>
            <button className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>Day</button>
          </div>
          <div className="week-nav">
            <button onClick={() => p.setWeekOffset(o => o - 1)}>&#8592;</button>
            <span className="week-label">{formatRange(p.weekStart)}</span>
            <button onClick={() => p.setWeekOffset(o => o + 1)}>&#8594;</button>
          </div>
        </div>
      </header>

      <WeekProgress week={p.week} weekStart={p.weekStart} />

      {/* Day selector tabs (day view) */}
      {viewMode === 'day' && (
        <div className="day-tabs">
          {DAYS_CONFIG.map((cfg, i) => {
            const d = getDayDate(i);
            return (
              <button key={i} className={`day-tab${activeDayIdx === i ? ' active' : ''}${isToday(d) ? ' today-tab' : ''}`}
                onClick={() => setActiveDayIdx(i)}>
                {cfg.emoji} {cfg.short}
              </button>
            );
          })}
        </div>
      )}

      {/* Week view */}
      {viewMode === 'week' && (
        <>
          <div className="top-panels">
            <GoalsPanel goals={p.week.goals} onAdd={p.addGoal} onToggle={p.toggleGoal} onDelete={p.deleteGoal} />
            <NotesPanel notes={p.week.notes} onChange={p.setNotes} />
          </div>
          <div className="days-grid">
            {DAYS_CONFIG.map((cfg, i) => {
              const d = getDayDate(i);
              const dk = dateKey(d);
              return (
                <DayView key={dk} cfg={cfg} dayDate={d}
                  dayData={p.week.days[dk] || { blocks: [] }}
                  p={p} compact={true} />
              );
            })}
          </div>
        </>
      )}

      {/* Day view */}
      {viewMode === 'day' && (
        <div className="day-view-layout">
          <div className="day-view-main">
            {(() => {
              const cfg = DAYS_CONFIG[activeDayIdx];
              const d = getDayDate(activeDayIdx);
              const dk = dateKey(d);
              return (
                <DayView cfg={cfg} dayDate={d}
                  dayData={p.week.days[dk] || { blocks: [] }}
                  p={p} compact={false} />
              );
            })()}
          </div>
          <div className="day-view-side">
            <GoalsPanel goals={p.week.goals} onAdd={p.addGoal} onToggle={p.toggleGoal} onDelete={p.deleteGoal} />
            <NotesPanel notes={p.week.notes} onChange={p.setNotes} />
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
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