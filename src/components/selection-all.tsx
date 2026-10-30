'use client';
import {useEffect,useRef} from 'react';
export function selectionState(ids:string[],selected:string[]){const n=ids.filter(id=>selected.includes(id)).length;return n===0?'none':n===ids.length?'all':'partial';}
export function toggleAll(ids:string[],selected:string[],checked:boolean){return checked?[...new Set([...selected,...ids])]:selected.filter(id=>!ids.includes(id));}
export function SelectionAll({ids,selected,onChange,disabled=false}:{ids:string[];selected:string[];onChange:(ids:string[])=>void;disabled?:boolean}){const input=useRef<HTMLInputElement>(null),state=selectionState(ids,selected);useEffect(()=>{if(input.current)input.current.indeterminate=state==='partial';},[state]);return <label className="selection-all"><input ref={input} type="checkbox" checked={state==='all'} aria-checked={state==='partial'?'mixed':state==='all'} disabled={disabled||!ids.length} onChange={e=>onChange(toggleAll(ids,selected,e.target.checked))}/>Select All</label>;}
