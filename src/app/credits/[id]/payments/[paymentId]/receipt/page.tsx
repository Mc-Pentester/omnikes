'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type ReceiptData = {
  payment: {
    id: string;
    amount: string | number;
    method: string;
    reference?: string | null;
    createdAt: string;
    refundedAmount: string | number;
    refunds: Array<{ id: string; amount: string | number; method: string; reference?: string | null; createdAt: string }>;
  };
  credit: { id: string; amount: string | number; dueAt: string; outstanding: number };
  sale: { id: string; orderNumber: string; currencyCode: string; currencySymbol: string };
  customer: { id: string; name: string; phone?: string | null };
  store: { name?: string; code?: string; address?: string; city?: string; country?: string; phone?: string; email?: string };
  receivedByUser?: { name?: string | null; email?: string };
};

const money = (value: number) => Number(value).toFixed(2);
const methodLabel = (method: string) => ({
  CASH: 'Espèces',
  CARD: 'Carte',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement bancaire',
  CHECK: 'Chèque',
  MONCASH: 'MonCash',
  NATCASH: 'NatCash',
}[method] || method);

export default function CreditPaymentReceiptPage() {
  const params = useParams<{ id: string; paymentId: string }>();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/credits/${encodeURIComponent(params.id)}/payments/${encodeURIComponent(params.paymentId)}/receipt`,
          { cache: 'no-store' },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger le reçu.');
        if (active) setReceipt(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Erreur de chargement du reçu.');
      }
    };
    if (params.id && params.paymentId) void load();
    return () => { active = false; };
  }, [params.id, params.paymentId]);

  if (error) return <main className="p-6 text-red-700">{error}</main>;
  if (!receipt) return <main className="p-6 text-center text-sm">Préparation du reçu…</main>;

  const currency = receipt.sale.currencyCode;
  return (
    <main className="min-h-screen bg-gray-100 p-4 text-black">
      <style jsx global>{`
        @page { size: 80mm auto; margin: 0; }
        @media print {
          html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .credit-receipt-actions { display: none !important; }
          .credit-receipt { width: 80mm !important; max-width: 80mm !important; margin: 0 !important; padding: 4mm !important; box-shadow: none !important; }
        }
      `}</style>
      <div className="credit-receipt-actions mx-auto mb-4 flex max-w-[80mm] justify-end gap-2">
        <button type="button" onClick={() => window.print()} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Imprimer</button>
        <button type="button" onClick={() => window.close()} className="rounded border border-gray-400 px-4 py-2 text-sm">Fermer</button>
      </div>
      <article className="credit-receipt mx-auto w-full max-w-[80mm] bg-white p-4 text-[11px] leading-[1.4] shadow">
        <header className="mb-3 border-b border-dashed border-gray-700 pb-3 text-center">
          <h1 className="text-base font-bold">{receipt.store.name || 'Magasin'}</h1>
          {receipt.store.code && <p>{receipt.store.code}</p>}
          {receipt.store.address && <p>{receipt.store.address}</p>}
          {(receipt.store.city || receipt.store.country) && <p>{[receipt.store.city, receipt.store.country].filter(Boolean).join(', ')}</p>}
          {receipt.store.phone && <p>{receipt.store.phone}</p>}
          <h2 className="mt-2 font-bold">REÇU D’ENCAISSEMENT CRÉDIT</h2>
          <p>Référence : {receipt.payment.id}</p>
          <p>{new Date(receipt.payment.createdAt).toLocaleString('fr-FR')}</p>
        </header>
        <section className="space-y-1 border-b border-dashed border-gray-700 pb-3">
          <p><strong>Client :</strong> {receipt.customer.name}</p>
          {receipt.customer.phone && <p><strong>Téléphone :</strong> {receipt.customer.phone}</p>}
          <p><strong>Vente :</strong> {receipt.sale.orderNumber}</p>
          <p><strong>Créance initiale :</strong> {money(Number(receipt.credit.amount))} {currency}</p>
        </section>
        <section className="space-y-1 border-b border-dashed border-gray-700 py-3">
          <p><strong>Mode de paiement :</strong> {methodLabel(receipt.payment.method)}</p>
          <p><strong>Montant encaissé :</strong> {money(Number(receipt.payment.amount))} {currency}</p>
          {receipt.payment.reference && <p className="break-all"><strong>Référence :</strong> {receipt.payment.reference}</p>}
          <p><strong>Encaissé par :</strong> {receipt.receivedByUser?.name || receipt.receivedByUser?.email || 'Utilisateur'}</p>
          <p><strong>Solde restant actuel :</strong> {money(receipt.credit.outstanding)} {currency}</p>
        </section>
        {Number(receipt.payment.refundedAmount) > 0 && (
          <section className="border-b border-dashed border-gray-700 py-3">
            <p><strong>Remboursé sur cet encaissement :</strong> {money(Number(receipt.payment.refundedAmount))} {currency}</p>
            {receipt.payment.refunds.map((refund) => (
              <p key={refund.id} className="text-[10px]">↳ {money(Number(refund.amount))} · {refund.reference || methodLabel(refund.method)} · {new Date(refund.createdAt).toLocaleString('fr-FR')}</p>
            ))}
          </section>
        )}
        <footer className="pt-3 text-center text-[10px]">Conservez ce reçu pour vos dossiers.</footer>
      </article>
    </main>
  );
}
