"use client";
import {createContext,useContext,useRef,useState,useEffect,type ReactNode,type Dispatch,type SetStateAction} from 'react';
const Memory=createContext<Map<string,unknown>|null>(null);
export function DraftMemory({children}:{children:ReactNode}){const bag=useRef(new Map<string,unknown>());return <Memory.Provider value={bag.current}>{children}</Memory.Provider>;}
// Tab memory only. Never serializes employee data to browser storage; full sign-out navigation discards it.
export function useDraftState<T>(key:string,initial:T|(()=>T)):[T,Dispatch<SetStateAction<T>>]{const bag=useContext(Memory),[value,setValue]=useState<T>(()=>bag?.has(key)?bag.get(key) as T:typeof initial==='function'?(initial as ()=>T)():initial);useEffect(()=>{bag?.set(key,value);},[bag,key,value]);return[value,setValue];}
