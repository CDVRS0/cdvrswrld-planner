import { useState, useEffect } from 'react';
import { DAYS_CONFIG } from '../data/days';

const STORAGE_KEY = 'cdvrs_planner_v3';

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
        time: b.time,
        label: b.label,
        emoji: b.emoji,
        tasks: b.tasks.map(t => ({ text: t, done: false })),
      })),
    };
  });
  return { goals: [], notes: '', days };
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
    if (!weeks[wk]) {
      setWeeks(prev => {
        const next = { ...prev, [wk]: initWeekData(weekStart) };
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ weeks: next }));
        return next;
      });
    }
  }, [wk]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ weeks }));
  }, [weeks]);

  const week = weeks[wk] || initWeekData(weekStart);

  function updateWeek(fn) {
    setWeeks(prev => ({ ...prev, [wk]: fn(prev[wk] || initWeekData(weekStart)) }));
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
    addGoal: t => updateWeek(w => ({ ...w, goals: [...w.goals, { text: t, done: false }] })),
    toggleGoal: i => updateWeek(w => ({ ...w, goals: w.goals.map((g, idx) => idx === i ? { ...g, done: !g.done } : g) })),
    deleteGoal: i => updateWeek(w => ({ ...w, goals: w.goals.filter((_, idx) => idx !== i) })),
    setNotes: v => updateWeek(w => ({ ...w, notes: v })),
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
      ...d, blocks: [...d.blocks, { time, label, emoji: '📌', tasks: [] }],
    })),
    deleteBlock: (dk, bi) => updateDay(dk, d => ({
      ...d, blocks: d.blocks.filter((_, i) => i !== bi),
    })),
  };
}