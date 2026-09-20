import { useState, useEffect, useMemo } from 'react';
import { DAYS_CONFIG, WEEKLY_OS_CONFIG } from '../data/days';

const STORAGE_KEY = 'cdvrs_planner_v5';

function getWeekStart(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function initWeekData(weekStart) {
  const days = {};
  DAYS_CONFIG.forEach((cfg, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dk = dateKey(d);
    days[dk] = {
      blocks: cfg.blocks.map(b => ({
        stepKey: b.stepKey,
        time: b.time,
        label: b.label,
        agent: b.agent,
        layer: b.layer,
        tasks: b.tasks.map(t => ({ text: t, done: false })),
      })),
      record: {
        nature: {
          feeling: '',
          energy: '',
          mind: '',
          physical: '',
          intention: '',
          ask: '',
          reflection: '',
        },
        plan: {
          objective: '',
          morning: '',
          afternoon: '',
          evening: '',
          ask: '',
        },
        work: {
          focus: '',
          firstAction: '',
          waitingOn: '',
          ask: '',
        },
        social: {
          content: '',
          adapt: '',
          published: '',
          results: '',
          ask: '',
        },
        creative: {
          focus: '',
          project: '',
          notes: '',
          ask: '',
        },
        reading: {
          book: 'Seat of the Soul',
          pages: '',
          notes: '',
          questions: '',
          ask: '',
        },
        bible: {
          book: '',
          chapter: '',
          notes: '',
          reflection: '',
          prayer: '',
          ask: '',
        },
        handoff: {
          summary: '',
          carryForward: '',
          remember: '',
        },
        review: {
          done: '',
          notDone: '',
          waitingOn: '',
          carryForward: '',
          learned: '',
          tomorrow: '',
        },
      },
    };
  });
  const weeklySections = WEEKLY_OS_CONFIG.map(section => ({
    key: section.key,
    label: section.label,
    emoji: section.emoji,
    description: section.description,
    items: section.items.map(text => ({ text, done: false })),
  }));
  return {
    notes: '',
    weeklySections,
    days,
  };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function usePlanner() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [weeks, setWeeks] = useState(() => loadFromStorage()?.weeks || {});

  const weekStart = getWeekStart(weekOffset);
  const wk = dateKey(weekStart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ weeks }));
  }, [weeks]);

  const week = useMemo(() => weeks[wk] || initWeekData(weekStart), [weekStart, weeks, wk]);

  function updateWeek(fn) {
    setWeeks(prev => ({ ...prev, [wk]: fn(prev[wk] || initWeekData(weekStart)) }));
  }

  function updateWeeklySection(sectionKey, fn) {
    updateWeek(w => ({
      ...w,
      weeklySections: w.weeklySections.map(section =>
        section.key === sectionKey ? fn(section) : section
      ),
    }));
  }

  function updateDay(dk, fn) {
    updateWeek(w => ({ ...w, days: { ...w.days, [dk]: fn(w.days[dk]) } }));
  }

  function updateBlock(dk, bi, fn) {
    updateDay(dk, d => ({
      ...d,
      blocks: d.blocks.map((b, i) => i === bi ? fn(b) : b),
    }));
  }

  return {
    weekStart, weekOffset, setWeekOffset, wk, week,
    addWeeklyItem: (sectionKey, text) => updateWeeklySection(sectionKey, section => ({
      ...section,
      items: [...section.items, { text, done: false }],
    })),
    toggleWeeklyItem: (sectionKey, itemIndex) => updateWeeklySection(sectionKey, section => ({
      ...section,
      items: section.items.map((item, idx) =>
        idx === itemIndex ? { ...item, done: !item.done } : item
      ),
    })),
    deleteWeeklyItem: (sectionKey, itemIndex) => updateWeeklySection(sectionKey, section => ({
      ...section,
      items: section.items.filter((_, idx) => idx !== itemIndex),
    })),
    setNotes: v => updateWeek(w => ({ ...w, notes: v })),
    updateDayRecord: (dk, sectionKey, field, value) => updateDay(dk, d => ({
      ...d,
      record: {
        ...d.record,
        [sectionKey]: {
          ...(d.record?.[sectionKey] || {}),
          [field]: value,
        },
      },
    })),
    toggleTask: (dk, bi, ti) => updateBlock(dk, bi, b => ({
      ...b, tasks: b.tasks.map((t, i) => i === ti ? { ...t, done: !t.done } : t),
    })),
    addTask: (dk, bi, text) => updateBlock(dk, bi, b => ({
      ...b, tasks: [...b.tasks, { text, done: false }],
    })),
    deleteTask: (dk, bi, ti) => updateBlock(dk, bi, b => ({
      ...b, tasks: b.tasks.filter((_, i) => i !== ti),
    })),
    addBlock: (dk, time, label) => updateDay(dk, d => ({
      ...d, blocks: [...d.blocks, { stepKey: 'custom', time, label, agent: 'Custom', layer: 'work', tasks: [] }],
    })),
    deleteBlock: (dk, bi) => updateDay(dk, d => ({
      ...d, blocks: d.blocks.filter((_, i) => i !== bi),
    })),
  };
}
