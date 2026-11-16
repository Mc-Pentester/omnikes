'use client';

import { useCallback, useEffect, useState } from 'react';

interface ReceiptSale {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  taxRate?: number | null;
  total: number;
  discount: number;
  applyTax: boolean;
  createdAt: string;
  store?: {
    name?: string;
    code?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
  };
  customer?: { name?: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    variant?: {
      name?: string;
      sku?: string;
      product?: { name: string };
    };
  }>;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
    cashReceived?: number | null;
    changeGiven?: number | null;
    status: string;
    reference?: string | null;
  }>;
}

interface PosReceiptProps {
  saleId: string;
  onNewSale: () => void;
}

const money = (value: number) => Number(value).toFixed(2);

function paymentLabel(method: string) {
  switch (method) {
    case 'CASH': return 'Espèces';
    case 'CARD': return 'Carte';
    case 'BANK_TRANSFER': return 'Virement';
    case 'MONCASH': return 'MonCash';
    case 'NATCASH': return 'NatCash';
    case 'CREDIT': return 'Crédit';
    default: return method;
  }
}

export function PosReceipt({ saleId, onNewSale }: PosReceiptProps) {
  const [sale, setSale] = useState<ReceiptSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSale = useCallback(async (): Promise<ReceiptSale> => {
    const response = await fetch('/api/sales/' + encodeURIComponent(saleId), {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 401) {
      throw new Error('Votre session OmniKès a expiré. Reconnectez-vous pour consulter ce ticket.');
    }
    if (response.status === 403) {
      throw new Error('Votre compte ne dispose pas du droit de consulter cette vente.');
    }
    if (!response.ok) {
      throw new Error('Impossible de charger le ticket de cette vente.');
    }
    return await response.json() as ReceiptSale;
  }, [saleId]);

  const loadSale = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSale(await fetchSale());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement du ticket.');
    } finally {
      setLoading(false);
    }
  }, [fetchSale]);

  useEffect(() => {
    let active = true;
    fetchSale()
      .then((data) => {
        if (active) setSale(data);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Erreur lors du chargement du ticket.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchSale]);

  const printReceipt = () => {
    if (!sale) return;
    window.print();
  };

  const payment = sale?.payments?.find((item) => item.status === 'COMPLETED') ?? sale?.payments?.[0];
  const taxRate = Number(sale?.taxRate ?? 0) * 100;

  return (
    <div className="pos-receipt-screen min-h-screen bg-background p-4 md:p-6">
      <style jsx global>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body {
            width: 80mm !important;
            min-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .pos-receipt-screen {
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .pos-receipt-actions { display: none !important; }
          .pos-receipt {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            box-sizing: border-box !important;
            color: #000 !important;
            background: #fff !important;
            font: 11px/1.3 Arial, Helvetica, sans-serif !important;
          }
        }
      `}</style>

      <div className="pos-receipt-actions mx-auto mb-4 flex w-full max-w-3xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Vente complétée</h1>
          <p className="text-sm text-muted">La vente est enregistrée dans OmniKès.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onNewSale} className="h-11 rounded-lg border border-border px-4 font-medium hover:bg-surface-muted">
            Nouvelle vente
          </button>
          <button type="button" onClick={printReceipt} disabled={!sale || loading} className="h-11 rounded-lg bg-primary px-5 font-bold text-white hover:bg-primary-hover disabled:opacity-50">
            Imprimer le ticket
          </button>
        </div>
      </div>

      {loading && <p className="py-8 text-center text-muted">Chargement du ticket...</p>}
      {error && (
        <div className="pos-receipt-actions mx-auto max-w-3xl rounded-lg border border-danger/30 bg-danger-soft p-4" role="alert">
          <p className="text-danger">{error}</p>
          <button type="button" onClick={() => void loadSale()} className="mt-3 rounded border border-border px-3 py-2 font-medium">
            Réessayer
          </button>
        </div>
      )}

      {sale && (
        <main className="pos-receipt mx-auto w-full max-w-[80mm] bg-white p-4 text-[11px] leading-[1.3] text-black shadow-sm">
          <header className="mb-3 border-b border-dashed border-gray-700 pb-3 text-center">
            <h2 className="text-base font-bold">{sale.store?.name || 'Magasin'}</h2>
            {sale.store?.code && <p>{sale.store.code}</p>}
            {sale.store?.address && <p>{sale.store.address}</p>}
            {(sale.store?.city || sale.store?.country) && <p>{[sale.store.city, sale.store.country].filter(Boolean).join(', ')}</p>}
            {sale.store?.phone && <p>{sale.store.phone}</p>}
            <p className="mt-2 font-bold">TICKET DE CAISSE</p>
            <p>N° {sale.orderNumber}</p>
            <p>{new Date(sale.createdAt).toLocaleString('fr-FR')}</p>
          </header>

          {sale.customer?.name && (
            <div className="mb-2 border-b border-dashed border-gray-700 pb-2">
              <strong>Client :</strong> {sale.customer.name}
            </div>
          )}

          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="py-1 text-left">Article</th>
                <th className="w-10 py-1 text-right">Qté</th>
                <th className="w-20 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-1 pr-1 align-top">
                    <div className="font-semibold">{item.variant?.product?.name || 'Produit'}</div>
                    {item.variant?.name && <div>{item.variant.name}</div>}
                    {item.variant?.sku && <div className="text-[9px]">{item.variant.sku}</div>}
                    <div>{money(item.unitPrice)} HTG/u</div>
                  </td>
                  <td className="py-1 text-right align-top">{item.quantity}</td>
                  <td className="py-1 text-right align-top font-semibold">{money(Number(item.unitPrice) * Number(item.quantity))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="mt-2 border-t border-dashed border-gray-700 pt-2">
            <div className="flex justify-between"><span>Sous-total</span><span>{money(sale.subtotal)} HTG</span></div>
            {sale.discount > 0 && <div className="flex justify-between"><span>Remise</span><span>-{money(sale.discount)} HTG</span></div>}
            {sale.applyTax && (
              <div className="flex justify-between">
                <span>Taxe{taxRate > 0 ? ` (${taxRate.toFixed(2)}%)` : ''}</span>
                <span>{money(sale.tax)} HTG</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-gray-700 pt-2 text-sm font-bold">
              <span>TOTAL</span><span>{money(sale.total)} HTG</span>
            </div>
          </section>

          {payment && (
            <section className="mt-3 border-t border-dashed border-gray-700 pt-2">
              <div className="flex justify-between"><span>Paiement</span><span>{paymentLabel(payment.method)}</span></div>
              <div className="flex justify-between"><span>Montant payé</span><span>{money(payment.amount)} HTG</span></div>
              {payment.method === 'CASH' && payment.cashReceived != null && <div className="flex justify-between"><span>Montant reçu</span><span>{money(payment.cashReceived)} HTG</span></div>}
              {payment.method === 'CASH' && payment.changeGiven != null && <div className="flex justify-between font-semibold"><span>Monnaie rendue</span><span>{money(payment.changeGiven)} HTG</span></div>}
              {payment.reference && <div className="break-all">Réf. : {payment.reference}</div>}
            </section>
          )}
          <footer className="mt-3 border-t border-dashed border-gray-700 pt-3 text-center text-[10px]">
            Merci pour votre achat !
          </footer>
        </main>
      )}
    </div>
  );
}
