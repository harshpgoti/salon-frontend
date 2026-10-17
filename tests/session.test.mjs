import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {createServer} from 'node:http';
import {privatePage,loginPage} from '../lib/session.js';
let server;before(async()=>{server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.headers.cookie!=='valid-session'){res.writeHead(401);res.end('{}');return;}res.end(JSON.stringify({surface:req.url.includes('company')?'company':'staff',workspaces:[]}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));process.env.API_BASE_URL='http://127.0.0.1:'+server.address().port;});after(async()=>new Promise(resolve=>server.close(resolve)));
function context(cookie,query={}){return{query,req:{headers:{cookie}},res:{setHeader(){}}};}
test('anonymous salon/admin pages redirect to their separate login',async()=>{assert.equal((await privatePage('staff')(context())).redirect.destination,'/login');assert.equal((await privatePage('company')(context())).redirect.destination,'/admin/login');});
test('expired cookie redirects while valid identity supplies private page props',async()=>{assert.equal((await privatePage('staff')(context('expired'))).redirect.destination,'/login');assert.equal((await privatePage('staff')(context('valid-session'))).props.session.surface,'staff');});
test('legacy provider return validates real session and opens correct dashboard',async()=>{assert.equal((await loginPage('staff')(context('valid-session',{status:'signed-in'}))).redirect.destination,'/salon');assert.equal((await loginPage('staff')(context('valid-session',{surface:'company',status:'signed-in'}))).redirect.destination,'/admin');assert.equal((await loginPage('staff')(context('expired',{status:'signed-in'}))).redirect.destination,'/login');});
test('legacy company sign in points to visible admin login',async()=>assert.equal((await loginPage('staff')(context(undefined,{surface:'company'}))).redirect.destination,'/admin/login'));
