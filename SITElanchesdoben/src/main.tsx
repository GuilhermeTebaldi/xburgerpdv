import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AdminGeralPage from './admingeral/AdminGeralPage.tsx';
import './index.css';

const ROOT_DOMAIN = 'xburgerpdv.com.br';

const resolvePathname = (): string => {
  if (typeof window === 'undefined') return '/';
  const normalized = window.location.pathname.replace(/\/+$/, '');
  return normalized || '/';
};

const isAdminGeralRoute = (): boolean => resolvePathname() === '/admingeral';
const isRootPath = (): boolean => resolvePathname() === '/';

const isTenantSubdomainHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();

  if (host === ROOT_DOMAIN) return false;
  if (host === `www.${ROOT_DOMAIN}`) return false;
  if (host === `app.${ROOT_DOMAIN}`) return false;

  return host.endsWith(`.${ROOT_DOMAIN}`);
};

const redirectTenantRootToSystem = (): void => {
  if (typeof window === 'undefined') return;
  if (!isRootPath()) return;
  if (!isTenantSubdomainHost()) return;
  window.location.replace('/sistema/');
};

redirectTenantRootToSystem();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminGeralRoute() ? <AdminGeralPage /> : <App />}
  </StrictMode>,
);
