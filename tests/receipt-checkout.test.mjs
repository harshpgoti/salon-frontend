import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {createServer} from 'node:http';
import * as moneyInput from '../lib/http.js';
let server,workspace;
const seen=[];
const tenant='11111111-1111-4111-8111-111111111111';
const appointment='22222222-2222-4222-8222-222222222222';
before(async()=>{
 server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  seen.push({url:req.url,method:req.method,headers:req.headers,body});
  res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify({entry_id:'synthetic-entry'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 process.env.API_BASE_URL='http://127.0.0.1:'+server.address().port;
 workspace=(await import('../pages/api/workspace.js')).default;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function call(method,action,extra={},body){
 const result={headers:{}};
 const res={setHeader(k,v){result.headers[k.toLowerCase()]=v;},status(s){result.status=s;return this;},
            json(b){result.body=b;return this;},end(b){result.body=b;return this;}};
 await workspace({method,query:{tenant_id:tenant,resource:'appointments',id:appointment,action,...extra},body,
  headers:{cookie:'salon_staff_session=synthetic',origin:'http://127.0.0.1:3000'}},res);
 return result;
}
test('CAD input produces exact signed minor units',()=>{
 for(const [value,kind,expected]of [['12.34','payment',1234],['0.01','payment',1],['12','refund',-1200],
   ['-1.50','adjustment',-150],['2.5','adjustment',250],['21474836.47','payment',2147483647]]){
  assert.equal(moneyInput.parseCadAmount(value,kind),expected);
 }
});
test('CAD input rejects precision, exponent, sign, zero and database overflow mistakes',()=>{
 for(const [value,kind]of [['1.005','payment'],['1e2','payment'],['-1','refund'],['0','payment'],
   ['0.00','adjustment'],['21474836.48','payment'],['-21474836.49','adjustment'],['1','unknown'],['abc','payment']]){
  assert.throws(()=>moneyInput.parseCadAmount(value,kind),/amount|CAD/);
 }
});
test('receipt list/total use exact authenticated appointment subroutes',async()=>{
 assert.equal((await call('GET','receipt-entries',{limit:'25',offset:'2'})).status,201);
 assert.equal(seen.at(-1).url,'/v1/tenants/'+tenant+'/appointments/'+appointment+'/receipt-entries?limit=25&offset=2');
 assert.equal(seen.at(-1).headers.cookie,'salon_staff_session=synthetic');
 assert.equal(seen.at(-1).body,'');
 const total=await call('GET','receipt-total');assert.equal(total.status,201);
 assert.equal(seen.at(-1).url,'/v1/tenants/'+tenant+'/appointments/'+appointment+'/receipt-total');
 assert.equal(total.headers['cache-control'],'no-store');
});
test('receipt post forwards the signed amount and retry key without changing facts',async()=>{
 const body={kind:'refund',amount_minor:-1250,method:'card',idempotency_key:'same-retry-key'};
 assert.equal((await call('POST','receipt-entries',{},body)).status,201);
 assert.equal(seen.at(-1).method,'POST');assert.deepEqual(JSON.parse(seen.at(-1).body),body);
});
test('receipt edits, total writes and malicious path inputs never reach upstream',async()=>{
 const count=seen.length;
 for(const method of ['PATCH','DELETE','PUT'])assert.equal((await call(method,'receipt-entries')).status,405);
 assert.equal((await call('POST','receipt-total')).status,405);
 assert.equal((await call('GET','receipt-entries',{id:'../other'})).status,400);
 assert.equal((await call('GET','receipt-entries/../../company')).status,404);
 assert.equal((await call('GET',['receipt-entries'])).status,404);
 assert.equal(seen.length,count);
});
