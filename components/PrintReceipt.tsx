import React, { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_APP_STATE, loadAppState, type AppState } from '../data/appStorage';
import type { Sale, SaleDraft, SalePaymentMethod } from '../types';

interface PrintReceiptProps {
  receiptId: string;
}

interface ReceiptLine {
  id: string;
  qty: number;
  name: string;
  unitPrice: number;
  subtotal: number;
  note?: string;
}

interface ReceiptViewModel {
  restaurantName: string;
  orderId: string;
  paidAt: Date | null;
  lines: ReceiptLine[];
  total: number;
  paymentMethodLabel: string;
  observations: string[];
}

const DEFAULT_RESTAURANT_NAME = 'LANCHESDOBEN';

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const roundMoney = (value: number): number => Number(value.toFixed(2));

const formatMoney = (value: number): string =>
  moneyFormatter.format(Number.isFinite(value) ? value : 0);

const formatDateTime = (value: Date | null): string => {
  if (!value) return '--';
  return value.toLocaleString('pt-BR');
};

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getRestaurantName = (): string => {
  if (typeof window === 'undefined') return DEFAULT_RESTAURANT_NAME;
  const local = normalizeText(window.localStorage.getItem('qb_restaurant_name'));
  return local || DEFAULT_RESTAURANT_NAME;
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const formatPaymentMethod = (method: SalePaymentMethod | null | undefined): string => {
  if (!method) return 'NAO INFORMADO';
  if (method === 'DEBITO') return 'DEBITO';
  if (method === 'CREDITO') return 'CREDITO';
  if (method === 'DINHEIRO') return 'DINHEIRO';
  return method;
};

const collectSales = (state: AppState): Sale[] => {
  const grouped = new Map<string, Sale>();
  state.sales.forEach((sale) => grouped.set(sale.id, sale));
  state.globalSales.forEach((sale) => {
    if (!grouped.has(sale.id)) {
      grouped.set(sale.id, sale);
    }
  });
  return [...grouped.values()];
};

const resolveReceiptSales = (
  allSales: Sale[],
  receiptId: string
): { orderId: string; targetSale: Sale; sales: Sale[] } | null => {
  const directSale = allSales.find((sale) => sale.id === receiptId);
  if (directSale) {
    if (directSale.saleDraftId) {
      const groupSales = allSales.filter((sale) => sale.saleDraftId === directSale.saleDraftId);
      return {
        orderId: directSale.saleDraftId,
        targetSale: directSale,
        sales: groupSales.length > 0 ? groupSales : [directSale],
      };
    }
    return {
      orderId: directSale.id,
      targetSale: directSale,
      sales: [directSale],
    };
  }

  const byDraft = allSales.filter((sale) => sale.saleDraftId === receiptId);
  if (byDraft.length === 0) return null;

  return {
    orderId: receiptId,
    targetSale: byDraft[0],
    sales: byDraft,
  };
};

const buildReceiptLines = (
  sales: Sale[],
  draft: SaleDraft | undefined
): { lines: ReceiptLine[]; observations: string[] } => {
  const draftItemById = new Map<string, SaleDraft['items'][number]>();
  if (draft) {
    draft.items.forEach((item) => {
      draftItemById.set(item.id, item);
    });
  }

  const observations: string[] = [];
  const lines = sales.map((sale) => {
    let qty = 1;
    let unitPrice = roundMoney(sale.total);
    let note: string | undefined;

    if (draft && sale.saleDraftId === draft.id) {
      const prefix = `${draft.id}-`;
      const draftItemId = sale.id.startsWith(prefix) ? sale.id.slice(prefix.length) : '';
      const draftItem = draftItemId ? draftItemById.get(draftItemId) : undefined;

      if (draftItem) {
        qty = Number.isFinite(draftItem.qty) && draftItem.qty > 0 ? draftItem.qty : 1;
        if (
          typeof draftItem.unitPriceSnapshot === 'number' &&
          Number.isFinite(draftItem.unitPriceSnapshot)
        ) {
          unitPrice = roundMoney(draftItem.unitPriceSnapshot);
        } else {
          unitPrice = roundMoney(sale.total / qty);
        }

        const normalizedNote = normalizeText(draftItem.note);
        if (normalizedNote) {
          note = normalizedNote;
          observations.push(`${draftItem.nameSnapshot || sale.productName}: ${normalizedNote}`);
        }
      }
    }

    return {
      id: sale.id,
      qty,
      name: sale.productName,
      unitPrice,
      subtotal: roundMoney(sale.total),
      note,
    };
  });

  return { lines, observations };
};

const buildReceiptViewModel = (state: AppState, receiptId: string): ReceiptViewModel | null => {
  const allSales = collectSales(state);
  const resolved = resolveReceiptSales(allSales, receiptId);
  if (!resolved) return null;

  const { orderId, targetSale, sales } = resolved;
  const relatedDraft = targetSale.saleDraftId
    ? state.saleDrafts.find((draft) => draft.id === targetSale.saleDraftId)
    : undefined;

  const { lines, observations } = buildReceiptLines(sales, relatedDraft);
  const linesTotal = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const total =
    relatedDraft && Number.isFinite(relatedDraft.total) ? roundMoney(relatedDraft.total) : linesTotal;

  const paidAt =
    toDate(relatedDraft?.payment?.confirmedAt) ||
    toDate(targetSale.payment?.confirmedAt) ||
    toDate(targetSale.timestamp);

  const paymentMethod =
    relatedDraft?.payment?.method ?? targetSale.payment?.method ?? null;

  return {
    restaurantName: getRestaurantName(),
    orderId,
    paidAt,
    lines,
    total,
    paymentMethodLabel: formatPaymentMethod(paymentMethod),
    observations,
  };
};

const PrintReceipt: React.FC<PrintReceiptProps> = ({ receiptId }) => {
  const [receipt, setReceipt] = useState<ReceiptViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasTriggeredPrintRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setReceipt(null);
    hasTriggeredPrintRef.current = false;

    loadAppState(DEFAULT_APP_STATE)
      .then((state) => {
        if (cancelled) return;
        const model = buildReceiptViewModel(state, receiptId);
        if (!model) {
          setErrorMessage('Pedido não encontrado para impressão.');
          return;
        }
        setReceipt(model);
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage('Falha ao carregar dados do cupom.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  useEffect(() => {
    if (!receipt) return;
    if (hasTriggeredPrintRef.current) return;
    hasTriggeredPrintRef.current = true;
    const timer = window.setTimeout(() => {
      window.print();
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [receipt]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previousAfterPrint = window.onafterprint;
    window.onafterprint = (event: Event) => {
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
  }, []);

  const printedAt = useMemo(() => new Date(), []);

  return (
    <div className="receipt-shell">
      <style>{`
        @page { size: 80mm auto; margin: 0; }
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
          width: 80mm;
          max-width: 80mm;
          padding: 4mm 3mm;
          font-size: 11px;
          line-height: 1.3;
        }
        .receipt-center { text-align: center; }
        .receipt-strong { font-weight: 700; }
        .receipt-divider {
          border-top: 1px dashed #000;
          margin: 6px 0;
        }
        .receipt-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .receipt-item + .receipt-item {
          margin-top: 5px;
        }
        .receipt-note {
          margin-top: 2px;
          font-size: 10px;
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
          .no-print { display: none !important; }
          .receipt-shell { min-height: auto; }
          .receipt-paper { margin: 0; padding: 3mm 2.5mm; }
        }
      `}</style>

      <div className="receipt-paper">
        {isLoading && <p className="receipt-center">Carregando cupom...</p>}

        {!isLoading && errorMessage && (
          <>
            <p className="receipt-center receipt-strong">Erro ao gerar cupom</p>
            <p className="receipt-center">{errorMessage}</p>
          </>
        )}

        {!isLoading && receipt && (
          <>
            <div className="receipt-center">
              <div className="receipt-strong">{receipt.restaurantName}</div>
              <div>CUPOM NAO FISCAL</div>
            </div>

            <div className="receipt-divider" />

            <div className="receipt-row">
              <span className="receipt-strong">Pedido</span>
              <span>{receipt.orderId}</span>
            </div>
            <div className="receipt-row">
              <span>Pago em</span>
              <span>{formatDateTime(receipt.paidAt)}</span>
            </div>
            <div className="receipt-row">
              <span>Impresso em</span>
              <span>{formatDateTime(printedAt)}</span>
            </div>
            <div className="receipt-row">
              <span>Pagamento</span>
              <span>{receipt.paymentMethodLabel}</span>
            </div>

            <div className="receipt-divider" />

            {receipt.lines.map((line) => (
              <div key={line.id} className="receipt-item">
                <div className="receipt-row">
                  <span>
                    {line.qty}x {line.name}
                  </span>
                  <span>{formatMoney(line.subtotal)}</span>
                </div>
                <div className="receipt-row">
                  <span>Valor un.</span>
                  <span>{formatMoney(line.unitPrice)}</span>
                </div>
                {line.note && <div className="receipt-note">Obs: {line.note}</div>}
              </div>
            ))}

            {receipt.observations.length > 0 && (
              <>
                <div className="receipt-divider" />
                <div className="receipt-strong">OBSERVACOES</div>
                {receipt.observations.map((observation, index) => (
                  <div key={`${observation}-${index}`} className="receipt-note">
                    - {observation}
                  </div>
                ))}
              </>
            )}

            <div className="receipt-divider" />

            <div className="receipt-row receipt-strong">
              <span>TOTAL</span>
              <span>{formatMoney(receipt.total)}</span>
            </div>

            <div className="receipt-divider" />
            <p className="receipt-center">Obrigado e volte sempre!</p>
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

export default PrintReceipt;
