'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path'),source=fs.readFileSync(path.resolve(__dirname,'../../shared/rail-scene-start.js'),'utf8');
for(const reason of ['Web page caused context loss and was blocked','GL_VENDOR = Disabled','disabled by enterprise policy']){
 let listener,attempts=0;
 const target={dataset:{},replaceChildren(){},addEventListener:(e,f)=>listener=f,removeEventListener(){}};
 const c={document:{getElementById:()=>target},addEventListener(){}};c.window=c;vm.runInNewContext(source,c);
 const Ces={Viewer:function(){attempts++;listener({statusMessage:reason});throw Error('WebGL initialization failed');}};
 assert.throws(()=>c.BaylineSceneStart.create(Ces,target),e=>e.code==='WEBGL_START');assert.equal(attempts,1);
 assert.throws(()=>c.BaylineSceneStart.create(Ces,target),e=>e.code==='WEBGL_START');assert.equal(attempts,1,'Known browser block must not allocate more contexts');
 assert.match(c.BaylineSceneStart.diagnosticGuide(reason),/再起動/);
}
console.log('PASS: browser block/disabled/policy each stops after one attempt; repeated create is blocked; restart guidance retained');
