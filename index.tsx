import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import PrintReceipt from './components/PrintReceipt';
import PrintSalesReport from './components/PrintSalesReport';
import { resolvePrintRouteFromPathname } from './utils/printRoutes';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
const printRoute = resolvePrintRouteFromPathname();

root.render(
  <React.StrictMode>
    {printRoute?.type === 'receipt' ? (
      <PrintReceipt receiptId={printRoute.id} />
    ) : printRoute?.type === 'report' ? (
      <PrintSalesReport payloadId={printRoute.id} />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
