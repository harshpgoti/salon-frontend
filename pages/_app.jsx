import '../styles/globals.css';
import Workspace from '../components/Workspace';
import {useEffect} from 'react';
import {browserLocale} from '../lib/i18n';
export default function App({Component,pageProps}){
 useEffect(()=>{document.documentElement.lang=browserLocale();},[]);
 return pageProps.session?<Workspace session={pageProps.session}><Component {...pageProps}/></Workspace>:<Component {...pageProps}/>;
}
