import PlatformPage from '../../components/PlatformPage';
import {privatePage} from '../../lib/session';
export default function Page(){return <PlatformPage view="salons"/>;}
export const getServerSideProps=privatePage('company');
