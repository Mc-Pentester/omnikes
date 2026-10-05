'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  variant?: {
    name?: string;
    sku?: string;
    product?: { name: string };
  };
}

interface Payment {
  id: string;
  method: string;
  amount: number;
  status: string;
  reference?: string | null;
  createdAt: string;
}

interface Sale {
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
    email?: string;
  };
  customer?: { name?: string } | null;
  items: SaleItem[];
  payments: Payment[];
}

const money = (value: number) => Number(value).toFixed(2);

const paymentLabel = (method: string) => {
  switch (method) {
    case 'CASH':
      return 'Espèces';
    case 'CARD':
      return 'Carte';
    case 'BANK_TRANSFER':
      return 'Virement';
    case 'MONCASH':
      return 'MonCash';
    case 'NATCASH':
      return 'NatCash';
    case 'CREDIT':
      return 'Crédit';
    default:
      return method;
  }
};

export default function ReceiptPrintPage() {
  const params = useParams();
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/sales/' + encodeURIComponent(String(params.id)));
        if (!response.ok) throw new Error('Impossible de charger la vente');
        setSale(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      }
    };

    if (params.id) load();
  }, [params.id]);

  useEffect(() => {
    if (!sale) return;

    const handleAfterPrint = () => {
      window.setTimeout(() => window.close(), 100);
    };

    window.addEventListener('afterprint', handleAfterPrint);
    const timer = window.setTimeout(() => window.print(), 250);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [sale]);

  if (error) {
    return <main className="p-6 text-red-600">{error}</main>;
  }

  if (!sale) {
    return <main className="p-6 text-center text-sm">Préparation du ticket...</main>;
  }

  const payment = sale.payments?.find((item) => item.status === 'COMPLETED') ?? sale.payments?.[0];
  const taxRate = Number(sale.taxRate ?? 0) * 100;

  return (
    <main className="receipt-page">
      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html,
          body {
            width: 80mm !important;
            min-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .receipt-page {
            width: 80mm !important;
            max-width: 80mm !important;
            min-width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            box-sizing: border-box !important;
            background: #fff !important;
            color: #000 !important;
            font-family: Arial, Helvetica, sans-serif !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
          }

          .receipt-page table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }

          .receipt-page th,
          .receipt-page td {
            padding: 1.5mm 0 !important;
            vertical-align: top !important;
          }

          .no-print {
            display: none !important;
          }
        }

        .receipt-page {
          width: 80mm;
          max-width: 80mm;
          margin: 0 auto;
          padding: 4mm;
          box-sizing: border-box;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.3;
        }
      `}</style>

      <div className="no-print mb-4 flex gap-2">
        <button className="rounded border px-3 py-2" onClick={() => window.print()}>Imprimer</button>
        <button className="rounded border px-3 py-2" onClick={() => window.close()}>Fermer</button>
      </div>

      <header className="text-center border-b border-dashed border-gray-700 pb-3 mb-3">
        <h1 className="text-lg font-bold">OMNIKÈS</h1>
        <p className="font-semibold">{sale.store?.name || 'Magasin'}</p>
        {sale.store?.code && <p>{sale.store.code}</p>}
        {sale.store?.address && <p>{sale.store.address}</p>}
        {(sale.store?.city || sale.store?.country) && <p>{[sale.store.city, sale.store.country].filter(Boolean).join(', ')}</p>}
        {sale.store?.phone && <p>{sale.store.phone}</p>}
        <p className="mt-2 font-bold">TICKET DE CAISSE</p>
        <p>N° {sale.orderNumber}</p>
        <p>{new Date(sale.createdAt).toLocaleString('fr-FR')}</p>
      </header>

      {sale.customer?.name && (
        <div className="border-b border-dashed border-gray-700 pb-2 mb-2">
          <span className="font-semibold">Client :</span> {sale.customer.name}
        </div>
      )}

      <table>
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left">Article</th>
            <th className="text-right w-10">Qté</th>
            <th className="text-right w-20">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td className="pr-1">
                <div className="font-semibold">{item.variant?.product?.name || 'Produit'}</div>
                {item.variant?.name && <div>{item.variant.name}</div>}
                {item.variant?.sku && <div className="text-[9px]">{item.variant.sku}</div>}
                <div>{money(item.unitPrice)} HTG/u</div>
              </td>
              <td className="text-right">{item.quantity}</td>
              <td className="text-right font-semibold">{money(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="border-t border-dashed border-gray-700 mt-2 pt-2">
        <div className="flex justify-between"><span>Sous-total</span><span>{money(sale.subtotal)} HTG</span></div>
        {sale.discount > 0 && (
          <div className="flex justify-between"><span>Remise</span><span>-{money(sale.discount)} HTG</span></div>
        )}
        {sale.applyTax && (
          <div className="flex justify-between">
            <span>Taxe{taxRate > 0 ? ` (${taxRate.toFixed(2)}%)` : ''}</span>
            <span>{money(sale.tax)} HTG</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-700 mt-2 pt-2 text-base font-bold">
          <span>TOTAL</span>
          <span>{money(sale.total)} HTG</span>
        </div>
      </section>

      {payment && (
        <section className="border-t border-dashed border-gray-700 mt-3 pt-2">
          <div className="flex justify-between">
            <span>Paiement</span>
            <span>{paymentLabel(payment.method)}</span>
          </div>
          <div className="flex justify-between">
            <span>Montant payé</span>
            <span>{money(payment.amount)} HTG</span>
          </div>
          {payment.reference && <div className="break-all">Réf. : {payment.reference}</div>}
        </section>
      )}

      <footer className="border-t border-dashed border-gray-700 mt-3 pt-3 text-center text-[10px]">
        <p>Merci pour votre achat !</p>
        <p>Document généré par OmniKès</p>
      </footer>
    </main>
  );
}
