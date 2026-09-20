import { useState, useEffect } from 'react';
import { DAYS_CONFIG } from './data/days';
import { usePlanner, dateKey } from './hooks/usePlanner';
import './App.css';

const FLOW_STEPS = [
  { key: 'nature', label: 'Nature', number: '01' },
  { key: 'plan', label: 'Plan', number: '02' },
  { key: 'work', label: 'Work', number: '03' },
  { key: 'social', label: 'Social', number: '04' },
  { key: 'creative', label: 'Creative', number: '05' },
  { key: 'reading', label: 'Reading', number: '06A' },
  { key: 'bible', label: 'Bible', number: '06B' },
  { key: 'handoff', label: 'Handoff', number: '07' },
  { key: 'review', label: 'Review', number: '08' },
];

const FIELD_GROUPS = {
  nature: [
    ['feeling', 'How are you feeling?'],
    ['energy', 'Energy'],
    ['mind', "What's on your mind?"],
    ['physical', 'Nature / physical check'],
    ['intention', "Today's personal intention"],
    ['reflection', 'AI reflection notes'],
    ['ask', 'Ask the Nature Agent'],
  ],
  plan: [
    ['objective', 'Main objective today'],
    ['morning', 'Morning'],
    ['afternoon', 'Afternoon'],
    ['evening', 'Evening'],
    ['ask', 'Ask the Daily Planning Agent'],
  ],
  work: [
    ['focus', 'Relevant work today'],
    ['firstAction', 'What should happen first?'],
    ['waitingOn', 'Waiting on'],
    ['ask', 'Ask the Work Agent'],
  ],
  social: [
    ['content', "Today's content"],
    ['adapt', 'Adaptation plan'],
    ['published', 'Published / checked off'],
    ['results', 'What was posted?'],
    ['ask', 'Ask the Social Agent'],
  ],
  creative: [
    ['focus', 'Creative focus'],
    ['project', 'Current project'],
    ['notes', 'Creative notes'],
    ['ask', 'Ask the Creative Agent'],
  ],
  reading: [
    ['book', 'Current book'],
    ['pages', 'Chapter / pages'],
    ['notes', 'Notes'],
    ['questions', 'Questions'],
    ['ask', 'Ask about the reading'],
  ],
  bible: [
    ['book', 'Book'],
    ['chapter', 'Chapter / passage'],
    ['notes', 'Study notes'],
    ['reflection', 'Reflection'],
    ['prayer', 'Prayer'],
    ['ask', 'Ask about the passage'],
  ],
  handoff: [
    ['summary', 'Context for the next agent'],
    ['carryForward', 'Carried forward'],
    ['remember', 'Remember tomorrow'],
  ],
  review: [
    ['done', 'What got done?'],
    ['notDone', 'What did not?'],
    ['waitingOn', 'What am I waiting on?'],
    ['carryForward', 'What needs carrying forward?'],
    ['learned', 'What did I learn?'],
    ['tomorrow', "Tomorrow's first priority"],
  ],
};

