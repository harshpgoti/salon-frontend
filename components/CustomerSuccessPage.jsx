import {useCallback,useEffect,useState} from 'react';
import Head from 'next/head';
import {api} from '../lib/http';

const endpoint=(resource,extra={})=>'/api/platform?'+new URLSearchParams({resource,...extra});

export default function CustomerSuccessPage(){
 const [data,setData]=useState(null),[health,setHealth]=useState(null),[selected,setSelected]=useState('');
 const [error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  try{
   const [salons,tasks,suggestions]=await Promise.all([
    api(endpoint('tenants')),api(endpoint('tasks')),
    api(endpoint('tasks',{action:'suggestions'}))
   ]);
   setData({salons:salons.items||[],tasks:tasks.items||[],suggestions:suggestions.suggestions||[]});
   setError('');
  }catch(e){setError(e.message);}
 },[]);
 useEffect(()=>{load();},[load]);
 async function showHealth(tenantId){
  setSelected(tenantId);setHealth(null);setError('');
  try{setHealth(await api(endpoint('tenants',{id:tenantId,action:'health'})));}
  catch(e){setError(e.message);}
 }
 async function createTask(event,kind,tenantId=null,title=null){
  event?.preventDefault();
  const form=event?.currentTarget;
  const fields=form?new FormData(form):null;
  const body={kind,title:title||String(fields.get('title')||'').trim(),
   tenant_id:tenantId||String(fields?.get('tenant_id')||'')||null,
   detail:String(fields?.get('detail')||'').trim()||null};
  if(!body.title){setError('Enter a task title.');return;}
  setBusy(true);setError('');
  try{await api(endpoint('tasks'),{method:'POST',body:JSON.stringify(body)});
   if(form)form.reset();setNote('Success task created.');await load();}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function resolve(item){
  setBusy(true);setError('');
  try{await api(endpoint('tasks',{id:item.id,action:'resolve'}),{method:'POST',body:JSON.stringify({resolution:'done'})});
   setNote('Task marked complete.');await load();}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const salonName=id=>data?.salons.find(s=>s.tenant_id===id)?.business_name||'Salon';
 return <main className="page">
  <Head><title>Customer success · SalonOS Admin</title></Head>
  <div className="page-heading"><div><span className="eyebrow">PLATFORM ADMINISTRATION</span><h1>Customer success</h1>
   <p>Track salon onboarding, renewal and account risks using explainable business signals.</p></div>
   <button className="button secondary" onClick={load}>Refresh data</button></div>
  {error&&<p className="error" role="alert">{error}</p>}
  <p role="status" className="status-text">{note||(!data&&!error?'Loading customer success data…':'')}</p>
  <section className="panel service-form"><h2>Capture a business lead</h2>
   <p className="muted">Lead details are entered by the platform team. Salon client records and communications are never used here.</p>
   <form className="form-grid" onSubmit={e=>createTask(e,'lead')}>
    <label>Lead title<input name="title" required maxLength={160}/></label>
    <label>Notes<textarea name="detail" maxLength={2000}/></label>
    <button className="button" disabled={busy}>Create lead task</button>
   </form>
  </section>
  <section className="panel"><h2>Suggested salon follow-up</h2>
   <div className="table-wrap"><table><thead><tr><th>Salon</th><th>Reason</th><th>Action</th></tr></thead><tbody>
    {data?.suggestions.map((item,index)=><tr key={`${item.tenant_id}-${item.kind}-${index}`}>
     <td><button className="text-button" onClick={()=>showHealth(item.tenant_id)}>{salonName(item.tenant_id)}</button></td>
     <td><span className="pill">{item.kind}</span> {item.title}</td>
     <td><button className="button secondary small" disabled={busy}
      onClick={()=>createTask(null,item.kind,item.tenant_id,item.title)}>Create follow-up</button></td>
    </tr>)}
   </tbody></table></div>
   {data&&!data.suggestions.length&&<p className="empty">No onboarding or renewal signals need follow-up.</p>}
  </section>
  <section className="panel"><h2>Salon health</h2>
   <div className="table-wrap"><table><thead><tr><th>Salon customer</th><th>Subscription</th><th>Explainable health</th></tr></thead><tbody>
    {data?.salons.map(salon=><tr key={salon.tenant_id}><td><strong>{salon.business_name}</strong></td>
     <td>{salon.subscription_status||'Unconfigured'}</td><td><button className="button secondary small" onClick={()=>showHealth(salon.tenant_id)}>View health reasons</button></td></tr>)}
   </tbody></table></div>
   {data&&!data.salons.length&&<p className="empty">No salon customers are registered yet.</p>}
  </section>
  {health&&selected&&<section className="panel"><h2>{salonName(selected)} health</h2>
   <p><strong>{health.score}/100</strong> · Subscription {health.subscription_status}</p>
   <ul>{health.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
   <small className="muted">Score reasons use account status and aggregate activity only.</small>
  </section>}
  <section className="panel"><h2>Open company tasks</h2>
   <div className="table-wrap"><table><thead><tr><th>Task</th><th>Salon</th><th>Type</th><th>Action</th></tr></thead><tbody>
    {data?.tasks.map(item=><tr key={item.id}><td><strong>{item.title}</strong></td>
     <td>{item.tenant_id?salonName(item.tenant_id):'Unqualified lead'}</td><td>{item.kind}</td>
     <td><button className="button secondary small" disabled={busy} onClick={()=>resolve(item)}>Mark done</button></td></tr>)}
   </tbody></table></div>
   {data&&!data.tasks.length&&<p className="empty">No company success tasks are open.</p>}
  </section>
 </main>;
}
