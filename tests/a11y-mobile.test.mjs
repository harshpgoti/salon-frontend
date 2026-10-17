import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('salon and public booking skip links focus a real main-content target',async()=>{
 const [workspace,booking]=await Promise.all([
  read('../components/Workspace.jsx'),read('../pages/book/[slug].jsx'),
 ]);
 assert.match(workspace,/href="#workspace-main"/);
 assert.match(workspace,/<div id="workspace-main"[^>]*tabIndex=\{-1\}/);
 assert.match(booking,/href="#public-booking-main"/);
 assert.match(booking,/<main id="public-booking-main" tabIndex=\{-1\}/);
});

test('booking, calendar/list and company finance announce busy, errors and results',async()=>{
 const [booking,calendar,metrics]=await Promise.all([
  read('../pages/book/[slug].jsx'),read('../pages/appointments.jsx'),read('../components/CompanyMetrics.jsx'),
 ]);
 assert.match(booking,/aria-busy=\{busy \|\| manageLoading \|\| manageActionBusy\}/);
 assert.match(booking,/role="alert"/);
 assert.match(booking,/aria-live="polite"/);
 assert.match(booking,/contactNameRef\.current\?\.focus\(\)/);
 assert.match(booking,/receiptRef\.current\?\.focus\(\)/);
 assert.match(calendar,/role="alert"/);
 assert.match(calendar,/aria-live="polite"/);
 assert.match(calendar,/\['day','week','list'\]/);
 assert.match(calendar,/actionHeading\.current\?\.focus\(\)/);
 assert.match(calendar,/if\(trigger\?\.isConnected\)trigger\.focus\(\)/);
 assert.match(metrics,/role="alert"/);
 assert.match(metrics,/role="status"/);
});

test('mobile core layouts keep keyboard focus visible, controls tappable and tables scrollable',async()=>{
 const css=await read('../styles/globals.css');
 const document=await read('../pages/_document.jsx');
 assert.match(css,/\.button,button,input,select,textarea\{min-height:44px\}/);
 assert.match(css,/\.table-wrap\{overflow-x:auto\}/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(document,/:focus-visible\s*\{/);
});

test('document language follows browser locale after hydration',async()=>{
 const [app,i18n,hook]=await Promise.all([read('../pages/_app.jsx'),read('../lib/i18n.js'),read('../lib/useBrowserLocale.js')]);
 assert.match(app,/document\.documentElement\.lang=browserLocale\(\)/);
 assert.match(i18n,/function browserLocale\(\)/);
 assert.match(hook,/useState\('en-CA'\)/);
 assert.match(hook,/useEffect\(\(\)=>\{setLocale\(browserLocale\(\)\);\},\[\]\)/);
});
