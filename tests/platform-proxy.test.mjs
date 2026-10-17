import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import {createServer} from 'node:http';

const tenant='11111111-1111-4111-8111-111111111111';
let server,handler,payload={items:[]};
const requests=[];
before(async()=>{
 server=createServer(async(req,res)=>{
  for await(const _chunk of req){}
  requests.push({method:req.method,url:req.url,cookie:req.headers.cookie});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(payload));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 process.env.API_BASE_URL=`http://127.0.0.1:${server.address().port}`;
 handler=(await import('../pages/api/platform.js')).default;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function request(method,query,body){
 const result={headers:{}};
 const res={setHeader(k,v){result.headers[k.toLowerCase()]=v;},status(v){result.status=v;return this;},json(v){result.body=v;return this;}};
 await handler({method,query,body,headers:{cookie:'salon_company_session=synthetic-session'}},res);
 return result;
}

test('company success routes suggestions, health and task creation through scoped API paths',async()=>{
 payload={suggestions:[{tenant_id:tenant,kind:'onboarding',title:'2 setup step(s) open'}]};
 assert.equal((await request('GET',{resource:'tasks',action:'suggestions'})).status,200);
 assert.equal(requests.at(-1).url,'/v1/company/tasks/suggestions');
 assert.equal(requests.at(-1).cookie,'salon_company_session=synthetic-session');
 assert.equal((await request('GET',{resource:'tenants',id:tenant,action:'health'})).status,200);
 assert.equal(requests.at(-1).url,`/v1/company/tenants/${tenant}/health`);
 assert.equal((await request('POST',{resource:'tasks'},{kind:'lead',title:'Salon lead'})).status,200);
 assert.equal(requests.at(-1).url,'/v1/company/tasks');
});

test('company success proxy rejects malformed IDs and wrong suggestion methods before upstream access',async()=>{
 const count=requests.length;
 assert.equal((await request('GET',{resource:'tenants',id:'bad',action:'health'})).status,400);
 assert.equal((await request('POST',{resource:'tasks',action:'suggestions'})).status,405);
 assert.equal(requests.length,count);
});

test('company metrics are read-only except for the fixed current-month rebuild route',async()=>{
 assert.equal((await request('GET',{resource:'metrics'})).status,200);
 assert.equal(requests.at(-1).url,'/v1/company/metrics');
 assert.equal((await request('POST',{resource:'metrics',action:'rebuild'},{period:'2026-10'})).status,200);
 assert.equal(requests.at(-1).url,'/v1/company/metrics/rebuild');
 const count=requests.length;
 assert.equal((await request('GET',{resource:'metrics',action:'rebuild'})).status,405);
 assert.equal(requests.length,count);
});
