import Decimal from 'decimal.js';
export function money(value:number){if(!Number.isSafeInteger(value)||value<0)throw new Error('Money must be nonnegative safe-integer cents');return new Decimal(value);}
export function integer(value:Decimal){const n=value.toNumber();if(!Number.isSafeInteger(n))throw new Error('Unsafe monetary result');return n;}
