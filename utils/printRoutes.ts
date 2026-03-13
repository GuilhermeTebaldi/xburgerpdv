export type PrintRouteMatch =
  | { type: 'receipt'; id: string }
  | { type: 'report'; id: string };

const decodePathSegment = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizePathParts = (pathname: string): string[] => {
  const normalizedPath = pathname.replace(/\/+$/, '');
  const parts = normalizedPath.split('/').filter(Boolean);
  if (parts[0] === 'sistema') {
    return parts.slice(1);
  }
  return parts;
};

export const resolveSystemBasePath = (): string => {
  if (typeof window === 'undefined') return '';
  const [firstSegment] = window.location.pathname.split('/').filter(Boolean);
  return firstSegment === 'sistema' ? '/sistema' : '';
};

export const buildReceiptPrintRoutePath = (receiptId: string): string =>
  `${resolveSystemBasePath()}/print/${encodeURIComponent(receiptId)}`;

export const buildSalesReportPrintRoutePath = (payloadId: string): string =>
  `${resolveSystemBasePath()}/print/report/${encodeURIComponent(payloadId)}`;

export const resolvePrintRouteFromPathname = (
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''
): PrintRouteMatch | null => {
  const parts = normalizePathParts(pathname);
  if (parts[0] !== 'print') return null;

  if (parts[1] === 'report' && parts[2]) {
    return {
      type: 'report',
      id: decodePathSegment(parts[2]),
    };
  }

  if (!parts[1]) return null;

  return {
    type: 'receipt',
    id: decodePathSegment(parts[1]),
  };
};
