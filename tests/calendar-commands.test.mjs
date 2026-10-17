import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {createServer} from 'node:http';
import * as commands from '../lib/http.js';
let server,workspace;
const seen=[];
const tenant='11111111-1111-4111-8111-111111111111';
const appointment='22222222-2222-4222-8222-222222222222';
before(async()=>{
 server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  seen.push({url:req.url,method:req.method,headers:req.headers,body});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({appointment_id:appointment,replayed:true}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 process.env.API_BASE_URL='http://127.0.0.1:'+server.address().port;
 workspace=(await import('../pages/api/workspace.js')).default;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function call(method,action,body,extra={}){
 const result={headers:{}};
 const res={setHeader(k,v){result.headers[k.toLowerCase()]=v;},status(s){result.status=s;return this;},
            json(b){result.body=b;return this;},end(b){result.body=b;return this;}};
 await workspace({method,query:{tenant_id:tenant,resource:'appointments',id:appointment,action,...extra},body,
  headers:{cookie:'salon_staff_session=synthetic',origin:'http://127.0.0.1:3000'}},res);
 return result;
}
test('an unchanged failed command keeps its key even when field order differs',()=>{
 const first=commands.prepareCommand(null,tenant+':cancel:'+appointment,{reason:'Synthetic reason',expected_version:1},()=> 'first-retry-key');
 const retry=commands.prepareCommand(first,tenant+':cancel:'+appointment,{expected_version:1,reason:'Synthetic reason'},()=> 'unexpected-new-key');
 assert.equal(retry.key,'first-retry-key');
 assert.deepEqual(retry.body,{expected_version:1,reason:'Synthetic reason',idempotency_key:'first-retry-key'});
});
test('changed facts, action or workspace get a new key; successful reset starts a new command',()=>{
 const facts={starts_at:'2027-01-15T16:00:00Z',expected_version:1};
 const first=commands.prepareCommand(null,'salon-a:reschedule:'+appointment,facts,()=> 'first-retry-key');
 for(const [context,body]of [['salon-a:reschedule:'+appointment,{...facts,starts_at:'2027-01-15T17:00:00Z'}],
   ['salon-b:reschedule:'+appointment,facts],['salon-a:cancel:'+appointment,facts]]){
  assert.equal(commands.prepareCommand(first,context,body,()=> 'changed-command-key').key,'changed-command-key');
 }
 assert.equal(commands.prepareCommand(null,'salon-a:reschedule:'+appointment,facts,()=> 'after-success-key').key,'after-success-key');
});
test('cancel and reschedule forward exact prepared facts/key through authenticated allowlisted routes',async()=>{
 for(const action of ['cancel','reschedule']){
  const facts=action==='cancel'?{reason:'Synthetic reason',expected_version:1}:{starts_at:'2027-01-15T16:00:00Z',expected_version:1};
  const prepared=commands.prepareCommand(null,tenant+':'+action+':'+appointment,facts,()=> 'persisted-retry-key');
  const result=await call('POST',action,prepared.body);
  assert.equal(result.status,200);assert.equal(result.headers['cache-control'],'no-store');
  assert.equal(seen.at(-1).url,'/v1/tenants/'+tenant+'/appointments/'+appointment+'/'+action);
  assert.equal(seen.at(-1).headers.cookie,'salon_staff_session=synthetic');
  assert.deepEqual(JSON.parse(seen.at(-1).body),{...facts,idempotency_key:'persisted-retry-key'});
 }
});
test('appointment lifecycle transitions forward versioned status and retry key to the fixed route',async()=>{
 const facts={to_status:'checked_in',expected_version:3,reason:null};
 const prepared=commands.prepareCommand(null,tenant+':transition:'+appointment,facts,()=> 'transition-retry-key');
 const result=await call('POST','transition',prepared.body);
 assert.equal(result.status,200);
 assert.equal(seen.at(-1).url,'/v1/tenants/'+tenant+'/appointments/'+appointment+'/transitions');
 assert.deepEqual(JSON.parse(seen.at(-1).body),{...facts,idempotency_key:'transition-retry-key'});
});
test('calendar mutations reject read methods and malformed targets without upstream calls',async()=>{
 const count=seen.length;
 assert.equal((await call('GET','cancel')).status,405);
 assert.equal((await call('POST','reschedule',{}, {id:'../elsewhere'})).status,400);
 assert.equal((await call('POST',['reschedule'],{})).status,404);
 assert.equal(seen.length,count);
});
