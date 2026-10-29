'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let closed=0,draws=0,width=4000,height=3000,outputSize=200000;const canvas={getContext:()=>({drawImage(){draws++;}}),toBlob:cb=>cb({type:'image/webp',size:outputSize})};
const context={window:{},document:{createElement:()=>canvas},createImageBitmap:async()=>({width,height,close(){closed++;}})};
vm.runInNewContext(fs.readFileSync('staff-photos.js','utf8'),context);const P=context.window.StaffPhotos;const photo={type:'image/jpeg',size:12345};
(async()=>{
 assert.throws(()=>P.validate([photo,photo,photo,photo]));assert.throws(()=>P.validate([{type:'image/svg+xml',size:200}]));assert.throws(()=>P.validate([{type:'image/jpeg',size:10485761}]));
 const blob=await P.prepare(photo);assert.equal(blob.type,'image/webp');assert.equal(blob.size,200000);assert.equal(canvas.width,1600);assert.equal(canvas.height,1200);assert.equal(closed,1);assert.equal(draws,1);
 width=10000;height=10000;await assert.rejects(P.prepare(photo));assert.equal(closed,2);
 width=4000;height=3000;outputSize=300000;await assert.rejects(P.prepare(photo));assert.equal(closed,3);assert.equal(canvas.width,640);
 console.log('PASS: three-photo/type/10MB validation, WebP output, 1600px resizing, 256KB limit, excessive pixels rejected, bitmap cleanup on success/failure; encoder mocked');
})().catch(e=>{console.error(e);process.exitCode=1;});
