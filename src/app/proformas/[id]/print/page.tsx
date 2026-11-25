'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ProformaItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  variant?: { product?: { name: string } };
}

interface Proforma {
  proformaNumber: string;
  customer?: { name: string };
  store?: { name: string };
  organization?: { subscriptionStatus?: string; subscriptionExpiresAt?: string | null };
  status: string;
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  discount: number;
  applyTax: boolean;
  validUntil?: string;
  notes?: string;
  createdAt: string;
  items: ProformaItem[];
}

const money = (value: number) => Number(value).toFixed(2);

export default function ProformaPrintPage() {
  const params = useParams();
  const [proforma, setProforma] = useState<Proforma | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/proformas/${params.id}`);
        if (!response.ok) throw new Error('Impossible de charger la proforma');
        setProforma(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      }
    };

    if (params.id) load();
  }, [params.id]);

  useEffect(() => {
    if (!proforma) return;

    const handleAfterPrint = () => {
      window.setTimeout(() => window.close(), 100);
    };

    window.addEventListener('afterprint', handleAfterPrint);

    const timer = window.setTimeout(() => window.print(), 250);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [proforma]);

  if (error) return <main className="p-8 text-danger">{error}</main>;
  if (!proforma) return <main className="p-8">Préparation de l’impression...</main>;

  const hasActiveSubscription = proforma.organization?.subscriptionStatus === 'ACTIVE'
    && (!proforma.organization.subscriptionExpiresAt || new Date(proforma.organization.subscriptionExpiresAt).getTime() > now);

  return (
    <main className="print-page bg-white text-gray-900">
      <style jsx global>{`
        @media print {
          @page {
            size: 8.5in 11in;
            margin: 0;
          }

          html,
          body {
            width: 8.5in !important;
            min-width: 8.5in !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .print-page {
            width: 8.5in !important;
            max-width: 8.5in !important;
            min-width: 8.5in !important;
            height: 11in !important;
            min-height: 11in !important;
            margin: 0 !important;
            padding: 0.5in !important;
            box-sizing: border-box !important;
            background: white !important;
            overflow: hidden !important;
          }

          .print-page table {
            width: 100% !important;
            table-layout: auto !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="no-print mb-6 flex justify-end gap-2">
        <button className="rounded border px-4 py-2" onClick={() => window.print()}>Imprimer</button>
        <button className="rounded border px-4 py-2" onClick={() => window.close()}>Fermer</button>
      </div>

      <header className="mb-8 flex items-start justify-between border-b pb-5">
        <div>
          {hasActiveSubscription && <h1 className="text-2xl font-bold">{proforma.store?.name || 'Magasin'}</h1>}
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold">PROFORMA</h2>
          <p className="text-sm">N° {proforma.proformaNumber}</p>
          <p className="text-sm">{new Date(proforma.createdAt).toLocaleDateString('fr-FR')}</p>
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-semibold">Client</p>
          <p>{proforma.customer?.name || '-'}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">Valide jusqu’au</p>
          <p>{proforma.validUntil ? new Date(proforma.validUntil).toLocaleDateString('fr-FR') : '-'}</p>
        </div>
      </section>

      <table className="mb-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-gray-900">
            <th className="py-2 text-left">Produit</th>
            <th className="py-2 text-right">Qté</th>
            <th className="py-2 text-right">Prix unitaire</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {proforma.items.map((item) => (
            <tr key={item.id} className="border-b border-gray-200">
              <td className="py-2">{item.variant?.product?.name || '-'}</td>
              <td className="py-2 text-right">{item.quantity}</td>
              <td className="py-2 text-right">{money(item.unitPrice)}</td>
              <td className="py-2 text-right">{money(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ml-auto w-80 space-y-2 text-sm">
        <div className="flex justify-between"><span>Sous-total</span><span>{money(proforma.subtotal)}</span></div>
        {proforma.discount > 0 && <div className="flex justify-between"><span>Remise</span><span>-{money(proforma.discount)}</span></div>}
        {proforma.applyTax && <div className="flex justify-between"><span>Taxe ({Number(proforma.taxRate) * 100}%)</span><span>{money(proforma.tax)}</span></div>}
        <div className="flex justify-between border-t-2 border-gray-900 pt-2 text-lg font-bold"><span>Total</span><span>{money(proforma.total)}</span></div>
      </section>

      {proforma.notes && (
        <section className="mt-10 border-t pt-4 text-sm">
          <p className="font-semibold">Notes</p>
          <p>{proforma.notes}</p>
        </section>
      )}

    </main>
  );
}
