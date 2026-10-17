import {useEffect,useState} from 'react';
import {browserLocale} from './i18n';

// Keep server rendering and the first hydration render on the same locale.
// Browser preference applies after hydration to avoid mismatched HTML.
export function useBrowserLocale(){
 const [locale,setLocale]=useState('en-CA');
 useEffect(()=>{setLocale(browserLocale());},[]);
 return locale;
}
