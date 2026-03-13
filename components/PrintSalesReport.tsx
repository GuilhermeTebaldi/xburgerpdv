import React, { useEffect, useMemo, useRef, useState } from 'react';

import { getReceiptPaperWidthMm } from '../utils/receiptPaper';
import {
  readSalesReportPrintPayload,
  removeSalesReportPrintPayload,
  type SalesReportPrintPayload,
} from '../utils/salesReportPrintPayload';

interface PrintSalesReportProps {
  payloadId: string;
}

const PrintSalesReport: React.FC<PrintSalesReportProps> = ({ payloadId }) => {
  const [payload, setPayload] = useState<SalesReportPrintPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasTriggeredPrintRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hasTriggeredPrintRef.current = false;
    setPayload(null);
    setErrorMessage(null);
    setIsLoading(true);

    const tryReadPayload = (): SalesReportPrintPayload | null =>
      readSalesReportPrintPayload(payloadId, {
        windowName: typeof window !== 'undefined' ? window.name : null,
        hash: typeof window !== 'undefined' ? window.location.hash : null,
      });

    const immediatePayload = tryReadPayload();
    if (immediatePayload) {
      setPayload(immediatePayload);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    let attempts = 0;
    const maxAttempts = 90;
    const intervalMs = 120;

    const timer = window.setInterval(() => {
      if (cancelled) return;

      attempts += 1;
      const resolvedPayload = tryReadPayload();
      if (resolvedPayload) {
        window.clearInterval(timer);
        setPayload(resolvedPayload);
        setIsLoading(false);
        return;
      }

      if (attempts >= maxAttempts) {
        window.clearInterval(timer);
        setErrorMessage('Relatório não encontrado para impressão.');
        setIsLoading(false);
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [payloadId]);

  useEffect(() => {
    if (!payload) return;
    if (hasTriggeredPrintRef.current) return;

    hasTriggeredPrintRef.current = true;
    const timer = window.setTimeout(() => {
      window.print();
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [payload]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const previousAfterPrint = window.onafterprint;
    window.onafterprint = (event: Event) => {
      removeSalesReportPrintPayload(payloadId);
      try {
        window.name = '';
      } catch {
        // ignore failures
      }

      try {
        window.close();
      } catch {
        // ignore close failures
      }

      if (typeof previousAfterPrint === 'function') {
        previousAfterPrint.call(window, event);
      }
    };

    return () => {
      window.onafterprint = previousAfterPrint;
    };
  }, [payloadId]);

  const paperWidthMm = useMemo(() => {
    const rawWidth = Number(payload?.paperWidthMm);
    if (Number.isFinite(rawWidth) && rawWidth >= 48) {
      return Math.round(rawWidth);
    }
    return getReceiptPaperWidthMm();
  }, [payload?.paperWidthMm]);

  const renderRows = (rows: SalesReportPrintPayload['summaryRows']) =>
    rows.map((row, index) => (
      <div
        key={`${row.label}-${row.value}-${index}`}
        className="receipt-row"
      >
        <span className="receipt-label">{row.label}</span>
        <span className="receipt-value">{row.value}</span>
      </div>
    ));

  return (
    <div className="receipt-shell">
      <style>{`
        @page { size: ${paperWidthMm}mm auto; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: "Courier New", Courier, monospace;
        }
        .receipt-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #fff;
        }
        .receipt-paper {
          width: ${paperWidthMm}mm;
          max-width: ${paperWidthMm}mm;
          padding: 3mm 2mm;
          font-size: 10px;
          line-height: 1.28;
          font-weight: 700;
          letter-spacing: 0;
        }
        .receipt-paper.summary-mode {
          padding-left: 3mm;
          padding-right: 1.8mm;
        }
        .receipt-center { text-align: center; }
        .receipt-strong { font-weight: 900; }
        .receipt-divider {
          border-top: 2px dashed #000;
          margin: 6px 0;
        }
        .receipt-section-title {
          text-align: center;
          text-transform: uppercase;
          font-weight: 900;
          letter-spacing: 0.4px;
          margin: 4px 0;
        }
        .receipt-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          column-gap: 6px;
        }
        .receipt-label {
          min-width: 0;
          word-break: break-word;
        }
        .receipt-value {
          text-align: right;
          white-space: nowrap;
        }
        .receipt-note {
          margin-top: 2px;
          font-size: 10px;
          font-weight: 700;
        }
        .receipt-actions {
          margin: 18px 0 28px;
          display: flex;
          gap: 8px;
        }
        .receipt-actions button {
          border: 1px solid #111;
          background: #111;
          color: #fff;
          border-radius: 8px;
          padding: 8px 12px;
          font-family: inherit;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }
        .receipt-actions button.secondary {
          background: #fff;
          color: #111;
        }
        @media print {
          html, body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          .receipt-shell { min-height: auto; }
          .receipt-paper {
            margin: 0;
            padding: 2.5mm 2mm;
            font-size: 10px;
            line-height: 1.25;
            font-weight: 700;
          }
          .receipt-paper.summary-mode {
            padding-left: 3.1mm;
            padding-right: 1.8mm;
          }
          .receipt-paper * {
            color: #000 !important;
            text-shadow: none;
            -webkit-text-stroke: 0;
            text-rendering: optimizeLegibility;
          }
          .receipt-paper .receipt-strong {
            font-weight: 900 !important;
          }
        }
      `}</style>

      <div className={`receipt-paper ${payload?.mode === 'SUMMARY' ? 'summary-mode' : ''}`}>
        {isLoading && <p className="receipt-center">Carregando relatório...</p>}

        {!isLoading && errorMessage && (
          <>
            <p className="receipt-center receipt-strong">Erro ao gerar relatório</p>
            <p className="receipt-center">{errorMessage}</p>
          </>
        )}

        {!isLoading && payload && (
          <>
            <div className="receipt-center">
              <div className="receipt-strong">VALORES DE FECHAMENTO</div>
              <div className="receipt-strong">FECHAMENTO DE CAIXA</div>
            </div>

            <div className="receipt-divider" />

            <div className="receipt-section-title">{payload.summarySectionTitle}</div>
            {payload.summaryRows.length > 0 ? renderRows(payload.summaryRows) : null}

            <div className="receipt-divider" />

            <div className="receipt-section-title">{payload.paymentSectionTitle}</div>
            {payload.hasDetailedSales && payload.paymentRows.length > 0 ? (
              renderRows(payload.paymentRows)
            ) : (
              <p className="receipt-note">{payload.missingPaymentDetailsMessage}</p>
            )}

            <div className="receipt-divider" />

            <div className="receipt-section-title">{payload.channelSectionTitle}</div>
            {payload.hasDetailedSales && payload.channelRows.length > 0 ? (
              renderRows(payload.channelRows)
            ) : (
              <p className="receipt-note">{payload.missingChannelDetailsMessage}</p>
            )}

            {!payload.hasDetailedSales && <p className="receipt-note">{payload.missingDetailsMessage}</p>}

            <div className="receipt-divider" />
            {renderRows([{ label: 'Impresso em', value: payload.printedAtLabel }])}
          </>
        )}
      </div>

      <div className="receipt-actions no-print">
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          Imprimir
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            window.close();
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
};

export default PrintSalesReport;
