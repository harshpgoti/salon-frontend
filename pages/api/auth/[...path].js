import {proxy,denyMethod} from '../../../lib/proxy.js';
export default function handler(req,res){
 const parts=req.query.path;
 if(!Array.isArray(parts)||parts.length!==2||!['staff','company'].includes(parts[0])||!['session','demo','logout'].includes(parts[1]))return res.status(404).json({detail:{code:'not_found'}});
 const allowed=parts[1]==='session'?['GET']:['POST'];
 if(!allowed.includes(req.method))return denyMethod(res,allowed);
 return proxy(req,res,'/v1/auth/'+parts.join('/'));
}
