import Login from '../../components/Login';
import {loginPage} from '../../lib/session';
export default Login;
export const getServerSideProps=loginPage('company');
