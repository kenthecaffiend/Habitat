import {it,expect} from 'vitest';import {runSchedulerLoop} from '../../src/worker/loop';
it('awaits each tick, waits one minute, and stops cleanly',async()=>{const controller=new AbortController();const order:string[]=[];let ticks=0;
 await runSchedulerLoop(async()=>{order.push('start');await Promise.resolve();order.push('end');if(++ticks===2)controller.abort();},controller.signal,e=>{throw e;},async ms=>{expect(ms).toBe(60000);order.push('wait');});
 expect(order).toEqual(['start','end','wait','start','end']);
});
it('reports operational failure then retries on the next minute without overlap',async()=>{const controller=new AbortController();let ticks=0;const errors:unknown[]=[];
 await runSchedulerLoop(async()=>{if(++ticks===1)throw new Error('Synthetic DB outage');controller.abort();},controller.signal,e=>errors.push(e),async ms=>{expect(ms).toBe(60000);});
 expect(ticks).toBe(2);expect(errors).toHaveLength(1);
});
