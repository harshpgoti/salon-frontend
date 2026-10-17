import {randomUUID} from 'node:crypto';
export async function proxy(req,res,path){
 res.setHeader('Cache-Control','no-store');
 const base=process.env.API_BASE_URL;
 if(!base)return res.status(503).json({detail:{code:'api_unconfigured'}});
 const headers={'X-Request-ID':randomUUID()};
 if(req.headers.cookie)headers.cookie=req.headers.cookie;
 if(req.headers.origin)headers.origin=req.headers.origin;
 if(typeof req.headers['idempotency-key']==='string'&&/^[A-Za-z0-9._:-]{8,128}$/.test(req.headers['idempotency-key']))headers['Idempotency-Key']=req.headers['idempotency-key'];
 let body;
 if(!['GET','HEAD'].includes(req.method)&&req.body!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(req.body);}
 try{
  const response=await fetch(new URL(path,base),{method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(10000)});
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  const trace=response.headers.get('x-request-id');if(trace)res.setHeader('X-Request-ID',trace);
  if(response.status===204)return res.status(204).end();
  return res.status(response.status).json(await response.json());
 }catch{return res.status(503).json({detail:{code:'api_unavailable'}});}
}
export function denyMethod(res,allowed){res.setHeader('Allow',allowed.join(', '));return res.status(405).json({detail:{code:'method_not_allowed'}});}
export function querySuffix(query,excluded){const params=new URLSearchParams();for(const [k,v]of Object.entries(query))if(!excluded.includes(k)&&typeof v==='string')params.set(k,v);return params.size?'?'+params:'';}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
