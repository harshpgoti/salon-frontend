import {useCallback,useEffect,useState} from 'react';
import {api} from '../lib/http';
import {useWorkspace} from './Workspace';
import {formatDateTime,formatMoney} from '../lib/i18n';
import {useBrowserLocale} from '../lib/useBrowserLocale';

const metricsUrl=(action)=>'/api/platform?'+new URLSearchParams({resource:'metrics',...(action?{action}:{})});

export default function CompanyMetrics(){
 const {session}=useWorkspace();
 const locale=useBrowserLocale();
 const [report,setReport]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState('');
 const load=useCallback(async()=>{
  try{setReport(await api(metricsUrl()));setError('');}
  catch(e){setError(e.message);}
 },[]);
 useEffect(()=>{load();},[load]);
 async function rebuild(){
  setBusy(true);setError('');
  try{await api(metricsUrl('rebuild'),{method:'POST',body:JSON.stringify({period:new Date().toISOString().slice(0,7)})});
   setNote('Current-month metrics refreshed. Historical backfill remains unavailable.');await load();}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const values=report?.live;
 const cards=values?[
  ['Monthly recurring revenue',formatMoney(values.mrr_minor,locale,'CAD'),'Active base subscription prices; excludes tax and messaging.'],
  ['Paying salons',`${values.paying_tenants} / ${values.paying_tenant_denominator}`,'Active subscription tenants / all current subscription tenants.'],
  ['Cancellations this month',values.churned_this_month,'Cancelled subscription rows last updated this month.'],
  ['Logo churn rate',values.logo_churn_available?`${values.logo_churn_rate_pct}%`:'Unavailable','Paid tenants at month start is not recorded reliably.'],
  ['Application message-cost ledger',formatMoney(values.channel_cost_month_minor,locale,'CAD'),`${values.channel_cost_messages_month} communications; synthetic/application-rated amount, not provider settlement.`],
  ['Estimated messaging use',formatMoney(values.estimated_usage_month_minor,locale,'CAD'),`${values.estimated_usage_messages_month} non-voided reservations; estimates only.`],
  ['Provider matched cost',formatMoney(values.provider_matched_cost_month_minor,locale,'CAD'),`${values.provider_matched_cost_messages_month} matched rows; ${values.provider_usage_pending_month} unmatched.`],
  ['Support backlog',`${values.support_open} / ${values.support_case_denominator}`,`Open / all recorded cases (${values.support_open_pct??'Unavailable'}%).`],
  ['Onboarding completion',`${values.onboarding_complete_count} / ${values.onboarding_tenant_denominator}`,`Completed tenants / all tenants (${values.onboarding_complete_pct??'Unavailable'}%).`],
 ]:[];
 return <section className="panel">
  <div className="panel-heading"><div><span className="eyebrow">AGGREGATE COMPANY REPORTING</span><h2>Subscription and service metrics</h2>
   {report&&<p className="muted">As of {formatDateTime(report.metric_contract.as_of,locale,{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})} · {report.metric_contract.source_date_basis} · {report.metric_contract.currency}</p>}</div>
   {['admin','finance'].includes(session.role)&&<button className="button secondary" disabled={busy} onClick={rebuild}>Refresh current month</button>}</div>
  {error&&<p className="error" role="alert">{error}</p>}
  <p className="status-text" role="status">{note||(!report&&!error?'Loading company metrics…':'')}</p>
  <div className="cards">{cards.map(([label,value,description])=><article className="card" key={label}>
   <span className="eyebrow">{label}</span><div className="number">{value??'Unavailable'}</div><small>{description}</small>
  </article>)}</div>
  {report&&<><p className="muted">{report.metric_contract.history}</p><h3>Stored monthly snapshots</h3>
   <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Period (UTC)</th><th>Value</th><th>Freshness</th></tr></thead><tbody>
    {report.snapshots.map(row=><tr key={`${row.metric}-${row.period}`}><td>{row.metric}</td><td>{row.period}</td>
     <td>{row.value_num??row.value_json?.value??'Unavailable'}</td><td>{row.stale?'Stale':'Current'}</td></tr>)}
   </tbody></table></div>
   {!report.snapshots.length&&<p className="empty">No monthly snapshot has been stored yet.</p>}
  </>}
 </section>;
}
