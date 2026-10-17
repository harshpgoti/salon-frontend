import {zonedInstant} from '../lib/timezone';
import {useCallback,useEffect,useRef,useState} from 'react';
import Head from 'next/head';
import {privatePage} from '../lib/session';
import {useWorkspace} from '../components/Workspace';
import {api,parseCadAmount,prepareCommand} from '../lib/http';
import {calendarRequestState,calendarRowsForKey,calendarWindow,dateInTimezone,moveCalendarDate} from '../lib/calendar.mjs';
import {formatDateTime,formatMoney} from '../lib/i18n';
import {useBrowserLocale} from '../lib/useBrowserLocale';
import {waitlistClaimUrl} from '../lib/waitlistClaim.mjs';

export default function Appointments(){
 const {tenantId}=useWorkspace();
 const locale=useBrowserLocale();
 const [loadedData,setData]=useState(null),[error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const [receiptAppointment,setReceiptAppointment]=useState(''),[ledger,setLedger]=useState(null);
 const [receiptError,setReceiptError]=useState(''),[receiptNote,setReceiptNote]=useState('');
 const [receiptBusy,setReceiptBusy]=useState(false),[receiptRevision,setReceiptRevision]=useState(0);
 const [closureItems,setClosureItems]=useState([]),[closureFollowups,setClosureFollowups]=useState([]),[closureError,setClosureError]=useState(''),[closureNote,setClosureNote]=useState(''),[closureMove,setClosureMove]=useState({});
 const [action,setAction]=useState(null),[actionBusy,setActionBusy]=useState(false);
 const [seriesPreview,setSeriesPreview]=useState(null),[seriesApproved,setSeriesApproved]=useState([]);
 const [waitlistEntries,setWaitlistEntries]=useState([]),[waitlistError,setWaitlistError]=useState(''),[waitlistNote,setWaitlistNote]=useState(''),[waitlistBusy,setWaitlistBusy]=useState(false),[waitlistLink,setWaitlistLink]=useState('');
 const [calendarView,setCalendarView]=useState('week'),[selectedDate,setSelectedDate]=useState('');
 const [locationFilter,setLocationFilter]=useState(''),[staffFilter,setStaffFilter]=useState('');
 const [waitlistLocation,setWaitlistLocation]=useState('');
 const [statusFilter,setStatusFilter]=useState(''),[sourceFilter,setSourceFilter]=useState('');
 const [calendarOffset,setCalendarOffset]=useState(0),[calendarBusy,setCalendarBusy]=useState(false),[failedCalendarKey,setFailedCalendarKey]=useState(null),[calendarError,setCalendarError]=useState('');
 const pendingKey=useRef(null),actionKey=useRef(null),receiptKey=useRef(null),closureKeys=useRef({}),waitlistCreateKey=useRef(null),waitlistOfferKeys=useRef({}),workspaceRef=useRef(tenantId),calendarRequest=useRef(0),actionTrigger=useRef(null),actionHeading=useRef(null);
 workspaceRef.current=tenantId;
 const data=loadedData?.tenantId===tenantId?loadedData:null;
 const calendarKey=JSON.stringify([tenantId,calendarView,selectedDate,locationFilter,staffFilter,statusFilter,sourceFilter]);
 const calendarAppointments=calendarRowsForKey(data?.appointments||[],data?.calendarKey,calendarKey);
 const calendarTotal=data?.calendarKey===calendarKey?data.calendarTotal:0;
 const calendarState=calendarRequestState({busy:calendarBusy,dataKey:data?.calendarKey,activeKey:calendarKey,failedKey:failedCalendarKey});
 const calendarLoading=calendarState==='loading';
 const visibleAction=action&&calendarAppointments.some(item=>item.id===action.appointment.id)?action:null;
 const receiptContext=tenantId+':'+receiptAppointment;
 const currentLedger=ledger?.context===receiptContext?ledger:null;
 const selected=calendarAppointments.find(a=>a.id===receiptAppointment);
 const waitlistLocationRow=data?.locations.find(location=>location.id===waitlistLocation);
 const waitlistToday=dateInTimezone(new Date(),waitlistLocationRow?.timezone||'UTC');
 useEffect(()=>{if(visibleAction)actionHeading.current?.focus();},[visibleAction?.appointment?.id,visibleAction?.kind,visibleAction?.to_status]);
 function restoreActionFocus(){
  const trigger=actionTrigger.current;actionTrigger.current=null;
  requestAnimationFrame(()=>{
   if(trigger?.isConnected)trigger.focus();
   else document.getElementById('calendar-heading')?.focus();
  });
 }
 function closeAction(){setAction(null);restoreActionFocus();}
 const url=(resource,extra={})=>'/api/workspace?'+new URLSearchParams({tenant_id:tenantId,resource,...extra});
 const load=useCallback(async()=>{try{
  const [services,staff,clients,locations]=await Promise.all(['services','staff','clients','locations'].map(r=>api(r==='clients'?'/api/clients?resource=search&tenant_id='+tenantId+'&limit=100':'/api/workspace?resource='+r+'&tenant_id='+tenantId)));
  if(workspaceRef.current!==tenantId)return;
  setSelectedDate(current=>current||dateInTimezone(new Date(),locations.items[0]?.timezone||'UTC'));
  setLocationFilter(current=>current||locations.items[0]?.id||'');
  setData({tenantId,appointments:[],calendarTotal:0,calendarKey:null,services:services.items.filter(s=>!s.archived_at),staff:staff.items,clients:clients.items,locations:locations.items});
 }catch(e){if(workspaceRef.current===tenantId)setError(e.message);}},[tenantId]);
 const loadCalendar=useCallback(async()=>{
  if(!tenantId||!selectedDate||data?.tenantId!==tenantId)return;
  const request=++calendarRequest.current,requestKey=JSON.stringify([tenantId,calendarView,selectedDate,locationFilter,staffFilter,statusFilter,sourceFilter]);
  setCalendarBusy(true);setFailedCalendarKey(null);setCalendarError('');
  try{
   const range=calendarWindow(calendarView,selectedDate);
   const filters={limit:'100',offset:String(calendarOffset),date_from:range.from,date_to:range.to};
   if(locationFilter)filters.location_id=locationFilter;if(staffFilter)filters.staff_id=staffFilter;
   if(statusFilter)filters.status=statusFilter;if(sourceFilter)filters.source=sourceFilter;
   const result=await api(url('appointments',filters));
   if(request!==calendarRequest.current||workspaceRef.current!==tenantId)return;
   setData(current=>current?.tenantId===tenantId?{...current,
    appointments:calendarOffset&&current.calendarKey===requestKey?[...current.appointments,...result.items]:result.items,
    calendarKey:requestKey,calendarTotal:result.total}:current);
  }catch(e){if(request===calendarRequest.current&&workspaceRef.current===tenantId){setFailedCalendarKey(requestKey);setCalendarError(e.message);}}
  finally{if(request===calendarRequest.current)setCalendarBusy(false);}
 },[tenantId,selectedDate,calendarView,locationFilter,staffFilter,statusFilter,sourceFilter,calendarOffset,data?.tenantId]);
 useEffect(()=>{setData(null);setError('');setNote('');setAction(null);setReceiptAppointment('');
  setLocationFilter('');setWaitlistLocation('');setStaffFilter('');setSelectedDate('');setCalendarOffset(0);
  pendingKey.current=null;actionKey.current=null;receiptKey.current=null;closureKeys.current={};load();},[load]);
 useEffect(()=>{loadCalendar();},[loadCalendar]);
 useEffect(()=>{
  if(!tenantId||!waitlistLocation||data?.tenantId!==tenantId)return;
  let current=true;setWaitlistError('');setWaitlistLink('');
  setWaitlistEntries([]);
  api(url('waitlist',{location_id:waitlistLocation,state:'open',limit:'100'}))
   .then(result=>{if(current)setWaitlistEntries(result.items||[]);})
   .catch(e=>{if(current)setWaitlistError(e.message);});
  return()=>{current=false;};
 },[tenantId,waitlistLocation,data?.tenantId]);
 useEffect(()=>{
  if(data?.tenantId!==tenantId)return;
  if(!waitlistLocation||!data.locations.some(location=>location.id===waitlistLocation))
   setWaitlistLocation(locationFilter||data.locations[0]?.id||'');
 },[data?.tenantId,tenantId,locationFilter,data?.locations,waitlistLocation]);
 useEffect(()=>{
  setLedger(null);setReceiptError('');
  if(!receiptAppointment)return;
  const controller=new AbortController();
  const query=action=>'/api/workspace?'+new URLSearchParams({tenant_id:tenantId,resource:'appointments',id:receiptAppointment,action});
  Promise.all([api(query('receipt-entries'),{signal:controller.signal}),api(query('receipt-total'),{signal:controller.signal})])
   .then(([entries,total])=>{if(!controller.signal.aborted)setLedger({context:receiptContext,entries,total});})
   .catch(e=>{if(!controller.signal.aborted)setReceiptError(e.message);});
  return()=>controller.abort();
 },[tenantId,receiptAppointment,receiptRevision,receiptContext]);
 useEffect(()=>{setReceiptNote('');},[receiptContext]);
 useEffect(()=>{
  if(!tenantId||!locationFilter||!selectedDate)return;
  let current=true;setClosureError('');
  Promise.all([
   api(url('closures',{location_id:locationFilter,action:'preview',exception_date:selectedDate})),
   api(url('closures',{location_id:locationFilter,action:'unsent'}))
  ]).then(([preview,followups])=>{if(current){setClosureItems(preview.items||[]);setClosureFollowups(followups.unsent_impacts||[]);}})
   .catch(e=>{if(current)setClosureError(e.message);});
  return()=>{current=false;};
 },[tenantId,locationFilter,selectedDate]);
 async function reloadClosures(){
  if(!tenantId||!locationFilter||!selectedDate)return;
  const [preview,followups]=await Promise.all([
   api(url('closures',{location_id:locationFilter,action:'preview',exception_date:selectedDate})),
   api(url('closures',{location_id:locationFilter,action:'unsent'}))
  ]);
  setClosureItems(preview.items||[]);setClosureFollowups(followups.unsent_impacts||[]);
 }
 async function trackClosure(item){
  setClosureError('');setClosureNote('');
  try{
   await api(url('closures',{location_id:locationFilter,action:'record'}),{method:'POST',body:JSON.stringify({
    appointment_id:item.appointment_id,location_id:locationFilter,exception_date:selectedDate})});
   setClosureNote('Affected booking added to the closure follow-up list.');await reloadClosures();
  }catch(e){setClosureError(e.message);}
 }
 async function resolveClosure(item,resolution){
  setClosureError('');setClosureNote('');
  try{
   const facts={impact_id:item.impact_id,resolution,impact_version:item.impact_version,
    appointment_version:item.appointment_version,
    reason:resolution==='cancelled'?'Salon closure':null};
   if(resolution==='rescheduled'){
    const value=closureMove[item.appointment_id];if(!value)throw new Error('Choose a new salon date and time first.');
    const location=data?.locations.find(row=>row.id===locationFilter);
    facts.starts_at=zonedInstant(value,location?.timezone||'UTC');
   }
   const context=tenantId+':closure:'+item.impact_id;
   const prepared=prepareCommand(closureKeys.current[item.impact_id],context,facts,()=>crypto.randomUUID());
   closureKeys.current[item.impact_id]=prepared;
   await api(url('closures',{location_id:locationFilter,action:'resolve'}),{method:'POST',body:JSON.stringify(prepared.body)});
   delete closureKeys.current[item.impact_id];
   setClosureMove(current=>{const next={...current};delete next[item.appointment_id];return next;});
   setClosureNote('Closure decision recorded and appointment updated.');await reloadClosures();await loadCalendar();
  }catch(e){setClosureError(e.message);}
 }
 async function notifyClosure(item){
  setClosureError('');setClosureNote('');
  try{
   const result=await api(url('closures',{location_id:locationFilter,action:'notify',impact_id:item.impact_id}),{method:'POST'});
   setClosureNote(result.notified===false?'Client could not be reached; staff follow-up is required.':'Closure notice queued for recording delivery.');
   await reloadClosures();
  }catch(e){setClosureError(e.message);}
 }

 async function book(e){
  e.preventDefault();if(busy||actionBusy)return;
  const form=e.currentTarget,f=new FormData(form);setBusy(true);setError('');setNote('');
  try{
   const location=data.locations.find(l=>l.id===f.get('location'));
   if(!location)throw new Error('Choose a location.');
   const facts={client_id:f.get('client'),staff_id:f.get('staff'),service_id:f.get('service'),
    location_id:location.id,starts_at:zonedInstant(String(f.get('starts_at')),location.timezone),source:String(f.get('source'))};
   pendingKey.current=prepareCommand(pendingKey.current,tenantId+':create',facts,()=>crypto.randomUUID());
   await api(url('appointments',{location_id:location.id}),{method:'POST',body:JSON.stringify(pendingKey.current.body)});
   if(workspaceRef.current!==tenantId)return;
   pendingKey.current=null;setNote('Appointment booked.');form.reset();await loadCalendar();
  }catch(e){if(workspaceRef.current===tenantId)setError(e.message);}finally{setBusy(false);}
 }
 async function addWaitlistEntry(event){
  event.preventDefault();if(waitlistBusy||!data||!locationFilter)return;
  const form=event.currentTarget,f=new FormData(form);setWaitlistBusy(true);setWaitlistError('');setWaitlistNote('');
  try{
   const facts={client_id:String(f.get('client_id')),service_id:String(f.get('service_id')),
    location_id:locationFilter,staff_id:String(f.get('staff_id')||'')||null,
    date_from:String(f.get('date_from')),date_to:String(f.get('date_to'))};
   waitlistCreateKey.current=prepareCommand(waitlistCreateKey.current,tenantId+':waitlist:create',facts,()=>crypto.randomUUID());
   const result=await api(url('waitlist'),{method:'POST',body:JSON.stringify(waitlistCreateKey.current.body)});
   waitlistCreateKey.current=null;form.reset();setWaitlistNote('Client added to the waitlist.');
   const entries=await api(url('waitlist',{location_id:waitlistLocation,state:'open',limit:'100'}));
   setWaitlistEntries(entries.items||[]);
  }catch(err){setWaitlistError(err.message);}finally{setWaitlistBusy(false);}
 }
 async function createWaitlistOffer(event,entry){
  event.preventDefault();if(waitlistBusy||!data)return;
  const form=event.currentTarget,f=new FormData(form),location=data.locations.find(item=>item.id===entry.location_id);
  setWaitlistBusy(true);setWaitlistError('');setWaitlistNote('');setWaitlistLink('');
  try{
   if(!location?.booking_slug)throw new Error('This location is not ready to accept public bookings.');
   const facts={starts_at:zonedInstant(String(f.get('starts_at')),location.timezone),
    expires_in_minutes:Number(f.get('expires_in_minutes'))};
   waitlistOfferKeys.current[entry.id]=prepareCommand(waitlistOfferKeys.current[entry.id],tenantId+':waitlist:offer:'+entry.id,facts,()=>crypto.randomUUID());
   const result=await api(url('waitlist',{id:entry.id,action:'offer'}),{method:'POST',body:JSON.stringify(waitlistOfferKeys.current[entry.id].body)});
   if(!result.owner_token)throw new Error('This offer already exists. Its one-time claim link can only be shown when it is first created.');
   const link=waitlistClaimUrl(window.location.origin,location.booking_slug,result.offer_id,result.owner_token);
   setWaitlistLink(link);setWaitlistNote('Offer ready. Share the link with this client outside the app; no message was sent.');
   waitlistOfferKeys.current[entry.id]=null;
  }catch(err){setWaitlistError(err.message);}finally{setWaitlistBusy(false);}
 }
 async function withdrawWaitlistEntry(entry){
  if(waitlistBusy)return;setWaitlistBusy(true);setWaitlistError('');setWaitlistNote('');setWaitlistLink('');
  try{
   await api(url('waitlist',{id:entry.id,action:'withdraw'}),{method:'POST'});
   setWaitlistEntries(rows=>rows.filter(row=>row.id!==entry.id));setWaitlistNote('Waitlist entry withdrawn and open offers retracted.');
  }catch(err){setWaitlistError(err.message);}finally{setWaitlistBusy(false);}
 }
 async function manage(e){
  e.preventDefault();if(actionBusy||busy||!action)return;
  const f=new FormData(e.currentTarget),appointment=action.appointment;
  setActionBusy(true);setError('');setNote('');
  try{
   if(action.kind==='series-create'){
    let seriesPayload=action.seriesPayload;
    if(!seriesPayload){
     const count=Number(f.get('occurrence_count'));
     if(!Number.isInteger(count)||count<1||count>52)throw new Error('Choose between 1 and 52 weekly visits.');
     const localStart=dateInTimezone(new Date(appointment.starts_at),appointment.local_timezone);
     const [year,month,day]=localStart.split('-').map(Number);
     const startDate=new Date(Date.UTC(year,month-1,day+7)).toISOString().slice(0,10);
     seriesPayload={client_id:appointment.client_id,staff_id:appointment.staff_id,service_id:appointment.service_id,
      location_id:appointment.location_id,timezone:appointment.local_timezone,frequency:'weekly',interval_weeks:1,
      local_time:new Date(appointment.starts_at).toLocaleTimeString('en-CA',{timeZone:appointment.local_timezone,hour:'2-digit',minute:'2-digit',hour12:false}),
      start_date:startDate,end_rule:'count',occurrence_count:count,idempotency_key:crypto.randomUUID()};
     const preview=await api(url('recurring-series',{action:'preview'}),{method:'POST',body:JSON.stringify(seriesPayload)});
     if(workspaceRef.current!==tenantId)return;
     setSeriesPreview(preview.occurrences);setSeriesApproved(preview.occurrences.filter(item=>item.valid).map(item=>item.index));
     setAction({...action,seriesPayload});setNote('Review available weekly appointments and choose which ones to book.');return;
    }
    const approved_indices=f.getAll('approved-index').map(Number);
    if(!approved_indices.length)throw new Error('Choose at least one available appointment.');
    const result=await api(url('recurring-series',{action:'create'}),{method:'POST',body:JSON.stringify({...seriesPayload,approved_indices})});
    if(workspaceRef.current!==tenantId)return;
    setAction(null);setSeriesPreview(null);setSeriesApproved([]);setNote(`${result.created_appointments.length} recurring appointments booked.`);await loadCalendar();restoreActionFocus();return;
   }
   const facts=action.kind==='transition'?
    {to_status:action.to_status,expected_version:appointment.version,reason:String(f.get('reason')||'').trim()||null}:
    action.kind==='cancel'?
    {reason:String(f.get('reason')).trim(),expected_version:appointment.version}:
    action.kind==='series-edit'?
    {mode:action.scope,occurrence_index:appointment.occurrence_index,expected_version:appointment.series_version,local_time:String(f.get('local_time'))}:
    action.kind==='series-cancel'?
    {mode:action.scope,occurrence_index:appointment.occurrence_index,expected_version:appointment.series_version}:
    {starts_at:zonedInstant(String(f.get('starts_at')),appointment.local_timezone),expected_version:appointment.version};
   if(action.kind==='cancel'&&!facts.reason)throw new Error('Enter a cancellation reason.');
   const context=tenantId+':'+action.kind+':'+appointment.id;
   actionKey.current=prepareCommand(actionKey.current,context,facts,()=>crypto.randomUUID());
   if(action.kind==='series-edit'||action.kind==='series-cancel'){
    await api(url('recurring-series',{id:appointment.series_id,action:action.kind==='series-edit'?'edit':'cancel'}),
     {method:action.kind==='series-edit'?'PATCH':'POST',body:JSON.stringify(facts)});
   }else await api(url('appointments',{id:appointment.id,action:action.kind==='transition'?'transition':action.kind}),{method:'POST',body:JSON.stringify(actionKey.current.body)});
   if(workspaceRef.current!==tenantId)return;
   actionKey.current=null;setAction(null);setNote(action.kind==='transition'?'Appointment status updated to '+action.to_status.replaceAll('_',' ')+'.':action.kind==='cancel'?'Appointment cancelled.':action.kind==='series-edit'?'Recurring appointment times updated.':action.kind==='series-cancel'?'Recurring appointments cancelled.':'Appointment rescheduled.');await loadCalendar();restoreActionFocus();
  }catch(e){if(workspaceRef.current===tenantId)setError(e.message);}finally{setActionBusy(false);}
 }
 async function recordReceipt(e){
  e.preventDefault();if(receiptBusy)return;
  const form=e.currentTarget,f=new FormData(form);setReceiptBusy(true);setReceiptError('');setReceiptNote('');
  try{
   const kind=String(f.get('kind'));
   const facts={kind,amount_minor:parseCadAmount(String(f.get('amount')),kind),method:String(f.get('method')),
    external_reference:String(f.get('reference')||'').trim()||null,note:String(f.get('note')||'').trim()||null};
   const fingerprint=JSON.stringify({tenantId,appointment:receiptAppointment,...facts});
   if(receiptKey.current?.fingerprint!==fingerprint)receiptKey.current={fingerprint,key:crypto.randomUUID()};
   await api(url('appointments',{id:receiptAppointment,action:'receipt-entries'}),{method:'POST',
    body:JSON.stringify({...facts,idempotency_key:receiptKey.current.key})});
   if(workspaceRef.current!==tenantId)return;
   receiptKey.current=null;form.reset();setReceiptNote('Receipt recorded.');
   setReceiptRevision(value=>value+1);
  }catch(e){setReceiptError(e.message);}finally{setReceiptBusy(false);}
 }

 return <main className="page">
  <Head><title>Appointments Ã‚Â· SalonOS</title></Head>
  <span className="eyebrow">YOUR SCHEDULE</span><h1>Appointments</h1>
  <p className="muted">Create and manage your salonÃ¢â‚¬â„¢s bookings.</p>
  {error&&<p role="alert" className="error">{error}</p>}
  <p role="status" className="status-text">{note||(!data?'Loading appointmentsÃ¢â‚¬Â¦':'')}</p>
  <section className="panel service-form"><h2>New appointment</h2>
   <form onSubmit={book}><fieldset className="form-grid" disabled={busy||actionBusy} style={{border:0,padding:0,margin:0,minWidth:0}}>
    <label>Client<select name="client" required><option value="">Choose a client</option>{data?.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Service<select name="service" required><option value="">Choose a service</option>{data?.services.map(s=><option key={s.id} value={s.id}>{s.name} Ã‚Â· {formatMoney(s.price_minor,locale,'CAD')}</option>)}</select></label>
    <label>Team member<select name="staff" required><option value="">Choose a team member</option>{data?.staff.filter(s=>s.is_bookable&&!s.deactivated_on).map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
    <label>Location<select name="location" required>{data?.locations.map(l=><option key={l.id} value={l.id}>{l.display_name} Ã‚Â· {l.timezone}</option>)}</select></label>
    <label>Booking type<select name="source"><option value="staff">Salon booking</option><option value="walk_in">Walk-in</option></select></label>
    <label>Date & time at salon<input name="starts_at" type="datetime-local" required/></label>
    <button className="button" disabled={busy||!data}>{busy?'BookingÃ¢â‚¬Â¦':'Book appointment'}</button>
   </fieldset></form>
  </section>
  <section className="panel service-form" aria-busy={calendarLoading}>
   <h2 id="calendar-heading" tabIndex={-1}>Salon appointments</h2>
   <div className="form-grid calendar-controls" aria-label="Calendar controls">
    <div role="group" aria-label="Calendar view">
     {['day','week','list'].map(view=><button key={view} type="button" className={'button small '+(calendarView===view?'':'secondary')}
      aria-pressed={calendarView===view} onClick={()=>{setCalendarOffset(0);setCalendarView(view);}}>{view==='day'?'Day':view==='week'?'Week':'List'}</button>)}
    </div>
    <label>Calendar date<input aria-label="Calendar date" type="date" required value={selectedDate} onChange={e=>{if(!e.target.value)return;setCalendarOffset(0);setSelectedDate(e.target.value);}}/></label>
    <div role="group" aria-label="Date navigation">
     <button className="button secondary small" type="button" aria-label="Previous date range" disabled={!selectedDate}
      onClick={()=>{setCalendarOffset(0);setSelectedDate(moveCalendarDate(calendarView,selectedDate,-1));}}>Previous</button>
     <button className="button secondary small" type="button" disabled={!data?.locations.length}
      onClick={()=>{setCalendarOffset(0);const location=data.locations.find(l=>l.id===locationFilter)||data.locations[0];setSelectedDate(dateInTimezone(new Date(),location?.timezone||'UTC'));}}>Today</button>
     <button className="button secondary small" type="button" aria-label="Next date range" disabled={!selectedDate}
      onClick={()=>{setCalendarOffset(0);setSelectedDate(moveCalendarDate(calendarView,selectedDate,1));}}>Next</button>
    </div>
    <label>Location<select value={locationFilter} onChange={e=>{setCalendarOffset(0);setLocationFilter(e.target.value);if(e.target.value)setWaitlistLocation(e.target.value);}}>
     <option value="">All accessible locations</option>{data?.locations.map(l=><option key={l.id} value={l.id}>{l.display_name}</option>)}
    </select></label>
    <label>Team member<select value={staffFilter} onChange={e=>{setCalendarOffset(0);setStaffFilter(e.target.value);}}>
     <option value="">All team members</option>{data?.staff.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}
    </select></label>
    <label>Status<select value={statusFilter} onChange={e=>{setCalendarOffset(0);setStatusFilter(e.target.value);}}>
     <option value="">All statuses</option>{['pending_approval','confirmed','checked_in','in_service','completed','cancelled','no_show','rejected'].map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}
    </select></label>
    <label>Booking source<select value={sourceFilter} onChange={e=>{setCalendarOffset(0);setSourceFilter(e.target.value);}}>
     <option value="">All sources</option><option value="public_booking">Online</option><option value="staff">Salon</option><option value="walk_in">Walk-in</option>
    </select></label>
   </div>
   <p className="muted" role="status" aria-live="polite">{calendarLoading?'Loading calendar...':data?'Showing '+calendarAppointments.length+' of '+calendarTotal+' appointments - '+calendarWindow(calendarView,selectedDate||dateInTimezone(new Date(),'UTC')).from+' to '+calendarWindow(calendarView,selectedDate||dateInTimezone(new Date(),'UTC')).to:''}</p>
   {calendarState==='failed'&&<p className="error" role="alert">{calendarError||'Calendar results could not be loaded.'} Change a filter or date to retry.</p>}
   <div className="table-wrap"><table><thead><tr><th>When</th><th>Service</th><th>Client</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>{!calendarLoading&&calendarAppointments.map(a=><tr key={a.id}>
     <td>{formatDateTime(a.starts_at,locale,{timeZone:a.local_timezone,dateStyle:'medium',timeStyle:'short'})}<small className="muted"> Ã‚Â· {a.local_timezone}</small></td>
     <td>{a.service_name}</td><td>{data.clients.find(c=>c.id===a.client_id)?.name||'Client'}</td>
     <td><span className="pill">{a.status.replaceAll('_',' ')}</span></td>
     <td><button className="button secondary small" disabled={receiptBusy||actionBusy||busy} onClick={()=>setReceiptAppointment(a.id)}>Receipts</button>{['pending_approval','confirmed','checked_in','in_service'].includes(a.status)&&<>
      {(a.status==='pending_approval'?[['confirmed','Confirm'],['rejected','Reject']]:a.status==='confirmed'?[['checked_in','Check in'],['no_show','Mark no-show']]:a.status==='checked_in'?[['in_service','Start service']]:[['completed','Complete service']]).map(([to_status,label])=><button key={to_status} className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setAction({kind:'transition',to_status,appointment:a,reason:''});}}>{label}</button>)}
     </>}{['pending_approval','confirmed','checked_in'].includes(a.status)&&<>
      {a.series_id&&<>
       <button className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setAction({kind:'series-edit',scope:'occurrence',appointment:a});}}>Edit this recurring visit</button>
       <button className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setAction({kind:'series-edit',scope:'from',appointment:a});}}>Edit this and future visits</button>
       <button className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setAction({kind:'series-cancel',scope:'occurrence',appointment:a});}}>Cancel this recurring visit</button>
       <button className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setAction({kind:'series-cancel',scope:'from',appointment:a});}}>Cancel this and future visits</button>
      </>}
      {a.status==='confirmed'&&!a.series_id&&new Date(a.starts_at)>new Date()&&<button className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setSeriesPreview(null);setSeriesApproved([]);setAction({kind:'series-create',appointment:a});}}>Repeat weekly</button>}
      <button className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setAction({kind:'reschedule',appointment:a,starts_at:'',reason:''});}}>Reschedule</button>
      <button className="button secondary small" disabled={actionBusy||busy} onClick={event=>{actionTrigger.current=event.currentTarget;setAction({kind:'cancel',appointment:a,starts_at:'',reason:''});}}>Cancel</button>
     </>}</td>
    </tr>)}</tbody>
   </table></div>
   {data&&!calendarLoading&&calendarState!=='failed'&&!calendarAppointments.length&&<p className="empty">No appointments match this date range and filter.</p>}
   {data&&!calendarLoading&&calendarAppointments.length<calendarTotal&&<button className="button secondary" type="button" disabled={calendarBusy}
    onClick={()=>setCalendarOffset(value=>value+100)}>{calendarBusy?'LoadingÃ¢â‚¬Â¦':'Load more appointments'}</button>}
  </section>
  <section className="panel service-form" aria-busy={waitlistBusy} aria-labelledby="waitlist-heading">
   <h2 id="waitlist-heading">Salon waitlist</h2>
   <p className="muted">Track clients who can take a cancelled time. Offers expire and only book when the client claims them.</p>
   {waitlistError&&<p className="error" role="alert">{waitlistError}</p>}
   {waitlistNote&&<p className="status-text" role="status">{waitlistNote}</p>}
   <label>Waitlist location<select value={waitlistLocation} onChange={event=>setWaitlistLocation(event.target.value)} required>
    <option value="">Choose a location</option>{data?.locations.map(location=><option key={location.id} value={location.id}>{location.display_name}</option>)}
   </select></label>
   <form key={waitlistLocation} className="form-grid" onSubmit={addWaitlistEntry}>
    <label>Client<select name="client_id" required disabled={!waitlistLocation||waitlistBusy}>
     <option value="">Choose a client</option>{data?.clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}
    </select></label>
    <label>Service<select name="service_id" required disabled={!waitlistLocation||waitlistBusy}>
     <option value="">Choose a service</option>{data?.services.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}
    </select></label>
    <label>Preferred team member<select name="staff_id" disabled={!waitlistLocation||waitlistBusy}>
     <option value="">Any qualified team member</option>{data?.staff.filter(member=>member.is_bookable&&!member.deactivated_on).map(member=><option key={member.id} value={member.id}>{member.display_name}</option>)}
    </select></label>
    <label>Available from<input name="date_from" type="date" min={waitlistToday} defaultValue={waitlistToday} required disabled={!waitlistLocation||waitlistBusy}/></label>
    <label>Available through<input name="date_to" type="date" min={waitlistToday} defaultValue={waitlistToday} required disabled={!waitlistLocation||waitlistBusy}/></label>
    <button className="button" disabled={!waitlistLocation||waitlistBusy}>{waitlistBusy?'Saving…':'Add to waitlist'}</button>
   </form>
   <h3>Waiting clients</h3>
   {!waitlistError&&waitlistEntries.length===0&&<p className="empty">No open waitlist entries for this location.</p>}
   {waitlistEntries.map(entry=>{
    const client=data?.clients.find(item=>item.id===entry.client_id),service=data?.services.find(item=>item.id===entry.service_id);
    return <article className="panel" key={entry.id}>
     <h4>{client?.name||'Client'} · {service?.name||'Service'}</h4>
     <p>{entry.date_from} through {entry.date_to} · {entry.staff_id?data?.staff.find(member=>member.id===entry.staff_id)?.display_name||'Preferred staff':'Any qualified team member'}</p>
     <form className="form-grid" onSubmit={event=>createWaitlistOffer(event,entry)}>
      <label>Offered date and time at salon<input name="starts_at" type="datetime-local" required disabled={waitlistBusy}/></label>
      <label>Offer expires<select name="expires_in_minutes" defaultValue="60" disabled={waitlistBusy}>
       <option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option>
      </select></label>
      <button className="button secondary" disabled={waitlistBusy}>Prepare claim link</button>
      <button className="button secondary" type="button" disabled={waitlistBusy} onClick={()=>withdrawWaitlistEntry(entry)}>Withdraw</button>
     </form>
    </article>;
   })}
   {waitlistLink&&<label>One-time claim link to share with the client<input aria-label="One-time waitlist claim link" readOnly value={waitlistLink} onFocus={event=>event.target.select()}/></label>}
  </section>
  <section className="panel service-form" aria-busy={!selectedDate||!locationFilter}>
   <h2>Location closures</h2>
   <p className="muted">Review bookings affected on {selectedDate||'the selected date'} at {data?.locations.find(row=>row.id===locationFilter)?.display_name||'this location'}.</p>
   {closureError&&<p className="error" role="alert">{closureError}</p>}
   {closureNote&&<p className="status-text" role="status">{closureNote}</p>}
   {closureItems.length? <div className="table-wrap"><table><thead><tr><th>Appointment</th><th>Client</th><th>Current state</th><th>Decision</th></tr></thead><tbody>
    {closureItems.map(item=><tr key={item.appointment_id}>
     <td>{formatDateTime(item.starts_at,locale,{timeZone:data?.locations.find(row=>row.id===locationFilter)?.timezone||'UTC',dateStyle:'medium',timeStyle:'short'})}</td>
     <td>{data?.clients.find(row=>row.id===item.client_id)?.name||'Client'}</td>
     <td>{item.impact_status||'Needs review'}</td>
     <td>{!item.impact_id?<button className="button secondary small" type="button" onClick={()=>trackClosure(item)}>Track affected booking</button>:item.impact_status==='active'?<>
      <button className="button secondary small" type="button" onClick={()=>resolveClosure(item,'cancelled')}>Cancel booking</button>
      <button className="button secondary small" type="button" onClick={()=>resolveClosure(item,'left')}>Leave flagged</button>
      <label>New time<input type="datetime-local" value={closureMove[item.appointment_id]||''} onChange={event=>setClosureMove(current=>({...current,[item.appointment_id]:event.target.value}))}/></label>
      <button className="button secondary small" type="button" onClick={()=>resolveClosure(item,'rescheduled')}>Reschedule</button>
      <button className="button secondary small" type="button" onClick={()=>notifyClosure(item)}>Notify client</button>
     </>:<span>Decision recorded</span>}</td>
    </tr>)}
   </tbody></table></div>:!closureError?<p className="empty">No live appointments are affected by this closure date.</p>:null}
   {closureFollowups.length>0&&<div><h3>Staff follow-up required</h3><ul>{closureFollowups.map(item=><li key={item.id}>
    {data?.clients.find(row=>row.id===item.client_id)?.name||'Client'} — {item.contact_kind?`unreachable via ${item.contact_kind}`:'no contact details'}; contact this client outside the app.
   </li>)}</ul></div>}
  </section>
  {visibleAction&&<section className="panel service-form" id="manage-appointment" aria-labelledby="manage-appointment-heading">
   <h2 ref={actionHeading} id="manage-appointment-heading" tabIndex={-1}>{visibleAction.kind==='transition'?'Update appointment status':visibleAction.kind==='cancel'?'Cancel appointment':visibleAction.kind==='series-create'?'Create weekly appointments':visibleAction.kind==='series-edit'?'Edit recurring appointments':visibleAction.kind==='series-cancel'?'Cancel recurring appointments':'Reschedule appointment'}</h2>
   <p>{visibleAction.appointment.service_name} Ã‚Â· {formatDateTime(visibleAction.appointment.starts_at,locale,{timeZone:visibleAction.appointment.local_timezone,dateStyle:'medium',timeStyle:'short'})} Ã‚Â· {visibleAction.appointment.local_timezone}</p>
   <form onSubmit={manage}><fieldset className="form-grid" disabled={actionBusy||busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
    {visibleAction.kind==='series-create'&&!seriesPreview?<>
     <p>Start one week after this appointment. We will preview each salon-local time and only book the visits you approve.</p>
     <label>Number of weekly appointments<input name="occurrence_count" type="number" min="1" max="52" defaultValue="4" required/></label>
    </>:visibleAction.kind==='series-create'?<>
     <p>Choose the individually available visits to book. Unchecked or unavailable times will remain unbooked.</p>
     <fieldset className="form-grid"><legend>Availability review</legend>{seriesPreview.map(item=><label key={item.index}>
      <input name="approved-index" type="checkbox" value={item.index} disabled={!item.valid}
       checked={item.valid&&seriesApproved.includes(item.index)} onChange={event=>setSeriesApproved(current=>event.target.checked?[...current,item.index]:current.filter(index=>index!==item.index))}/>
      {item.local_date} at {item.local_time} ({item.timezone}) — {item.valid?'Available':item.reason.replaceAll('_',' ')}
     </label>)}</fieldset>
    </>:visibleAction.kind==='series-edit'?<>
     <p>Change the salon-local time for {visibleAction.scope==='from'?'this and future':'this'} occurrence{visibleAction.scope==='from'?'s':''}. Each time is checked against current hours and conflicts.</p>
     <label>New local time<input name="local_time" type="time" required defaultValue={new Date(visibleAction.appointment.starts_at).toLocaleTimeString('en-CA',{timeZone:visibleAction.appointment.local_timezone,hour:'2-digit',minute:'2-digit',hour12:false})}/></label>
    </>:visibleAction.kind==='series-cancel'?<p>Cancel {visibleAction.scope==='from'?'this and future':'this'} occurrence. The salon history remains available.</p>:visibleAction.kind==='transition'?<>
     <p role="status">Change status to <strong>{visibleAction.to_status.replaceAll('_',' ')}</strong>. This is recorded in the appointment history.</p>
     {['rejected','cancelled','no_show'].includes(visibleAction.to_status)&&<label>Reason<textarea name="reason" maxLength={240} required value={visibleAction.reason} onChange={e=>setAction({...visibleAction,reason:e.target.value})}/></label>}
    </>:visibleAction.kind==='cancel'?
     <label>Cancellation reason<textarea name="reason" maxLength={240} required value={visibleAction.reason} onChange={e=>setAction({...visibleAction,reason:e.target.value})}/></label>:
     <label>New date & time at salon<input name="starts_at" type="datetime-local" required value={visibleAction.starts_at} onChange={e=>setAction({...visibleAction,starts_at:e.target.value})}/></label>}
    <button className="button">{actionBusy?'SavingÃ¢â‚¬Â¦':visibleAction.kind==='transition'?'Save status':visibleAction.kind==='cancel'||visibleAction.kind==='series-cancel'?'Confirm cancellation':visibleAction.kind==='series-create'?(seriesPreview?'Book approved appointments':'Preview availability'):visibleAction.kind==='series-edit'?'Save recurring time':'Save new time'}</button>
    <button className="button secondary" type="button" onClick={closeAction}>Close</button>
   </fieldset></form>
  </section>}
  <section className="panel" id="recorded-receipts"><h2>Recorded salon receipts</h2>
   <p className="muted">Manual CAD records of your salonÃ¢â‚¬â„¢s payments, refunds and adjustments. Record card receipts after taking payment.</p>
   <label className="field">Appointment<select value={receiptAppointment} disabled={receiptBusy} onChange={e=>setReceiptAppointment(e.target.value)}>
    <option value="">Choose an appointment</option>{calendarAppointments.map(a=><option key={a.id} value={a.id}>
     {a.service_name} Ã‚Â· {data.clients.find(c=>c.id===a.client_id)?.name||'Client'} Ã‚Â· {formatDateTime(a.starts_at,locale,{timeZone:a.local_timezone,dateStyle:'medium',timeStyle:'short'})}
    </option>)}
   </select></label>
   {receiptError&&<p role="alert" className="error">{receiptError}</p>}
   <p role="status" className="status-text">{receiptNote||(receiptAppointment&&!currentLedger&&!receiptError?'Loading receiptsÃ¢â‚¬Â¦':'')}</p>
   {selected&&<>
    <p>Booked service value: <strong>{formatMoney(selected.price_minor,locale,'CAD')}</strong> Ã‚Â· Recorded salon total: <strong>{currentLedger?formatMoney(currentLedger.total.recorded_total_minor,locale,'CAD'):'LoadingÃ¢â‚¬Â¦'}</strong></p>
    <p className="muted">These totals belong to this salon appointment. Platform subscription revenue is shown separately in platform finance.</p>
    {currentLedger&&<div className="table-wrap"><table><thead><tr><th>Posted</th><th>Kind</th><th>Recorded amount</th><th>Method</th><th>Reference</th></tr></thead>
     <tbody>{currentLedger.entries.items.map(entry=><tr key={entry.id}>
      <td>{formatDateTime(entry.posted_at,locale,{timeZone:selected.local_timezone,dateStyle:'medium',timeStyle:'short'})}</td>
      <td>{entry.kind}</td><td>{formatMoney(entry.amount_minor,locale,'CAD')}</td><td>{entry.method}</td><td>{entry.external_reference||'Ã¢â‚¬â€'}</td>
     </tr>)}</tbody>
    </table>{!currentLedger.entries.total&&<p className="empty">No receipts recorded yet.</p>}</div>}
    <h3>Record a receipt</h3><p className="muted">Enter positive amounts for payments and refunds. Adjustments can be positive or negative.</p>
    <form key={receiptContext} onSubmit={recordReceipt}>
     <fieldset className="form-grid" disabled={receiptBusy} style={{border:0,padding:0,margin:0,minWidth:0}}>
      <label>Kind<select name="kind" defaultValue="payment"><option value="payment">Payment</option><option value="refund">Refund</option><option value="adjustment">Adjustment</option></select></label>
      <label>Amount (CAD)<input name="amount" inputMode="decimal" maxLength={40} placeholder="0.00" required/></label>
      <label>Method<select name="method" defaultValue="cash"><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label>
      <label>Reference (optional)<input name="reference" maxLength={120}/></label>
      <label>Note (optional)<textarea name="note" maxLength={500}/></label>
      <button className="button" disabled={!currentLedger}>{receiptBusy?'RecordingÃ¢â‚¬Â¦':'Record receipt'}</button>
     </fieldset>
    </form>
   </>}
  </section>
 </main>;
}
export const getServerSideProps=privatePage('staff');
