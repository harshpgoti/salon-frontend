import CustomerSuccessPage from '../../components/CustomerSuccessPage';
import {privatePage} from '../../lib/session';

export default function Page(){return <CustomerSuccessPage/>;}
export const getServerSideProps=privatePage('company');
