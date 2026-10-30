import {setTimeout as delay} from 'node:timers/promises';
type Wait=(milliseconds:number,signal:AbortSignal)=>Promise<void>;
const waitForMinute:Wait=async(ms,signal)=>{await delay(ms,undefined,{signal});};

/** Wait for each tick to finish. The database, not this loop, owns durable intent identity. */
export async function runSchedulerLoop(
  tick:()=>Promise<void>,signal:AbortSignal,onError:(error:unknown)=>void,wait:Wait=waitForMinute
):Promise<void>{
  while(!signal.aborted){
    try {await tick();} catch(error){onError(error);}
    if(signal.aborted)break;
    try {await wait(60_000,signal);} catch(error){if(!signal.aborted)throw error;}
  }
}
