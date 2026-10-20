const fs=require('fs'),z=require('zlib'),vm=require('vm'),assert=require('assert/strict');
process.chdir(require('path').resolve(__dirname,'../..'));const report=[];for(const name of ['chuo','chuo-local','keihin','sobu','yamanote']){let code,data;
if(name==='yamanote'){code=fs.readFileSync('yamanote/rail.js','utf8');const c={window:{}};vm.runInNewContext(fs.readFileSync('yamanote/rail-data.js','utf8'),c);data=c.window.RAIL_DATA;}else{const p=name==='sobu'?'sobu-data':name+'-bundle';const raw=z.gunzipSync(Buffer.concat([0,1].map(i=>fs.readFileSync(''+p+'-'+i+'.bin'))));const html=JSON.parse(raw).html;code=html;const c={window:{}};vm.runInNewContext('window.RAIL_DATA='+html.split('window.RAIL_DATA=')[1].split('</script>')[0],c);data=c.window.RAIL_DATA;}
const expr=code.match(/new Ces.UrlTemplateImageryProvider\((\{url:'https:\/\/cyberjapandata[^\n]*?)\)\);/)[1];
let points=0;for(const r of Object.values(data.routes))for(const p of r.points){assert.ok(p[0]>=90&&p[0]<=180&&p[1]>=0&&p[1]<=66);points++;}
for(const quality of [0,1,2]){const Ces={Credit:class{},Rectangle:{fromDegrees:(...v)=>v}};const o=vm.runInNewContext('('+expr+')',{Ces,quality});assert.equal(o.minimumLevel,2);assert.equal(o.maximumLevel,quality===2?17:15);}
report.push({name,routePointsCovered:points,minimum:2,maximum:[15,15,17],pass:true});}
fs.writeFileSync('development/browser-validation/imagery-config-check.json',JSON.stringify(report,null,2));console.log(report);
