export function parseSGD(value:string):number|null{
 if(!/^\d{1,14}(\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return cents>0n&&cents<=BigInt(Number.MAX_SAFE_INTEGER)?Number(cents):null;
}
export function formatSGD(value:string|number):string{const cents=BigInt(value);return (cents/100n).toString()+'.'+(cents%100n).toString().padStart(2,'0');}
