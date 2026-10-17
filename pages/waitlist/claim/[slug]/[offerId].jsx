import {useEffect,useState} from 'react';
import Head from 'next/head';
import {useRouter} from 'next/router';
import {api} from '../../../../lib/http';

export default function WaitlistClaim(){
 const router=useRouter();
 const slug=typeof router.query.slug==='string'?router.query.slug:'';
 const offerId=typeof router.query.offerId==='string'?router.query.offerId:'';
 const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[appointmentId,setAppointmentId]=useState('');
 useEffect(()=>{
  const value=new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
  if(value.length>=16&&value.length<=128)setToken(value);
  else setError('This offer link is incomplete. Ask the salon for a fresh link.');
 },[]);
 async function claim(event){
  event.preventDefault();if(busy||!token||!slug||!offerId)return;
  setBusy(true);setError('');
  const storageKey=`waitlist-claim:${offerId}`;
  try{
   const idempotencyKey=sessionStorage.getItem(storageKey)||crypto.randomUUID();
   sessionStorage.setItem(storageKey,idempotencyKey);
   const query=new URLSearchParams({operation:'claim',slug,offer_id:offerId});
   const result=await api('/api/public-booking?'+query,{method:'POST',body:JSON.stringify({owner_token:token,idempotency_key:idempotencyKey})});
   setAppointmentId(result.appointment_id);
   sessionStorage.removeItem(storageKey);
   window.history.replaceState(null,'',window.location.pathname);
   setToken('');
  }catch(err){setError(err.message||'This offer could not be claimed. Contact the salon for help.');}
  finally{setBusy(false);}
 }
 return <main className="page">
  <Head><title>Claim your appointment · SalonOS</title><meta name="referrer" content="no-referrer"/></Head>
  <section className="panel" aria-labelledby="claim-heading">
   <span className="eyebrow">SALON APPOINTMENT</span>
   <h1 id="claim-heading">Claim your offered appointment</h1>
   <p>The salon offered you a time that another booking may take first. Claiming confirms the appointment for you.</p>
   {error&&<p role="alert" className="error">{error}</p>}
   {appointmentId?<p role="status" className="status-text">Your appointment is confirmed. Reference: {appointmentId}</p>:
    <form onSubmit={claim}>
     <button className="button" disabled={busy||!token||!router.isReady}>{busy?'Claiming…':'Claim appointment'}</button>
    </form>}
  </section>
 </main>;
}
