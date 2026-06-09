import { useState, useEffect } from 'react';
import { DAYS_CONFIG } from '../data/days';

const STORAGE_KEY = 'cdvrs_planner_v1';

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
      tasks: cfg.defaultTasks.map(t => ({ text: t, done: false })),
      blocks: cfg.defaultBlocks.map(b => ({ ...b })),
    };
  });
  return { goals: [], notes: '', days };
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
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
        saveToStorage({ weeks: next });
        return next;
      });
    }
  }, [wk]);

  useEffect(() => {
    saveToStorage({ weeks });
  }, [weeks]);

  const week = weeks[wk] || initWeekData(weekStart);

  function updateWeek(fn) {
    setWeeks(prev => {
      const updated = { ...prev, [wk]: fn(prev[wk] || initWeekData(weekStart)) };
      return updated;
    });
  }

  function updateDay(dk, fn) {
    updateWeek(w => ({
      ...w,
      days: { ...w.days, [dk]: fn(w.days[dk]) },
    }));
  }

  return {
    weekStart,
    weekOffset,
    setWeekOffset,
    wk,
    week,
    addGoal: text => updateWeek(w => ({ ...w, goals: [...w.goals, { text, done: false }] })),
    toggleGoal: i => updateWeek(w => ({ ...w, goals: w.goals.map((g, idx) => idx === i ? { ...g, done: !g.done } : g) })),
    deleteGoal: i => updateWeek(w => ({ ...w, goals: w.goals.filter((_, idx) => idx !== i) })),
    setNotes: v => updateWeek(w => ({ ...w, notes: v })),
    addTask: (dk, text) => updateDay(dk, d => ({ ...d, tasks: [...d.tasks, { text, done: false }] })),
    toggleTask: (dk, i) => updateDay(dk, d => ({ ...d, tasks: d.tasks.map((t, idx) => idx === i ? { ...t, done: !t.done } : t) })),
    deleteTask: (dk, i) => updateDay(dk, d => ({ ...d, tasks: d.tasks.filter((_, idx) => idx !== i) })),
    addBlock: (dk, time, label) => updateDay(dk, d => ({ ...d, blocks: [...d.blocks, { time, label }] })),
    deleteBlock: (dk, i) => updateDay(dk, d => ({ ...d, blocks: d.blocks.filter((_, idx) => idx !== i) })),
  };
}