// Fixed invented fixtures only; no input file, database, network, renderer or mail adapter.
import {buildAcceptancePack} from '../../src/modules/payslips/acceptance';
import {reconcileAnnualCpf} from '../../src/modules/payroll/annual';
import {twoEmployeeFixture} from '../../tests/fixtures/payslip-data';
import {annualFixture} from '../../tests/fixtures/statutory';
import sources from '../../docs/statutory-fixture-sources.json' with {type:'json'};
const inputs=twoEmployeeFixture(),pack=buildAcceptancePack(inputs);if(!pack.ok)throw Error(pack.message);
const leaver=annualFixture(8);leaver.months[0].awCents=10000000;
const annual=reconcileAnnualCpf(leaver);if(!annual.ok)throw Error(annual.message);
console.log(JSON.stringify({warning:'INVENTED DATA ONLY — NOT ISSUED, NOT LIVE PAYROLL',sources,inputs,output:pack.value,leaver:{input:leaver,output:annual.value},remainingGates:['actual profile and fund evidence','official calculator comparison including fractional-cent SDL','professional review','real opening reconciliation','final-pay/manual exceptions','PDF/issuance/delivery','live-use release']},null,2));
