import assert from 'node:assert/strict';
import {test} from 'node:test';
import {calendarRequestState,calendarRowsForKey,calendarWindow,dateInTimezone,moveCalendarDate} from '../lib/calendar.mjs';

test('day, Monday-based week and list windows are calendar-date based',()=>{
 assert.deepEqual(calendarWindow('day','2026-10-13'),{from:'2026-10-13',to:'2026-10-13'});
 assert.deepEqual(calendarWindow('week','2026-10-13'),{from:'2026-10-12',to:'2026-10-18'});
 assert.deepEqual(calendarWindow('list','2026-10-13'),{from:'2026-10-13',to:'2026-11-11'});
});
test('navigation crosses month and year boundaries by the selected view',()=>{
 assert.equal(moveCalendarDate('day','2026-12-31',1),'2027-01-01');
 assert.equal(moveCalendarDate('week','2026-12-31',1),'2027-01-07');
 assert.equal(moveCalendarDate('list','2026-12-31',-1),'2026-12-01');
});
test('today and selected dates use the salon timezone across UTC midnight and DST',()=>{
 assert.equal(dateInTimezone('2026-10-13T02:30:00Z','America/Toronto'),'2026-10-12');
 assert.equal(dateInTimezone('2026-03-08T07:30:00Z','America/Toronto'),'2026-03-08');
});
test('invalid ranges and view names do not silently pick a date',()=>{
 assert.throws(()=>calendarWindow('month','2026-10-13'),/calendar view/);
 assert.throws(()=>calendarWindow('day','2026-02-30'),/calendar date/);
 assert.throws(()=>moveCalendarDate('day','2026-10-13',0),/navigation action/);
});
test('results from an earlier filter selection are hidden while the next selection loads',()=>{
 const rows=[{id:'synthetic-appointment'}];
 assert.deepEqual(calendarRowsForKey(rows,'week|2026-10-12','day|2026-10-13'),[]);
 assert.deepEqual(calendarRowsForKey(rows,'week|2026-10-12','week|2026-10-12'),rows);
});
test('a failed filter request exits loading without restoring rows from another filter',()=>{
 assert.equal(calendarRequestState({busy:false,dataKey:'old',activeKey:'new',failedKey:'new'}),'failed');
 assert.equal(calendarRowsForKey([{id:'old'}],'old','new').length,0);
 assert.equal(calendarRequestState({busy:false,dataKey:'old',activeKey:'new',failedKey:null}),'loading');
});
