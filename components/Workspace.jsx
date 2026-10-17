import {createContext,useContext} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import {translate} from '../lib/i18n';
import {useBrowserLocale} from '../lib/useBrowserLocale';
const Context=createContext(null);
export function useWorkspace(){return useContext(Context);}
const salonNav=[['/salon','Overview','◈'],['/today','Today','☀'],['/appointments','Appointments','▦'],['/clients','Clients','♧'],['/services','Services','◇'],['/inbox','Inbox','✉'],['/retention','Retention','↻'],['/reports','Reports','▥'],['/team','Team','♙'],['/settings','Settings & billing','⚙']];
const companyNav=[['/admin','Overview','◈'],['/admin/salons','Salon customers','♧'],['/admin/success','Customer success','✓'],['/admin/support','Support','✉'],['/admin/finance','Finance','▥'],['/admin/team','Platform team','♙'],['/admin/operations','Operations','⚙']];
const permissions={admin:['Overview','Salon customers','Customer success','Support','Finance','Platform team','Operations'],support:['Salon customers','Support'],finance:['Salon customers','Finance'],success:['Salon customers','Customer success']};
export default function Workspace({session,children}){
 const router=useRouter();
 const locale=useBrowserLocale();
 const company=session.surface==='company';
 const workspaces=session.workspaces||[];
 const workspace=workspaces.find(w=>w.tenant_id===router.query.tenant)||workspaces[0];
 const tenantId=workspace?.tenant_id||'';
 const setTenantId=(value)=>{if(workspaces.some(w=>w.tenant_id===value))router.push({pathname:router.pathname,query:{tenant:value}});};
 const nav=company?companyNav.filter(n=>(permissions[session.role]||[]).includes(n[1])):salonNav;
 const href=(path)=>company?path:{pathname:path,query:tenantId?{tenant:tenantId}:{}};
 async function logout(){
  const r=await fetch('/api/auth/'+session.surface+'/logout',{method:'POST'});
  if(r.ok)window.location.assign(company?'/admin/login':'/login');
  else window.alert('Sign out could not complete. Please try again.');
 }
 return <Context.Provider value={{session,workspace,tenantId,setTenantId}}><div className={'app-shell '+(company?'platform':'salon')}>
  <a className="skip-link" href="#workspace-main">{translate(locale,'a11y.skipContent')}</a>
  <aside className="sidebar"><Link className="brand" href={href(company?'/admin':'/salon')}><span className="brand-mark">S</span> Salon<span className="brand-light">OS</span></Link><div className="surface-label">{company?'PLATFORM ADMIN':'SALON WORKSPACE'}</div>
   <nav aria-label={company?'Platform navigation':'Salon navigation'}>{nav.map(([path,label,icon])=><Link key={path} href={href(path)} className={router.pathname===path?'nav-link active':'nav-link'} aria-current={router.pathname===path?'page':undefined}><span aria-hidden="true">{icon}</span>{label}</Link>)}</nav>
   <div className="sidebar-bottom"><div className="avatar">{company?'A':'M'}</div><div><strong>{company?'Platform operator':workspace?.business_name||'Your salon'}</strong><small>{session.role||workspace?.role||'member'}</small></div></div>
  </aside><div className="workspace-area"><header className="topbar"><div><span className="eyebrow">{company?'Company operations':'Your business, connected'}</span><strong>{company?'Platform workspace':workspace?.business_name||'Welcome to SalonOS'}</strong></div><div className="top-actions">
   {session.demo&&<span className="pill">Local demo</span>}
   {!company&&workspaces.length>1&&<label className="workspace-selector">Salon<select value={tenantId} onChange={e=>setTenantId(e.target.value)}>{workspaces.map(w=><option key={w.tenant_id} value={w.tenant_id}>{w.business_name}</option>)}</select></label>}
   <span className="account-email">{session.email}</span><button className="button secondary small" onClick={logout}>Sign out</button></div></header>
  <div id="workspace-main" className="workspace-content" tabIndex={-1} key={tenantId}>{!company&&!tenantId&&router.pathname!=='/onboarding'?<div className="page"><h1>Set up your salon</h1><p>Create your business workspace to get started.</p><Link className="button" href="/onboarding">Set up salon</Link></div>:children}</div>
  </div></div></Context.Provider>;
}
