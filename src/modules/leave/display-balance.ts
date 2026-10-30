/** Display only the current annual vintage and still-valid prior carryover; never future grants. */
export function annualDisplayDays(remaining:Record<string,number>|undefined,asOf:string):number|null {
 if(!remaining)return null;const y=Number(asOf.slice(0,4));if(!Number.isInteger(y)||!Object.hasOwn(remaining,String(y)))return null;
 const current=remaining[String(y)],prior=remaining[String(y-1)]??0;if(!Number.isFinite(current)||!Number.isFinite(prior))return null;return(current+prior)/2;
}
