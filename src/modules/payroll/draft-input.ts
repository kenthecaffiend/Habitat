import {parseSGD} from '../claims/amount';
// Input parsing only; money calculations remain in the existing payroll calculator.
export function parseDraftSGD(value:string):number{if(/^0(?:\.0{1,2})?$/.test(value))return 0;const amount=parseSGD(value);if(amount===null)throw Error('Enter an explicit valid SGD amount; unknown is not zero');return amount;}
