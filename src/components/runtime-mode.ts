'use client';
import {createContext,useContext} from 'react';
export const ActualDraftContext=createContext(false);
export function useActualDraftMode(){return useContext(ActualDraftContext);}
