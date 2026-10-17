import PlatformPage from '../../components/PlatformPage';
import CompanyMetrics from '../../components/CompanyMetrics';
import {privatePage} from '../../lib/session';
export default function Page(){return <><PlatformPage view="finance"/><main className="page"><CompanyMetrics/></main></>;}
export const getServerSideProps=privatePage('company');
