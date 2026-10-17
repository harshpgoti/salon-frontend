import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {createServer} from 'node:http';

const tenant='11111111-1111-4111-8111-111111111111';
const location='22222222-2222-4222-8222-222222222222';
const entry='33333333-3333-4333-8333-333333333333';
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
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));delete process.env.API_BASE_URL;});
async function call(method,query,body={}){
 const result={};const res={setHeader(){},status(s){result.status=s;return this;},json(b){result.body=b;return this;},end(b){result.body=b;return this;}};
 await handler({method,query:{tenant_id:tenant,resource:'waitlist',...query},body,
  headers:{cookie:'salon_staff_session=synthetic',origin:'http://127.0.0.1:3000'}},res);
 return result;
}
test('waitlist list/create and offer/withdraw use fixed tenant routes',async()=>{
 const list=await call('GET',{location_id:location,state:'open',limit:'100'});
 assert.equal(list.status,200);
 assert.equal(requests.at(-1).url,`/v1/tenants/${tenant}/waitlist?location_id=${location}&state=open&limit=100`);
 const entryBody={client_id:entry,service_id:entry,location_id:location,date_from:'2026-10-15',date_to:'2026-10-20'};
 await call('POST',{},entryBody);
 assert.equal(requests.at(-1).url,`/v1/tenants/${tenant}/waitlist`);
 assert.deepEqual(JSON.parse(requests.at(-1).body),entryBody);
 for(const [action,suffix] of [['offer','offers'],['withdraw','withdraw']]){
  await call('POST',{id:entry,action},{synthetic:true});
  assert.equal(requests.at(-1).url,`/v1/tenants/${tenant}/waitlist/${entry}/${suffix}`);
  assert.equal(requests.at(-1).cookie,'salon_staff_session=synthetic');
 }
});
test('waitlist proxy rejects unknown targets, filters and methods before upstream access',async()=>{
 const beforeCount=requests.length;
 assert.equal((await call('GET',{id:'../other',action:'offer'})).status,400);
 assert.equal((await call('GET',{state:'unknown'})).status,400);
 assert.equal((await call('GET',{unexpected:'tenant_path'})).status,400);
 assert.equal((await call('DELETE',{})).status,405);
 assert.equal((await call('GET',{id:entry,action:'withdraw'})).status,405);
 assert.equal(requests.length,beforeCount);
});
