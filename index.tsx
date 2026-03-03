
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PrintReceipt from './components/PrintReceipt';

const resolvePrintReceiptId = (): string | null => {
  if (typeof window === 'undefined') return null;
  const normalizedPath = window.location.pathname.replace(/\/+$/, '');
  const match = normalizedPath.match(/(?:^|\/)print\/([^/]+)/i);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const printReceiptId = resolvePrintReceiptId();

root.render(
  <React.StrictMode>
    {printReceiptId ? <PrintReceipt receiptId={printReceiptId} /> : <App />}
  </React.StrictMode>
);
