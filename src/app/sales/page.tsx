'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { useCurrentStore } from '@omnikes/contexts/StoreContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

type Payment = {
  id: string;
  amount: number | string;
  method: string;
  status: string;
};

type SaleCredit = {
  id: string;
  amount: number | string;
  status: string;
  customerId: string;
  note?: string | null;
};

type Sale = {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  createdAt: string;
  store: { id: string; name: string };
  customer?: { id: string; name: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number | string;
    totalPrice: number | string;
    variant: { sku: string; name: string; product: { name: string } };
  }>;
  payments: Payment[];
  saleCredit?: SaleCredit | null;
};

function money(value: number | string) {
  return Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SalesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const [sales, setSales] = useState<Sale[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCompact, setSidebarCompact] = useState(false);

  const loadSales = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ status: 'PENDING', take: '100' });
      if (currentStoreId) query.set('storeId', currentStoreId);
      const response = await fetch(`/api/sales?${query.toString()}`);
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error((await response.json()).error || 'Impossible de charger les ventes');
      }
      const data = await response.json();
      setSales(data.sales || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les ventes');
    } finally {
      setLoading(false);
    }
  }, [user, currentStoreId, router]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadSales();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadSales]);

  const paid = useMemo(() => selected
    ? selected.payments.filter(p => p.status === 'COMPLETED' && p.method !== 'CREDIT').reduce((s, p) => s + Number(p.amount), 0)
    : 0, [selected]);

  const credit = selected?.saleCredit?.status === 'AUTHORIZED' ? Number(selected.saleCredit.amount) : 0;
  const total = selected ? Number(selected.total) : 0;
  const remaining = Math.max(0, total - paid - credit);
  const cashRemaining = Math.max(0, total - paid);
  const coverage = paid + credit;
  const canComplete = selected?.status === 'PENDING' && coverage >= total;

  const refreshSelected = async () => {
    if (!selected) return;
    const response = await fetch(`/api/sales/${selected.id}`);
    if (response.ok) setSelected(await response.json());
  };

  const collectPayment = async () => {
    if (!selected) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Le montant encaissé doit être supérieur à zéro.');
      return;
    }
    if (amount > cashRemaining) {
      setError(`Le montant dépasse le solde restant de ${money(cashRemaining)} HTG.`);
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/${selected.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          method: 'CASH',
          amount,
          status: 'COMPLETED',
          reference: `CASH-${Date.now()}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Échec de l’encaissement');

      setPaymentAmount('');
      await refreshSelected();
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’encaissement');
    } finally {
      setProcessing(false);
    }
  };

  const authorizeCredit = async () => {
    if (!selected) return;
    if (!selected.customer?.id) {
      setError('Un client est obligatoire pour accorder un crédit.');
      return;
    }
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Le montant du crédit doit être supérieur à zéro.');
      return;
    }
    if (amount > cashRemaining) {
      setError(`Le crédit dépasse le solde restant de ${money(cashRemaining)} HTG.`);
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/${selected.id}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selected.customer.id,
          amount,
          note: creditNote || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Échec de l’autorisation du crédit');

      setCreditAmount('');
      setCreditNote('');
      await refreshSelected();
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’autorisation du crédit');
    } finally {
      setProcessing(false);
    }
  };

  const completeSale = async () => {
    if (!selected || !canComplete) return;
    setProcessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/sales/${selected.id}/complete`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'La finalisation a été refusée');
      setSelected(null);
      setPaymentAmount('');
      setCreditAmount('');
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La finalisation a été refusée');
      await refreshSelected();
    } finally {
      setProcessing(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar compact={sidebarCompact} onToggleCompact={() => setSidebarCompact(!sidebarCompact)} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Caisse / Ventes en attente</h1>
            <p className="text-sm text-gray-500">Finalisation contrôlée par paiement, crédit autorisé et stock.</p>
          </div>
          <Button variant="outline" onClick={loadSales}>Actualiser</Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="p-4 xl:col-span-1">
            <h2 className="font-semibold mb-3">Ventes PENDING</h2>
            {loading ? <p className="text-gray-500">Chargement...</p> : sales.length === 0 ? (
              <p className="text-gray-500">Aucune vente en attente.</p>
            ) : (
              <div className="space-y-2">
                {sales.map(sale => (
                  <button
                    key={sale.id}
                    onClick={() => setSelected(sale)}
                    className={`w-full text-left rounded-lg border p-3 hover:bg-gray-50 ${selected?.id === sale.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{sale.orderNumber}</span>
                      <span className="font-semibold">{money(sale.total)} HTG</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {sale.customer?.name || 'Client non renseigné'} · {sale.store.name}
                    </div>
                    <span className="inline-block mt-2 text-xs font-semibold text-blue-600">PASSER À LA CAISSE →</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 xl:col-span-2">
            {!selected ? (
              <div className="h-full min-h-64 flex items-center justify-center text-gray-500">
                Sélectionnez une vente puis cliquez sur <strong className="mx-1">PASSER À LA CAISSE</strong>.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4 mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{selected.orderNumber}</h2>
                    <p className="text-sm text-gray-500">{selected.store.name} · {selected.customer?.name || 'Client non renseigné'}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-sm font-medium">{selected.status}</span>
                </div>

                <div className="space-y-2 mb-5">
                  {selected.items.map(item => (
                    <div key={item.id} className="flex justify-between border-b pb-2">
                      <div>
                        <div className="font-medium">{item.variant.product.name} — {item.variant.name}</div>
                        <div className="text-xs text-gray-500">{item.variant.sku} · {item.quantity} × {money(item.unitPrice)} HTG</div>
                      </div>
                      <div className="font-medium">{money(item.totalPrice)} HTG</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mb-5">
                  <div><span className="text-gray-500">Sous-total</span><div className="font-semibold">{money(selected.subtotal)} HTG</div></div>
                  <div><span className="text-gray-500">Remise</span><div className="font-semibold">{money(selected.discount)} HTG</div></div>
                  <div><span className="text-gray-500">Taxe</span><div className="font-semibold">{money(selected.tax)} HTG</div></div>
                  <div><span className="text-gray-500">Total</span><div className="font-semibold">{money(total)} HTG</div></div>
                  <div><span className="text-gray-500">Déjà payé</span><div className="font-semibold">{money(paid)} HTG</div></div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                  <div className="rounded-lg bg-gray-100 p-3"><div className="text-xs text-gray-500">Crédit autorisé</div><div className="font-semibold">{money(credit)} HTG</div></div>
                  <div className="rounded-lg bg-gray-100 p-3"><div className="text-xs text-gray-500">Reste à couvrir</div><div className="font-semibold">{money(remaining)} HTG</div></div>
                  <div className={`rounded-lg p-3 ${canComplete ? 'bg-green-100' : 'bg-yellow-100'}`}><div className="text-xs">Couverture</div><div className="font-semibold">{money(coverage)} / {money(total)} HTG</div></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold mb-3">ENCAISSER</h3>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        placeholder={money(cashRemaining)}
                        className="flex-1 rounded-md border px-3 py-2"
                        disabled={processing || cashRemaining <= 0}
                      />
                      <Button onClick={collectPayment} disabled={processing || cashRemaining <= 0}>ENCAISSER</Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Un paiement partiel reste PENDING jusqu’à couverture complète.</p>
                  </div>

                  {user.canAuthorizeCredit && (
                    <div className="rounded-lg border p-4">
                      <h3 className="font-semibold mb-3">ACCORDER UN CRÉDIT</h3>
                      {!selected.customer ? (
                        <p className="text-sm text-red-600">Cette vente n’a pas de client. Le crédit est impossible.</p>
                      ) : selected.saleCredit ? (
                        <p className="text-sm text-gray-600">Un crédit de {money(credit)} HTG est déjà autorisé pour cette vente.</p>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={creditAmount}
                              onChange={e => setCreditAmount(e.target.value)}
                              placeholder={money(cashRemaining)}
                              className="flex-1 rounded-md border px-3 py-2"
                              disabled={processing || cashRemaining <= 0}
                            />
                            <Button onClick={authorizeCredit} disabled={processing || cashRemaining <= 0}>ACCORDER</Button>
                          </div>
                          <input
                            value={creditNote}
                            onChange={e => setCreditNote(e.target.value)}
                            placeholder="Note facultative"
                            className="w-full rounded-md border px-3 py-2 mt-2"
                            disabled={processing}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex justify-end">
                  <Button onClick={completeSale} disabled={!canComplete || processing}>
                    PASSER À LA CAISSE / FINALISER
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
