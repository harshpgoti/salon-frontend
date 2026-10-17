export function privatePage(surface){return async function(context){
 context.res.setHeader('Cache-Control','private, no-store');
 const login=surface==='company'?'/admin/login':'/login';
 if(!context.req.headers.cookie)return{redirect:{destination:login,permanent:false}};
 try{
  const response=await fetch(new URL('/v1/auth/'+surface+'/session',process.env.API_BASE_URL),{headers:{cookie:context.req.headers.cookie},signal:AbortSignal.timeout(5000)});
  if(!response.ok)return{redirect:{destination:login+(response.status>=500?'?error=service':''),permanent:false}};
  return{props:{session:await response.json()}};
 }catch{return{redirect:{destination:login+'?error=service',permanent:false}};}
};}
export function loginPage(surface){return async(context)=>{
 context.res.setHeader('Cache-Control','private, no-store');
 const effective=surface==='staff'&&context.query.surface==='company'?'company':surface;
 if(context.query.status==='signed-in'){
  const resolved=await privatePage(effective)(context);
  if(resolved.props?.session)return{redirect:{destination:effective==='company'?'/admin':'/salon',permanent:false}};
  return resolved;
 }
 if(effective!==surface)return{redirect:{destination:'/admin/login',permanent:false}};
 return {props:{surface,demoEnabled:process.env.DEMO_AUTH_ENABLED==='true'}};
};}
