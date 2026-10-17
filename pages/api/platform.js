import {proxy,denyMethod,querySuffix,UUID} from '../../lib/proxy.js';
const routes={tenants:['tenants',['GET']],cases:['cases',['GET','POST']],grants:['grants',['GET','POST']],diagnostics:['diagnostics',['GET']],staff:['staff',['GET','POST']],tasks:['tasks',['GET','POST']],queues:['ops/queues',['GET']],ledger:['finance/ledger',['GET']],reconciliation:['finance/reconciliation',['GET']],tax:['finance/tax-config',['GET','PUT']],metrics:['metrics',['GET']],approvals:['approvals',['GET','POST']],adjustments:['finance/adjustments',['GET','POST']],export:['finance/export',['GET']]};
export default function handler(req,res){
 if(typeof req.query.resource!=='string'||!Object.hasOwn(routes,req.query.resource))return res.status(404).json({detail:{code:'not_found'}});
 const route=routes[req.query.resource];if(!route)return res.status(404).json({detail:{code:'not_found'}});
 let path='/v1/company/'+route[0],allowed=route[1];
 if(req.query.resource==='grants'){
  const action=req.query.action;
  if(req.query.case_id!==undefined){
   if(typeof req.query.case_id!=='string'||!UUID.test(req.query.case_id)||action)return res.status(400).json({detail:{code:'invalid_case_id'}});
   path='/v1/company/cases/'+req.query.case_id+'/grants';allowed=['POST'];
  }else if(req.query.id!==undefined){
   if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_id'}});
   path='/v1/company/grants/'+req.query.id;
   if(action==='revoke'){path+='/revoke';allowed=['POST'];}
   else if(action)return res.status(404).json({detail:{code:'not_found'}});
   else allowed=['GET'];
  }else return res.status(400).json({detail:{code:'case_id_required'}});
  if(!allowed.includes(req.method))return denyMethod(res,allowed);
  return proxy(req,res,path);
 }
 if(req.query.resource==='diagnostics'){
  const tenantId=req.query.tenant_id,grantId=req.query.grant_id;
  if(typeof tenantId!=='string'||!UUID.test(tenantId)||typeof grantId!=='string'||!UUID.test(grantId))return res.status(400).json({detail:{code:'invalid_diagnostic_scope'}});
  if(req.method!=='GET')return denyMethod(res,['GET']);
  return proxy(req,res,'/v1/company/tenants/'+tenantId+'/diagnostics?grant_id='+encodeURIComponent(grantId));
 }
 if(req.query.resource==='export'){
  const approvalId=req.query.approval_id;
  if(typeof approvalId!=='string'||!UUID.test(approvalId))return res.status(400).json({detail:{code:'invalid_approval_id'}});
  if(req.method!=='GET')return denyMethod(res,['GET']);
  return proxy(req,res,'/v1/company/finance/export?approval_id='+encodeURIComponent(approvalId));
 }
 if(req.query.resource==='tasks'&&req.query.action==='suggestions'){
  if(req.method!=='GET')return denyMethod(res,['GET']);
  return proxy(req,res,'/v1/company/tasks/suggestions');
 }
 if(req.query.resource==='metrics'&&req.query.action==='rebuild'){
  if(req.method!=='POST')return denyMethod(res,['POST']);
  return proxy(req,res,'/v1/company/metrics/rebuild');
 }
 if(req.query.resource==='adjustments'&&req.query.id===undefined&&req.method==='POST'){
  const key=req.headers['idempotency-key'];
  if(typeof key!=='string'||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))return res.status(400).json({detail:{code:'idempotency_key_required'}});
 }
 if(req.query.resource==='approvals'&&req.query.id!==undefined){
  const id=req.query.id;
  if(typeof id!=='string'||!UUID.test(id))return res.status(400).json({detail:{code:'invalid_id'}});
  if(req.query.action!=='decide')return res.status(404).json({detail:{code:'not_found'}});
  if(req.method!=='POST')return denyMethod(res,['POST']);
  return proxy(req,res,'/v1/company/approvals/'+id+'/decide');
 }
 if(req.query.resource==='adjustments'&&req.query.id!==undefined){
  const id=req.query.id;
  if(typeof id!=='string'||!UUID.test(id))return res.status(400).json({detail:{code:'invalid_id'}});
  if(req.query.action!=='decide')return res.status(404).json({detail:{code:'not_found'}});
  if(req.method!=='POST')return denyMethod(res,['POST']);
  const approve=req.query.approve;
  if(approve!=='true'&&approve!=='false')return res.status(400).json({detail:{code:'invalid_decision'}});
  return proxy(req,res,'/v1/company/finance/adjustments/'+id+'/decide?approve='+approve);
 }
 if(req.query.id){if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_id'}});
 const action=req.query.action;
 if(req.query.resource==='tenants'&&!action){path+='/'+req.query.id;allowed=['GET'];}
 else if(req.query.resource==='tenants'&&action==='health'){path+='/'+req.query.id+'/health';allowed=['GET'];}
 else if(req.query.resource==='cases'&&action==='status'){path+='/'+req.query.id+'/status';allowed=['POST'];}
 else if(req.query.resource==='tasks'&&action==='resolve'){path+='/'+req.query.id+'/resolve';allowed=['POST'];}
 else if(req.query.resource==='staff'&&action==='deactivate'){path+='/'+req.query.id+'/deactivate';allowed=['POST'];}
 else return res.status(404).json({detail:{code:'not_found'}});
 }else if(req.query.action)return res.status(404).json({detail:{code:'not_found'}});
 if(!allowed.includes(req.method))return denyMethod(res,allowed);
 return proxy(req,res,path+querySuffix(req.query,['resource','id','action']));
}
