import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {createServer} from 'node:http';

const tenant='11111111-1111-4111-8111-111111111111';
const series='22222222-2222-4222-8222-222222222222';
let server,handler;
const requests=[];
before(async()=>{
 server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  requests.push({url:req.url,method:req.method,body,cookie:req.headers.cookie});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 process.env.API_BASE_URL='http://127.0.0.1:'+server.address().port;
 handler=(await import('../pages/api/workspace.js')).default;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function call(method,action,id,body={}){
 const result={};const res={setHeader(){},status(s){result.status=s;return this;},json(b){result.body=b;return this;},end(b){result.body=b;return this;}};
 await handler({method,query:{tenant_id:tenant,resource:'recurring-series',action,...(id?{id}:{})},body,
  headers:{cookie:'salon_staff_session=synthetic',origin:'http://127.0.0.1:3000'}},res);
 return result;
}
test('recurring preview, create, edit and cancel use fixed tenant-scoped routes',async()=>{
 for(const [method,action,id,suffix] of [
  ['POST','preview',null,'/recurring-series/preview'],['POST','create',null,'/recurring-series'],
  ['PATCH','edit',series,'/recurring-series/'+series],['POST','cancel',series,'/recurring-series/'+series+'/cancel']]){
  const response=await call(method,action,id,{synthetic:true});
  assert.equal(response.status,200);
  assert.equal(requests.at(-1).method,method);
  assert.equal(requests.at(-1).url,'/v1/tenants/'+tenant+suffix);
  assert.equal(requests.at(-1).cookie,'salon_staff_session=synthetic');
  assert.deepEqual(JSON.parse(requests.at(-1).body),{synthetic:true});
 }
});
test('recurring proxy rejects invalid target and method before upstream access',async()=>{
 const beforeCount=requests.length;
 assert.equal((await call('GET','preview')).status,405);
 assert.equal((await call('POST','edit','../other')).status,400);
 assert.equal((await call('DELETE','cancel',series)).status,405);
 assert.equal(requests.length,beforeCount);
});
