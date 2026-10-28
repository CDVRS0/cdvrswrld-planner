'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {CeedLogo} from './CeedLogo';
export default function CeedAssistantLauncher({children=null,title='CEED',product='',tagline='THINK AT YOUR OWN PACE',className='',open:controlledOpen,onOpenChange}={}){
 const [internalOpen,setInternalOpen]=useState(false),[opened,setOpened]=useState(false);
 const open=controlledOpen??internalOpen,trigger=useRef(null),close=useRef(null),wasOpen=useRef(false),id=useId();
 function change(next){if(next)setOpened(true);if(onOpenChange)onOpenChange(next);else setInternalOpen(next);}
 useEffect(()=>{if(open)close.current?.focus();else if(wasOpen.current)trigger.current?.focus();wasOpen.current=open;},[open]);
 return <><button ref={trigger} type="button" className={`brand ceed-brand-button ${className}`} aria-label="Open CEED assistant" aria-expanded={open} aria-controls={opened||open?id:undefined} onClick={()=>change(!open)} title="Chat with CEED" onKeyDown={e=>{if(e.key==='Escape'&&open)change(false);}}><CeedLogo/><span className="ceed-brand-copy"><strong>CEED {product&&<span>{product}</span>}</strong><small>{tagline}</small></span></button>
 {children&&(open||opened)&&<section id={id} className="ceed-assistant-panel" hidden={!open} role="dialog" aria-modal="false" aria-label={title} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();change(false);}}}><header className="ceed-assistant-heading"><div><strong>{title}</strong><small>A little clarity, wherever you are.</small></div><button ref={close} type="button" aria-label="Close CEED assistant" onClick={()=>change(false)}>×</button></header><div className="ceed-assistant-body">{children}</div></section>}</>;
}
