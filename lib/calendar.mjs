function parseDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new TypeError('Choose a valid calendar date.');
 const parsed=new Date(value+'T00:00:00Z');
 if(Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value)throw new TypeError('Choose a valid calendar date.');
 return parsed;
}
function formatDate(date){return date.toISOString().slice(0,10);}
export function calendarWindow(view,selectedDate){
 const date=parseDate(selectedDate);
 if(view==='day')return {from:formatDate(date),to:formatDate(date)};
 if(view==='week'){
  const monday=new Date(date);monday.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);
  return {from:formatDate(monday),to:formatDate(sunday)};
 }
 if(view==='list'){
  const end=new Date(date);end.setUTCDate(date.getUTCDate()+29);
  return {from:formatDate(date),to:formatDate(end)};
 }
 throw new TypeError('Choose a calendar view.');
}
export function moveCalendarDate(view,selectedDate,direction){
 if(!['day','week','list'].includes(view)||![-1,1].includes(direction))throw new TypeError('Choose a valid calendar navigation action.');
 const date=parseDate(selectedDate);
 const amount=view==='day'?1:view==='week'?7:30;
 date.setUTCDate(date.getUTCDate()+amount*direction);
 return formatDate(date);
}
export function dateInTimezone(instant,timeZone){
 const date=instant instanceof Date?instant:new Date(instant);
 if(Number.isNaN(date.valueOf()))throw new TypeError('Choose a valid instant.');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const fields=Object.fromEntries(parts.map(({type,value})=>[type,value]));
 return `${fields.year}-${fields.month}-${fields.day}`;
}
export function calendarRowsForKey(rows,rowsKey,selectedKey){return rowsKey===selectedKey?rows:[];}
export function calendarRequestState({busy,dataKey,activeKey,failedKey}){
 if(busy)return 'loading';
 if(failedKey===activeKey)return 'failed';
 if(dataKey!==activeKey)return 'loading';
 return 'ready';
}
