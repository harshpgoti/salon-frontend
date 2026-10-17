export function message(body,fallback='The request could not complete.'){const d=body?.detail;if(typeof d==='string')return d;if(Array.isArray(d))return d[0]?.msg||fallback;if(d?.code)return d.code.replaceAll('_',' ');return fallback;}
export async function api(url,options={}){const r=await fetch(url,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});const body=await r.json().catch(()=>null);if(!r.ok)throw new Error(message(body));return body;}
export function money(minor){if(minor===null||minor===undefined)return '—';return new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format((minor||0)/100);}

export function parseCadAmount(value,kind){
 if(typeof value!=='string'||!['payment','refund','adjustment'].includes(kind))throw new Error('Choose a valid receipt kind and CAD amount.');
 const input=value.trim();
 if(input.length>40||!/^-?[0-9]+(?:\.[0-9]{1,2})?$/.test(input))throw new Error('Enter a CAD amount with at most two decimal places.');
 const negative=input.startsWith('-'),[whole,cents='']=input.replace(/^-/,'').split('.');
 let minor=BigInt(whole)*100n+BigInt(cents.padEnd(2,'0'));
 if(negative)minor=-minor;
 if(!minor)throw new Error('Enter a nonzero amount.');
 if(kind!=='adjustment'&&minor<0n)throw new Error('Payment and refund amounts must be positive.');
 if(kind==='refund')minor=-minor;
 if(minor < -2147483648n || minor > 2147483647n)throw new Error('The amount is outside the supported CAD range.');
 return Number(minor);
}

export function prepareCommand(previous,context,facts,createKey){
 const ordered=Object.fromEntries(Object.keys(facts).sort().map(name=>[name,facts[name]]));
 const fingerprint=JSON.stringify([context,ordered]);
 const key=previous?.fingerprint===fingerprint?previous.key:createKey();
 return {fingerprint,key,body:{...facts,idempotency_key:key}};
}
