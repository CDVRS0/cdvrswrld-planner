'use client';
import { useEffect, useId, useRef, useState } from 'react';

const SIZE = 88;
const bounded = (x, y) => ({ x: Math.max(8, Math.min(x, window.innerWidth - SIZE - 8)), y: Math.max(8, Math.min(y, window.innerHeight - SIZE - 8)) });
/** @param {{children?: import('react').ReactNode, title?: string, open?: boolean, onOpenChange?: (open: boolean) => void}} props */
export default function CeedAssistantLauncher({ children = null, title = 'CEED', open: controlledOpen, onOpenChange } = {}) {
  const [internalOpen, setInternalOpen] = useState(false), [opened, setOpened] = useState(false), [position, setPosition] = useState(null);
  const open = controlledOpen ?? internalOpen;
  const trigger = useRef(null), close = useRef(null), drag = useRef(null), suppressClick = useRef(false), wasOpen = useRef(false);
  const id = useId();
  function change(next) { if (next) setOpened(true); if (onOpenChange) onOpenChange(next); else setInternalOpen(next); }
  useEffect(() => {
    if (open) close.current?.focus(); else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    const resize = () => setPosition(p => p ? bounded(p.x, p.y) : null);
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, []);
  return <>
    <button ref={trigger} className="ceed-assistant-launcher" type="button" aria-label="Open CEED assistant" title="Chat with CEED · drag to move · Home resets position" aria-expanded={open} aria-controls={children ? id : undefined}
      style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const box = event.currentTarget.getBoundingClientRect(); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
        suppressClick.current = false; event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const d = drag.current; if (!d || event.pointerId !== d.id) return;
        const dx = event.clientX - d.x, dy = event.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 6) return;
        d.moved = true; setPosition(bounded(d.left + dx, d.top + dy));
      }}
      onPointerUp={event => { if (!drag.current || event.pointerId !== drag.current.id) return; suppressClick.current = drag.current.moved; drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
      onKeyDown={event => {
        if (event.key === 'Home') { event.preventDefault(); setPosition(null); }
        if (event.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
          event.preventDefault(); const box = event.currentTarget.getBoundingClientRect();
          setPosition(bounded(box.left + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0), box.top + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0)));
        }
        if (event.key === 'Escape' && open) change(false);
      }}
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } change(!open); }}>
      <span className="ceed-assistant-halo" aria-hidden="true" /><img src="/ceed-assistant.webp" width="80" height="80" alt="" draggable="false" /><span className="ceed-assistant-label" aria-hidden="true">CEED</span>
    </button>
    {children && opened && <section id={id} className="ceed-assistant-panel" hidden={!open} role="dialog" aria-modal="false" aria-label={title} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); change(false); } }}>
      <header className="ceed-assistant-heading"><div><strong>{title}</strong><small>A little clarity, wherever you are.</small></div><button ref={close} type="button" aria-label="Close CEED assistant" onClick={() => change(false)}>×</button></header>
      <div className="ceed-assistant-body">{children}</div>
    </section>}
  </>;
}