function formatRange(ws) {
  const we = new Date(ws);
  we.setDate(we.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(ws)} - ${fmt(we)}`;
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

function getTasks(week) {
  return Object.values(week.days).flatMap(day => day.blocks.flatMap(block => block.tasks));
}

function dayStats(dayData) {
  const tasks = dayData.blocks.flatMap(block => block.tasks);
  const done = tasks.filter(task => task.done).length;
  return {
    done,
    total: tasks.length,
    pct: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

function CheckItem({ item, onToggle, onDelete }) {
  return (
    <div className={`check-item${item.done ? ' done' : ''}`}>
      <input type="checkbox" checked={item.done} onChange={onToggle} />
      <span>{item.text}</span>
      <button className="icon-btn danger" type="button" onClick={onDelete} aria-label="Delete item">x</button>
    </div>
  );
}

function RecordField({ label, value, onChange, singleLine }) {
  return (
    <label className="record-field">
      <span>{label}</span>
      {singleLine ? (
        <input value={value || ''} onChange={e => onChange(e.target.value)} />
      ) : (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} />
      )}
    </label>
  );
}

function HandoffPanel({ record, activeKey }) {
  const nature = record.nature || {};
  const plan = record.plan || {};
  const handoff = record.handoff || {};
  const lowEnergy = nature.energy && /low|tired|drained|flat|slow/i.test(nature.energy);

  return (
    <aside className="agent-panel">
      <span className="eyebrow">AI handoff</span>
      <h3>{activeKey === 'nature' ? 'Start clean' : 'Context carried forward'}</h3>
      <p>
        {activeKey === 'nature'
          ? 'This stage captures your state before the work starts.'
          : 'Later agents should use your state, intention, objective, and carried-forward context before suggesting action.'}
      </p>
      <div className="handoff-list">
        <div><strong>Energy</strong><span>{nature.energy || 'Not recorded yet'}</span></div>
        <div><strong>Intention</strong><span>{nature.intention || 'Not recorded yet'}</span></div>
        <div><strong>Main objective</strong><span>{plan.objective || 'Not planned yet'}</span></div>
        <div><strong>Carry forward</strong><span>{handoff.carryForward || 'Nothing captured yet'}</span></div>
      </div>
      {lowEnergy && (
        <p className="agent-note">Energy looks low, so the plan should bias toward high-value first actions and fewer open loops.</p>
      )}
    </aside>
  );
}

function GuidedStep({ block, dayData, dk, p }) {
  const [input, setInput] = useState('');
  const record = dayData.record?.[block.stepKey] || {};
  const fields = FIELD_GROUPS[block.stepKey] || [];
  const done = block.tasks.filter(task => task.done).length;
  const pct = block.tasks.length === 0 ? 0 : Math.round((done / block.tasks.length) * 100);
  const blockIndex = dayData.blocks.findIndex(item => item.stepKey === block.stepKey);
  const submit = () => {
    if (!input.trim()) return;
    p.addTask(dk, blockIndex, input.trim());
    setInput('');
  };

  return (
    <section className={`guided-step ${block.layer}`}>
      <div className="guided-main">
        <div className="step-heading">
          <span className="step-number">{block.time}</span>
          <div>
            <span className="eyebrow">{block.agent}</span>
            <h2>{block.label}</h2>
          </div>
          <strong>{done}/{block.tasks.length}</strong>
        </div>
        <div className="day-progress-bar"><div className="day-progress-fill" style={{ width: `${pct}%` }} /></div>
        <div className="step-grid">
          <div className="step-checklist">
            {block.tasks.map((task, taskIndex) => (
              <CheckItem
                key={`${block.stepKey}-${task.text}-${taskIndex}`}
                item={task}
                onToggle={() => p.toggleTask(dk, blockIndex, taskIndex)}
                onDelete={() => p.deleteTask(dk, blockIndex, taskIndex)}
              />
            ))}
            <div className="mini-input-row">
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Add action..." />
              <button type="button" onClick={submit}>Add</button>
            </div>
          </div>
          <div className="record-grid">
            {fields.map(([field, label]) => (
              <RecordField
                key={`${block.stepKey}-${field}`}
                label={label}
                value={record[field]}
                singleLine={['energy', 'book', 'chapter', 'pages'].includes(field)}
                onChange={value => p.updateDayRecord(dk, block.stepKey, field, value)}
              />
            ))}
          </div>
        </div>
      </div>
      <HandoffPanel record={dayData.record || {}} activeKey={block.stepKey} />
    </section>
  );
}

function StartDay({ cfg, dateStr, stats, onContinue }) {
  return (
    <section className="start-day">
      <span className="eyebrow">{dateStr}</span>
      <h1>Good morning, Cam.</h1>
      <p>Here's your day. Let's go through it one stage at a time.</p>
      <div className="start-summary">
        <div><strong>{cfg.theme}</strong><span>{cfg.focus}</span></div>
        <div><strong>{stats.done}/{stats.total}</strong><span>Daily record checks complete</span></div>
      </div>
      <button className="primary-action" type="button" onClick={onContinue}>Continue</button>
    </section>
  );
}

function GuidedDay({ cfg, dayDate, dayData, p }) {
  const [activeStep, setActiveStep] = useState('start');
  const dk = dateKey(dayDate);
  const stats = dayStats(dayData);
  const dateStr = dayDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const currentIndex = FLOW_STEPS.findIndex(step => step.key === activeStep);
  const currentBlock = dayData.blocks.find(block => block.stepKey === activeStep);

  const goNext = () => {
    if (activeStep === 'start') {
      setActiveStep(FLOW_STEPS[0].key);
      return;
    }
    setActiveStep(FLOW_STEPS[Math.min(currentIndex + 1, FLOW_STEPS.length - 1)].key);
  };

  const goBack = () => {
    if (currentIndex <= 0) {
      setActiveStep('start');
      return;
    }
    setActiveStep(FLOW_STEPS[currentIndex - 1].key);
  };

  return (
    <main className="guided-day-layout">
      <nav className="flow-rail" aria-label="Daily OS flow">
        <button type="button" className={activeStep === 'start' ? 'active' : ''} onClick={() => setActiveStep('start')}>Start</button>
        {FLOW_STEPS.map(step => (
          <button key={step.key} type="button" className={activeStep === step.key ? 'active' : ''} onClick={() => setActiveStep(step.key)}>
            <span>{step.number}</span>{step.label}
          </button>
        ))}
      </nav>

      <div className="guided-stage">
        {activeStep === 'start' ? (
          <StartDay cfg={cfg} dateStr={dateStr} stats={stats} onContinue={goNext} />
        ) : (
          <GuidedStep block={currentBlock} dayData={dayData} dk={dk} p={p} />
        )}

        <div className="step-controls">
          <button type="button" onClick={goBack} disabled={activeStep === 'start'}>Back</button>
          <button type="button" onClick={goNext} disabled={activeStep === FLOW_STEPS.at(-1).key}>Continue</button>
        </div>
      </div>
    </main>
  );
}

function WeeklySection({ section, p }) {
  const [input, setInput] = useState('');
  const done = section.items.filter(item => item.done).length;
  const total = section.items.length;
  const submit = () => {
    if (!input.trim()) return;
    p.addWeeklyItem(section.key, input.trim());
    setInput('');
  };

  return (
    <article className={`weekly-section ${section.key}`}>
      <div className="weekly-section-head">
        <div>
          <span className="eyebrow">{section.emoji}</span>
          <h3>{section.label}</h3>
          <p>{section.description}</p>
        </div>
        <strong>{done}/{total}</strong>
      </div>
      <div className="section-list">
        {section.items.map((item, index) => (
          <CheckItem
            key={`${section.key}-${item.text}-${index}`}
            item={item}
            onToggle={() => p.toggleWeeklyItem(section.key, index)}
            onDelete={() => p.deleteWeeklyItem(section.key, index)}
          />
        ))}
      </div>
      <div className="mini-input-row">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder={`Add to ${section.label.toLowerCase()}...`} />
        <button type="button" onClick={submit}>Add</button>
      </div>
    </article>
  );
}

function WeekView({ p, weekStart }) {
  const tasks = getTasks(p.week);
  const done = tasks.filter(task => task.done).length;
  const pct = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  return (
    <main className="weekly-layout">
      <section className="week-overview">
        <span className="eyebrow">Week of {formatRange(weekStart)}</span>
        <h1>Weekly OS Control Centre</h1>
        <p>Weekly records sit above daily records. This is where intention, objectives, projects, people, and review stay visible.</p>
        <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: `${pct}%` }} /></div>
      </section>
      <section className="weekly-grid">
        {p.week.weeklySections.map(section => (
          <WeeklySection key={section.key} section={section} p={p} />
        ))}
      </section>
      <section className="notes-panel">
        <div>
          <span className="eyebrow">AI context</span>
          <h3>OS Notes</h3>
        </div>
        <textarea className="notes-ta" value={p.week.notes} onChange={e => p.setNotes(e.target.value)} placeholder="Notion links, decisions, source-of-truth notes, agent context..." />
      </section>
    </main>
  );
}

const Icons = {
  week: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  day: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/><circle cx="12" cy="12" r="4"/></svg>,
};

export default function App() {
  const p = usePlanner();
  const [theme, toggleTheme] = useTheme();
  const [viewMode, setViewMode] = useState('day');
  const [activeDayIdx, setActiveDayIdx] = useState(() => {
    const dow = new Date().getDay();
    return dow === 0 ? 6 : dow - 1;
  });

  const getDayDate = i => {
    const d = new Date(p.weekStart);
    d.setDate(d.getDate() + i);
    return d;
  };

  const activeDate = getDayDate(activeDayIdx);
  const activeKey = dateKey(activeDate);
  const activeDayData = p.week.days[activeKey] || { blocks: [], record: {} };
  const activeCfg = DAYS_CONFIG[activeDayIdx];

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="logo">CDVRSWRLD OS</div>
          <div className="tagline">Start Day {'>'} Nature {'>'} Plan {'>'} Work {'>'} Social {'>'} Review</div>
        </div>
        <div className="header-right">
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label="Toggle theme">{theme === 'dark' ? 'Light' : 'Dark'}</button>
          <div className="view-toggle" role="group" aria-label="OS view">
            <button type="button" className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>Day</button>
            <button type="button" className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>Week</button>
          </div>
          <div className="week-nav">
            <button type="button" onClick={() => p.setWeekOffset(o => o - 1)} aria-label="Previous week">←</button>
            <span className="week-label">{formatRange(p.weekStart)}</span>
            <button type="button" onClick={() => p.setWeekOffset(o => o + 1)} aria-label="Next week">→</button>
          </div>
        </div>
      </header>

      <div className="day-tabs">
        {DAYS_CONFIG.map((cfg, i) => {
          const d = getDayDate(i);
          return (
            <button
              key={cfg.name}
              type="button"
              className={`day-tab${activeDayIdx === i ? ' active' : ''}${isToday(d) ? ' today-tab' : ''}`}
              onClick={() => {
                setActiveDayIdx(i);
                setViewMode('day');
              }}
            >
              <span>{cfg.short}</span>
              <small>{cfg.theme}</small>
            </button>
          );
        })}
      </div>

      {viewMode === 'day' ? (
        <GuidedDay cfg={activeCfg} dayDate={activeDate} dayData={activeDayData} p={p} />
      ) : (
        <WeekView p={p} weekStart={p.weekStart} />
      )}

      <nav className="bottom-nav" aria-label="Mobile view">
        <div className="bottom-nav-inner">
          <button type="button" className={`nav-btn${viewMode === 'day' ? ' active' : ''}`} onClick={() => setViewMode('day')}>
            {Icons.day}<span>Day</span>
          </button>
          <button type="button" className={`nav-btn${viewMode === 'week' ? ' active' : ''}`} onClick={() => setViewMode('week')}>
            {Icons.week}<span>Week</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
