import {proxy,denyMethod,querySuffix,UUID} from '../../lib/proxy.js';
const routes={services:['GET','POST'],resources:['GET','POST'],staff:['GET','POST'],locations:['GET'],appointments:['GET','POST'],'recurring-series':['POST','PATCH'],waitlist:['GET','POST'],summary:['GET'],
 staff_shifts:['GET','POST'],staff_leave:['GET','POST'],staff_qualifications:['GET','PUT'],staff_locations:['GET','PUT'],closures:['GET','POST']};
export default function handler(req,res){
 const tenant=req.query.tenant_id;if(typeof tenant!=='string'||!UUID.test(tenant))return res.status(400).json({detail:{code:'invalid_tenant_id'}});
 if(typeof req.query.resource!=='string'||!Object.hasOwn(routes,req.query.resource))return res.status(404).json({detail:{code:'not_found'}});
 let allowed=routes[req.query.resource];if(!allowed)return res.status(404).json({detail:{code:'not_found'}});
 let path='/v1/tenants/'+tenant;
 if(req.query.resource==='recurring-series'){
  const action=req.query.action;
  if(!req.query.id&&action==='preview')path+='/recurring-series/preview';
  else if(!req.query.id&&action==='create')path+='/recurring-series';
  else if(req.query.id!==undefined){
   if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_series_id'}});
   if(action==='edit'){path+='/recurring-series/'+req.query.id;allowed=['PATCH'];}
   else if(action==='cancel'){path+='/recurring-series/'+req.query.id+'/cancel';allowed=['POST'];}
   else return res.status(404).json({detail:{code:'not_found'}});
  }
  else return res.status(404).json({detail:{code:'not_found'}});
  if(!allowed.includes(req.method))return denyMethod(res,allowed);
  return proxy(req,res,path+querySuffix(req.query,['tenant_id','resource','id','action']));
 }
 if(req.query.resource==='waitlist'){
  if(req.query.id!==undefined){
   if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_waitlist_id'}});
   if(Object.keys(req.query).some(key=>!['tenant_id','resource','id','action'].includes(key)))return res.status(400).json({detail:{code:'invalid_waitlist_action'}});
   if(req.query.action==='offer'){path+='/waitlist/'+req.query.id+'/offers';allowed=['POST'];}
   else if(req.query.action==='withdraw'){path+='/waitlist/'+req.query.id+'/withdraw';allowed=['POST'];}
   else return res.status(404).json({detail:{code:'not_found'}});
  }else{
   if(req.query.action)return res.status(404).json({detail:{code:'not_found'}});
   path+='/waitlist';
   if(req.method==='GET'){
    if(Object.keys(req.query).some(key=>!['tenant_id','resource','location_id','state','limit','offset'].includes(key)))return res.status(400).json({detail:{code:'invalid_waitlist_filter'}});
    if(req.query.location_id!==undefined&&(typeof req.query.location_id!=='string'||!UUID.test(req.query.location_id)))return res.status(400).json({detail:{code:'invalid_location_id'}});
    if(req.query.state!==undefined&&(typeof req.query.state!=='string'||!['open','withdrawn','fulfilled'].includes(req.query.state)))return res.status(400).json({detail:{code:'invalid_state'}});
    for(const key of ['limit','offset'])if(req.query[key]!==undefined&&(typeof req.query[key]!=='string'||!/^\d+$/.test(req.query[key])))return res.status(400).json({detail:{code:'invalid_'+key}});
    if(req.query.limit!==undefined&&(Number(req.query.limit)<1||Number(req.query.limit)>100))return res.status(400).json({detail:{code:'invalid_limit'}});
    if(req.query.offset!==undefined&&Number(req.query.offset)>10000)return res.status(400).json({detail:{code:'invalid_offset'}});
   }else if(Object.keys(req.query).some(key=>!['tenant_id','resource'].includes(key)))return res.status(400).json({detail:{code:'invalid_waitlist_request'}});
  }
  if(!allowed.includes(req.method))return denyMethod(res,allowed);
  return proxy(req,res,path+querySuffix(req.query,['tenant_id','resource','id','action']));
 }
 if(req.query.resource.startsWith('staff_')){
  const staffId=req.query.staff_id;
  if(typeof staffId!=='string'||!UUID.test(staffId))return res.status(400).json({detail:{code:'invalid_staff_id'}});
  const suffix={staff_shifts:'shifts',staff_leave:'leave',staff_qualifications:'qualifications',staff_locations:'locations'}[req.query.resource];
  path='/v1/tenants/'+tenant+'/staff/'+staffId+'/'+suffix;
  if(req.query.id||req.query.action)return res.status(404).json({detail:{code:'not_found'}});
 }else if(req.query.resource==='staff'&&req.query.id){
  if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_id'}});
  if(req.query.action==='deactivation-preview'){path='/v1/tenants/'+tenant+'/staff/'+req.query.id+'/deactivation-preview';allowed=['GET'];}
  else if(req.query.action==='deactivate'){path='/v1/tenants/'+tenant+'/staff/'+req.query.id+'/deactivate';allowed=['POST'];}
  else return res.status(404).json({detail:{code:'not_found'}});
 }else if(req.query.resource==='staff'&&req.query.action)return res.status(404).json({detail:{code:'not_found'}});
 else if(req.query.resource==='appointments'&&!req.query.id){
  const allowedFilters=new Set(['tenant_id','resource','location_id','staff_id','date_from','date_to','status','source','limit','offset']);
  if(Object.keys(req.query).some(key=>!allowedFilters.has(key)))return res.status(400).json({detail:{code:'invalid_appointment_filter'}});
  for(const key of ['location_id','staff_id'])if(req.query[key]!==undefined&&(typeof req.query[key]!=='string'||!UUID.test(req.query[key])))return res.status(400).json({detail:{code:'invalid_'+key}});
  for(const key of ['date_from','date_to'])if(req.query[key]!==undefined&&(typeof req.query[key]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(req.query[key])))return res.status(400).json({detail:{code:'invalid_'+key}});
  if(req.query.status!==undefined&&!['pending_approval','confirmed','checked_in','in_service','completed','cancelled','no_show','rejected'].includes(req.query.status))return res.status(400).json({detail:{code:'invalid_status'}});
  if(req.query.source!==undefined&&!['staff','walk_in','public_booking'].includes(req.query.source))return res.status(400).json({detail:{code:'invalid_source'}});
  for(const key of ['limit','offset'])if(req.query[key]!==undefined&&(typeof req.query[key]!=='string'||!/^\d+$/.test(req.query[key])))return res.status(400).json({detail:{code:'invalid_'+key}});
  if(req.query.limit!==undefined&&(Number(req.query.limit)<1||Number(req.query.limit)>100))return res.status(400).json({detail:{code:'invalid_limit'}});
  if(req.query.offset!==undefined&&Number(req.query.offset)>10000)return res.status(400).json({detail:{code:'invalid_offset'}});
 }else if(req.query.resource==='appointments'&&!req.query.id&&req.query.action)return res.status(404).json({detail:{code:'not_found'}});
 else if(req.query.resource==='resources'){
  if(req.query.action)return res.status(404).json({detail:{code:'not_found'}});
  if(req.query.id){if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_id'}});
   if(req.method!=='PATCH')return denyMethod(res,['PATCH']);path+='/resources/'+req.query.id;allowed=['PATCH'];
  }else if(req.method==='GET'){
   if(typeof req.query.location_id!=='string'||!UUID.test(req.query.location_id))return res.status(400).json({detail:{code:'invalid_location_id'}});
   path+='/resources';
  }else path+='/resources';
 }else if(req.query.resource==='services'&&req.query.id&&req.query.action==='resources'){
  if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_id'}});
  if(typeof req.query.location_id!=='string'||!UUID.test(req.query.location_id))return res.status(400).json({detail:{code:'invalid_location_id'}});
  path+='/services/'+req.query.id+'/resources';allowed=['GET','PUT'];
 }else if(req.query.resource==='services'&&req.query.id&&req.query.action==='phases'){
  if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_id'}});
  path+='/services/'+req.query.id+'/phases';allowed=['GET','PUT'];
 }else if(req.query.resource==='closures'){
  const location=req.query.location_id,action=req.query.action||'preview';
  if(typeof location!=='string'||!UUID.test(location))return res.status(400).json({detail:{code:'invalid_location_id'}});
  if(['preview','impacts'].includes(action)){
   if(req.method!=='GET')return denyMethod(res,['GET']);
   if(typeof req.query.exception_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(req.query.exception_date))return res.status(400).json({detail:{code:'invalid_exception_date'}});
   path+='/closures/'+location+'/impacts'+(action==='preview'?'/preview':'');allowed=['GET'];
  }else if(action==='unsent'){
   if(req.method!=='GET')return denyMethod(res,['GET']);path+='/closures/'+location+'/impacts/unsent';allowed=['GET'];
  }else if(action==='record'){
   if(req.method!=='POST')return denyMethod(res,['POST']);path+='/closures/'+location+'/impacts';allowed=['POST'];
  }else if(action==='resolve'){
   if(req.method!=='POST')return denyMethod(res,['POST']);path+='/closures/'+location+'/impacts/resolve';allowed=['POST'];
  }else if(action==='notify'){
   if(req.method!=='POST')return denyMethod(res,['POST']);
   if(typeof req.query.impact_id!=='string'||!UUID.test(req.query.impact_id))return res.status(400).json({detail:{code:'invalid_impact_id'}});
   path+='/closures/'+location+'/impacts/'+req.query.impact_id+'/notify';allowed=['POST'];
  }else return res.status(404).json({detail:{code:'not_found'}});
 }
 else path+='/'+req.query.resource;
 if(req.query.resource!=='staff'&&req.query.resource!=='resources'&&!(req.query.resource==='services'&&['resources','phases'].includes(req.query.action))&&req.query.id){if(typeof req.query.id!=='string'||!UUID.test(req.query.id))return res.status(400).json({detail:{code:'invalid_id'}});
 if(req.query.resource==='services'&&!req.query.action){path+='/'+req.query.id;allowed=['PATCH'];}
 else if(req.query.resource==='services'&&['archive','restore'].includes(req.query.action)){path+='/'+req.query.id+'/'+req.query.action;allowed=['POST'];}
 else if(req.query.resource==='appointments'&&['cancel','reschedule'].includes(req.query.action)){path+='/'+req.query.id+'/'+req.query.action;allowed=['POST'];}
 else if(req.query.resource==='appointments'&&req.query.action==='transition'){path+='/'+req.query.id+'/transitions';allowed=['POST'];}
 else if(req.query.resource==='appointments'&&['receipt-entries','receipt-total'].includes(req.query.action)){path+='/'+req.query.id+'/'+req.query.action;allowed=req.query.action==='receipt-entries'?['GET','POST']:['GET'];}
 else return res.status(404).json({detail:{code:'not_found'}});
 }else if(req.query.resource!=='staff'&&req.query.resource!=='closures'&&!(req.query.resource==='services'&&['resources','phases'].includes(req.query.action))&&req.query.action)return res.status(404).json({detail:{code:'not_found'}});
 if(!allowed.includes(req.method))return denyMethod(res,allowed);
 const excluded=['tenant_id','resource','id','action'];
 if(req.query.resource==='closures')excluded.push('location_id','impact_id');
 if(req.query.resource!=='appointments')excluded.push('staff_id');
 return proxy(req,res,path+querySuffix(req.query,excluded));
}
