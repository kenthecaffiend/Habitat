// Append verified historical bundles; never replace/remove old entries when selecting a new active renderer.
// Read compatibility is intentionally independent of the active rendering constants.
const archive=Object.freeze([
 Object.freeze({template_id:'fixed-a4-v8',renderer_id:'sha256:49c702fde0b061403cf574c4d1c45fb03f42ed564765cc5ff4559293d9f452ed',font_hash:'38f62e176a5a71bc5ca9b3f67fb3f27623e8b8524cab615fc26590912562bbf1'}),
 Object.freeze({template_id:'fixed-a4-v7',renderer_id:'sha256:e9e065ab91a25dc60ee6ba0ba41b1c1162d4a0c8e887ed3a2165c6b787863dba',font_hash:'38f62e176a5a71bc5ca9b3f67fb3f27623e8b8524cab615fc26590912562bbf1'}),
 Object.freeze({template_id:'fixed-a4-v1',renderer_id:'sha256:3a7bf12ba9313c79712300c688cf8430486d8ee9b1b2abb1446d981d922e2780',font_hash:'c4c45690b345435b2cba52ecabe275f05e49b389b39fe68ad03afbb551288d3d'}),
 Object.freeze({template_id:'fixed-a4-v2',renderer_id:'sha256:3fd6fc0dd8727f1e8b98cda918119190ad1390e91499520ae3cf79a7682e8a85',font_hash:'c4c45690b345435b2cba52ecabe275f05e49b389b39fe68ad03afbb551288d3d'}),
 Object.freeze({template_id:'fixed-a4-v3',renderer_id:'sha256:c66a002d7455135550dc3ad8b26116d4206d09f00990fc2da7d30352d9a8e231',font_hash:'c4c45690b345435b2cba52ecabe275f05e49b389b39fe68ad03afbb551288d3d'}),
 Object.freeze({template_id:'fixed-a4-v4',renderer_id:'sha256:f1a84fd9dee5bdec73433dbded2762360e7ddc33ba0ee33020095dcc0535e92e',font_hash:'38f62e176a5a71bc5ca9b3f67fb3f27623e8b8524cab615fc26590912562bbf1'}),
 Object.freeze({template_id:'fixed-a4-v6',renderer_id:'sha256:78a084bc751482a4727972753f92259a2276418b03c1126b141c51c94ee4469f',font_hash:'38f62e176a5a71bc5ca9b3f67fb3f27623e8b8524cab615fc26590912562bbf1'}),
 Object.freeze({template_id:'fixed-a4-v5',renderer_id:'sha256:5325768aa4125565464eca18a9c91722c22162303b3588687f8727947d6545e2',font_hash:'38f62e176a5a71bc5ca9b3f67fb3f27623e8b8524cab615fc26590912562bbf1'})
]);
export function supportsPdfBundle(value:any){return !!value&&archive.some(b=>b.template_id===value.template_id&&b.renderer_id===value.renderer_id&&b.font_hash===value.font_hash);}
