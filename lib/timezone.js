// Resolve salon wall-clock time without trusting the browser's local timezone.
// Multiple matches during a fall-back transition require a different time.
export function zonedInstant(local,timeZone){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('Enter a valid appointment date and time.');
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const naive=Date.parse(local+':00Z');const matches=[];
 for(let offset=-14*60;offset<=14*60;offset+=15){
  const instant=new Date(naive-offset*60000);
  const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));
  const wall=parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
  if(wall===local)matches.push(instant.toISOString());
 }
 if(!matches.length)throw new Error('This local time does not exist because the clocks change. Choose another time.');
 if(matches.length>1)throw new Error('This local time occurs twice because the clocks change. Choose an unambiguous time.');
 return matches[0];
}
