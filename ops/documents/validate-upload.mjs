// Bounded, local parsing only. No PDF rendering, actions, OCR, URLs or external service.
import {createRequire} from 'node:module';import sharp from 'sharp';import decode from 'heic-decode';import {PDFDocument} from 'pdf-lib';
// PDF object-stream decompression has a cumulative64MiB allocation budget.
const require=createRequire(import.meta.url),DecodeStream=require('pdf-lib/cjs/core/streams/DecodeStream.js').default,ensure=DecodeStream.prototype.ensureBuffer;let decodedBudget=64*1024*1024;
DecodeStream.prototype.ensureBuffer=function(requested){if(!Number.isSafeInteger(requested)||requested<0)throw Error('PDF_SIZE');if(requested>this.buffer.length){let next=this.minBufferLength;while(next<requested)next*=2;const growth=next-this.buffer.length;if(!Number.isSafeInteger(growth)||growth>decodedBudget)throw Error('PDF_SIZE');decodedBudget-=growth;}return ensure.call(this,requested);};
let size=0;const chunks=[];for await(const b of process.stdin){size+=b.length;if(size>20971520)process.exit(2);chunks.push(b);}const bytes=Buffer.concat(chunks),mime=process.argv[2];
try{
 if(mime==='application/pdf'){
  if(bytes.length>5242880||!/^%PDF-(?:1\.[0-9]|2\.0)/.test(bytes.subarray(0,8).toString())||!bytes.subarray(-1024).includes(Buffer.from('%%EOF')))throw Error();
  const pdf=await PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});if(pdf.getPageCount()<1||pdf.getPageCount()>50)throw Error();process.stdout.write('PDF');
 }else{
  let image;
  if(mime==='image/heic'){
   if(bytes.subarray(4,8).toString()!=='ftyp')throw Error();const images=await decode.all({buffer:bytes});try{if(images.length!==1||images[0].width>8192||images[0].height>8192||images[0].width*images[0].height>16777216)throw Error();const d=await images[0].decode();image=sharp(Buffer.from(d.data),{raw:{width:d.width,height:d.height,channels:4}});}finally{images.dispose();}
  }else{
   if(mime==='image/png'?!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):mime==='image/jpeg'?!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255):true)throw Error();
   image=sharp(bytes,{limitInputPixels:16777216,failOn:'warning',sequentialRead:true});const m=await image.metadata();if(m.format!==(mime==='image/png'?'png':'jpeg')||!m.width||!m.height||m.width>8192||m.height>8192||(m.pages??1)!==1)throw Error();
  }
  const output=await image.rotate().resize({width:4096,height:4096,fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).timeout({seconds:5}).toBuffer();if(output.length>4194304)throw Error();process.stdout.write(output);
 }
}catch{process.exitCode=2;}
