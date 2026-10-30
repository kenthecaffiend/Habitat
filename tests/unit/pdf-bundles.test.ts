import {it,expect} from 'vitest';import {supportsPdfBundle} from '../../src/modules/payslips/pdf-bundles';
const historic={template_id:'fixed-a4-v1',renderer_id:'sha256:3a7bf12ba9313c79712300c688cf8430486d8ee9b1b2abb1446d981d922e2780',font_hash:'c4c45690b345435b2cba52ecabe275f05e49b389b39fe68ad03afbb551288d3d'};
it('retains the approved v2 bundle after the visual-only v3 refinement',()=>{expect(supportsPdfBundle({...historic,template_id:'fixed-a4-v2',renderer_id:'sha256:3fd6fc0dd8727f1e8b98cda918119190ad1390e91499520ae3cf79a7682e8a85'})).toBe(true);});
it('retains the line-accent v3 bundle after adding bold subtotals',()=>{expect(supportsPdfBundle({...historic,template_id:'fixed-a4-v3',renderer_id:'sha256:c66a002d7455135550dc3ad8b26116d4206d09f00990fc2da7d30352d9a8e231'})).toBe(true);});
it('retains the bold-subtotal v4 bundle after compacting the header/footer',()=>{expect(supportsPdfBundle({template_id:'fixed-a4-v4',renderer_id:'sha256:f1a84fd9dee5bdec73433dbded2762360e7ddc33ba0ee33020095dcc0535e92e',font_hash:'38f62e176a5a71bc5ca9b3f67fb3f27623e8b8524cab615fc26590912562bbf1'})).toBe(true);});
it('recognizes the archived verified bundle independently of an active renderer selection',()=>{expect(supportsPdfBundle(historic)).toBe(true);expect(supportsPdfBundle({...historic,renderer_id:'unknown'})).toBe(false);expect(supportsPdfBundle({...historic,font_hash:'unknown'})).toBe(false);});
import {TEMPLATE} from '../../src/modules/payslips/template';
import {RENDERER,FONT} from '../../src/modules/payslips/pdf-service';
import {IMAGE} from '../../ops/payslip-pdf/runner';
it('accepts the exact active bundle and refuses mixed historical/current pins',()=>{expect(IMAGE).toBe(RENDERER);expect(supportsPdfBundle({template_id:TEMPLATE,renderer_id:RENDERER,font_hash:FONT})).toBe(true);expect(supportsPdfBundle({...historic,template_id:TEMPLATE})).toBe(false);expect(supportsPdfBundle({...historic,renderer_id:RENDERER})).toBe(false);});

import {ISSUED_TEMPLATE} from '../../src/modules/payslips/template';import {ISSUED_RENDERER} from '../../src/modules/payslips/pdf-service';import {ISSUED_IMAGE} from '../../ops/payslip-pdf/issued-runner';
it('retains original issued v7 documents and pins new border-free v8 renders',()=>{expect(supportsPdfBundle({template_id:'fixed-a4-v7',renderer_id:'sha256:e9e065ab91a25dc60ee6ba0ba41b1c1162d4a0c8e887ed3a2165c6b787863dba',font_hash:FONT})).toBe(true);expect(ISSUED_IMAGE).toBe(ISSUED_RENDERER);expect(supportsPdfBundle({template_id:ISSUED_TEMPLATE,renderer_id:ISSUED_RENDERER,font_hash:FONT})).toBe(true);});
