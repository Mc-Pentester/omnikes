'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Input } from '@omnikes/components/ui/input';
import { Card } from '@omnikes/components/ui/card';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { useCurrentStore } from '@omnikes/contexts/StoreContext';

interface Payment {
  id: string;
  method: string;
  amount: string | number;
  reference?: string | null;
  status: string;
  createdAt: string;
}

interface Sale {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  createdAt: string;
  storeId: string;
  store?: { id: string; name: string; code: string } | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: string | number;
    totalPrice: string | number;
    variant: { sku: string; name: string; product: { name: string } };
  }>;
  payments: Payment[];
  saleCredit?: { id: string; amount: string | number; status: string; customerId: string; note?: string | null } | null;
}

const money = (value: string | number) => Number(value || 0).toFixed(2);

const paymentMethods = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'CARD', label: 'Carte' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'BANK_TRANSFER', label: 'Virement' },
  { value: 'CHECK', label: 'Chèque' },
];

export default function PendingSalesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [compact, setCompact] = useState(false);

  const loadSales = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ status: 'PENDING', take: '100' });
      if (currentStoreId) params.set('storeId', currentStoreId);

      const response = await fetch('/api/sales?' + params.toString());
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Impossible de charger les ventes en attente');

      const data = await response.json();
      setSales(data.sales || []);

      if (selectedSale && !(data.sales || []).some((sale: Sale) => sale.id === selectedSale.id)) {
        setSelectedSale(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les ventes en attente');
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, selectedSale, user]);

  useEffect(() => {
    if (user) loadSales();
  }, [user, loadSales]);

  const loadSale = async (saleId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/sales/' + saleId);
      if (!response.ok) throw new Error('Impossible de charger la vente');
      setSelectedSale(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la vente');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectSale = (sale: Sale) => {
    setPaymentAmount('');
    setCreditAmount('');
    setCreditNote('');
    loadSale(sale.id);
  };

  const totals = useMemo(() => {
    if (!selectedSale) return { paid: 0, credit: 0, remaining: 0 };
    const paid = selectedSale.payments
      .filter((payment) => payment.status === 'COMPLETED' && payment.method !== 'CREDIT')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const credit = selectedSale.saleCredit?.status === 'AUTHORIZED'
      ? Number(selectedSale.saleCredit.amount)
      : 0;
    return {
      paid,
      credit,
      remaining: Math.max(0, Number(selectedSale.total) - paid - credit),
    };
  }, [selectedSale]);

  const refreshAfterMutation = async () => {
    if (!selectedSale) return;
    const response = await fetch('/api/sales/' + selectedSale.id);
    if (response.ok) {
      const updated: Sale = await response.json();
      if (updated.status === 'COMPLETED') {
        setSelectedSale(null);
        setPaymentAmount('');
        setCreditAmount('');
        await loadSales();
      } else {
        setSelectedSale(updated);
        await loadSales();
      }
    }
  };

  const cancelSale = async () => {
    if (!selectedSale) return;

    const confirmed = window.confirm(
      `Annuler définitivement la vente ${selectedSale.orderNumber} ? La vente sera conservée avec le statut CANCELLED.`
    );
    if (!confirmed) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/sales/' + selectedSale.id + '/cancel', {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'L’annulation de la vente a échoué');
      }

      setSelectedSale(null);
      setPaymentAmount('');
      setCreditAmount('');
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'L’annulation de la vente a échoué');
      await loadSale(selectedSale.id);
    } finally {
      setProcessing(false);
    }
  };

  const finalizeSale = async () => {
    if (!selectedSale) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/sales/' + selectedSale.id + '/complete', {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'La finalisation de la vente a échoué');
      }

      setSelectedSale(null);
      setPaymentAmount('');
      setCreditAmount('');
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La finalisation de la vente a échoué');
      await loadSale(selectedSale.id);
    } finally {
      setProcessing(false);
    }
  };

  const addPayment = async () => {
    if (!selectedSale) return;
    const amount = Number(paymentAmount);
    const outstandingBeforePayment = totals.remaining;

    if (!Number.isFinite(amount) || amount <= 0 || amount > outstandingBeforePayment) {
      setError(`Montant invalide. Maximum autorisé: ${money(outstandingBeforePayment)} HTG.`);
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/sales/' + selectedSale.id + '/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          method: paymentMethod,
          amount,
          status: 'COMPLETED',
          reference: `PENDING-${Date.now()}`,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Échec de l’encaissement');

      setPaymentAmount('');
      await refreshAfterMutation();

      const refreshed = await fetch('/api/sales/' + selectedSale.id);
      if (refreshed.ok) {
        const sale: Sale = await refreshed.json();
        const paid = sale.payments
          .filter((payment) => payment.status === 'COMPLETED' && payment.method !== 'CREDIT')
          .reduce((sum, payment) => sum + Number(payment.amount), 0);
        const credit = sale.saleCredit?.status === 'AUTHORIZED' ? Number(sale.saleCredit.amount) : 0;

        if (paid + credit >= Number(sale.total)) {
          const completeResponse = await fetch('/api/sales/' + selectedSale.id + '/complete', { method: 'POST' });
          if (!completeResponse.ok) {
            const completeData = await completeResponse.json().catch(() => null);
            throw new Error(completeData?.error || 'Paiement enregistré, mais la finalisation a échoué');
          }
          setSelectedSale(null);
          await loadSales();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’encaissement');
    } finally {
      setProcessing(false);
    }
  };

  const authorizeCredit = async () => {
    if (!selectedSale?.customer) {
      setError('Un client est obligatoire pour accorder un crédit.');
      return;
    }

    const amount = Number(creditAmount);
    const remainingBeforeCredit = Math.max(0, Number(selectedSale.total) - totals.paid);

    if (!Number.isFinite(amount) || amount <= 0 || amount > remainingBeforeCredit) {
      setError(`Crédit invalide. Maximum autorisé: ${money(remainingBeforeCredit)} HTG.`);
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/sales/' + selectedSale.id + '/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedSale.customer.id,
          amount,
          note: creditNote.trim() || undefined,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Échec de l’autorisation du crédit');

      setCreditAmount('');
      setCreditNote('');
      await refreshAfterMutation();

      const refreshed = await fetch('/api/sales/' + selectedSale.id);
      if (refreshed.ok) {
        const sale: Sale = await refreshed.json();
        const paid = sale.payments
          .filter((payment) => payment.status === 'COMPLETED' && payment.method !== 'CREDIT')
          .reduce((sum, payment) => sum + Number(payment.amount), 0);
        const credit = sale.saleCredit?.status === 'AUTHORIZED' ? Number(sale.saleCredit.amount) : 0;

        if (paid + credit >= Number(sale.total)) {
          const completeResponse = await fetch('/api/sales/' + selectedSale.id + '/complete', { method: 'POST' });
          if (!completeResponse.ok) {
            const completeData = await completeResponse.json().catch(() => null);
            throw new Error(completeData?.error || 'Crédit autorisé, mais la finalisation a échoué');
          }
          setSelectedSale(null);
          await loadSales();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’autorisation du crédit');
    } finally {
      setProcessing(false);
    }
  };

  const filteredSales = sales.filter((sale) => {
    const value = search.trim().toLowerCase();
    if (!value) return true;
    return sale.orderNumber.toLowerCase().includes(value) ||
      (sale.customer?.name || '').toLowerCase().includes(value);
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Chargement...</div>;
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar compact={compact} onToggleCompact={() => setCompact(!compact)} />

      <main className="flex-1 min-w-0 h-screen overflow-y-auto">
        <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Ventes en attente</h1>
              <p className="text-sm text-gray-500 mt-1">Encaisser, accorder un crédit et finaliser les ventes PENDING.</p>
            </div>
            <Button onClick={loadSales} variant="outline" disabled={loading}>Actualiser</Button>
          </div>

          {error && (
            <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-semibold text-gray-900">En attente ({filteredSales.length})</h2>
                {currentStoreId && <span className="text-xs text-gray-500">Magasin courant</span>}
              </div>

              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher commande ou client..."
                className="mb-4"
              />

              {loading ? (
                <p className="text-center text-gray-500 py-8">Chargement...</p>
              ) : filteredSales.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-gray-500">Aucune vente en attente.</p>
                  <p className="text-xs text-gray-400 mt-2">Les ventes PENDING apparaîtront ici.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto">
                  {filteredSales.map((sale) => {
                    const paid = sale.payments
                      .filter((payment) => payment.status === 'COMPLETED' && payment.method !== 'CREDIT')
                      .reduce((sum, payment) => sum + Number(payment.amount), 0);
                    const credit = sale.saleCredit?.status === 'AUTHORIZED' ? Number(sale.saleCredit.amount) : 0;
                    const remaining = Math.max(0, Number(sale.total) - paid - credit);
                    const fullyCovered = remaining <= 0;

                    return (
                      <button
                        key={sale.id}
                        onClick={() => selectSale(sale)}
                        className={`w-full text-left p-4 rounded-lg border transition-colors ${selectedSale?.id === sale.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      >
                        <div className="flex justify-between gap-3">
                          <span className="font-semibold text-gray-900">{sale.orderNumber}</span>
                          <span className="font-bold text-gray-900">{money(sale.total)} HTG</span>
                        </div>
                        <div className="flex justify-between gap-3 mt-2 text-sm">
                          <span className="text-gray-600">{sale.customer?.name || 'Client anonyme'}</span>
                          <span className={fullyCovered ? 'text-amber-700 font-semibold' : 'text-orange-600 font-medium'}>
                            {fullyCovered ? 'Paiement complet — finalisation en attente' : 'Reste ' + money(remaining) + ' HTG'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(sale.createdAt).toLocaleString('fr-FR')}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4 md:p-6">
              {!selectedSale ? (
                <div className="h-full min-h-[500px] flex items-center justify-center text-center">
                  <div>
                    <p className="text-xl font-semibold text-gray-700">Sélectionnez une vente</p>
                    <p className="text-sm text-gray-500 mt-2">Le détail et les opérations de caisse apparaîtront ici.</p>
                  </div>
                </div>
              ) : detailLoading ? (
                <div className="min-h-[500px] flex items-center justify-center">Chargement de la vente...</div>
              ) : (
                <div>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b pb-5">
                    <div>
                      <p className="text-sm text-gray-500">Vente en attente</p>
                      <h2 className="text-2xl font-bold text-gray-900">{selectedSale.orderNumber}</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        {selectedSale.store?.name || 'Magasin'} · {selectedSale.customer?.name || 'Client anonyme'}
                      </p>
                    </div>
                    <span className={
                      'px-3 py-1 rounded-full text-sm font-semibold w-fit ' +
                      (totals.remaining <= 0 ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-700')
                    }>
                      {totals.remaining <= 0 ? 'PAIEMENT COMPLET · FINALISATION' : 'PENDING'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-5">
                    <div className="p-4 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Total vente</p>
                      <p className="text-xl font-bold">{money(selectedSale.total)} HTG</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Déjà encaissé</p>
                      <p className="text-xl font-bold">{money(totals.paid)} HTG</p>
                    </div>
                    <div className="p-4 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Crédit autorisé</p>
                      <p className="text-xl font-bold">{money(totals.credit)} HTG</p>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden mb-6">
                    <div className="px-4 py-3 bg-gray-50 font-semibold">Articles</div>
                    <div className="divide-y">
                      {selectedSale.items.map((item) => (
                        <div key={item.id} className="p-4 flex justify-between gap-4">
                          <div>
                            <p className="font-medium">{item.variant.product.name}</p>
                            <p className="text-sm text-gray-500">{item.variant.name} · {item.variant.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{item.quantity} × {money(item.unitPrice)} HTG</p>
                            <p className="font-bold">{money(item.totalPrice)} HTG</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedSale.payments.length > 0 && (
                    <div className="border rounded-lg overflow-hidden mb-6">
                      <div className="px-4 py-3 bg-gray-50 font-semibold">Paiements enregistrés</div>
                      <div className="divide-y">
                        {selectedSale.payments.map((payment) => (
                          <div key={payment.id} className="p-3 flex justify-between text-sm">
                            <span>{paymentMethods.find((method) => method.value === payment.method)?.label || payment.method}</span>
                            <span className="font-semibold">{money(payment.amount)} HTG</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSale.saleCredit && (
                    <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50">
                      <p className="font-semibold text-amber-900">Crédit autorisé</p>
                      <p className="text-sm text-amber-800 mt-1">{money(selectedSale.saleCredit.amount)} HTG pour {selectedSale.customer?.name || 'le client'}</p>
                      {selectedSale.saleCredit.note && <p className="text-sm text-amber-700 mt-1">{selectedSale.saleCredit.note}</p>}
                    </div>
                  )}

                  <div className="mb-6 flex justify-end">
                    <Button
                      onClick={cancelSale}
                      disabled={processing}
                      variant="outline"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      Annuler la vente
                    </Button>
                  </div>

                  {totals.remaining <= 0 && (
                    <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <p className="font-semibold text-amber-900">Paiement complet — vente encore PENDING</p>
                          <p className="text-sm text-amber-800 mt-1">
                            Aucun nouveau paiement n'est nécessaire. La prochaine étape est la finalisation serveur, qui vérifiera notamment la disponibilité du stock.
                          </p>
                        </div>
                        <Button
                          onClick={finalizeSale}
                          disabled={processing}
                          className="shrink-0"
                        >
                          {processing ? 'Finalisation...' : 'Finaliser la vente'}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <section className="border rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Encaisser un paiement</h3>
                      <div className="space-y-3">
                        <select
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                          className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm"
                          disabled={processing || totals.remaining <= 0}
                        >
                          {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                        </select>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={paymentAmount}
                          onChange={(event) => setPaymentAmount(event.target.value)}
                          placeholder={`Maximum ${money(totals.remaining)} HTG`}
                          disabled={processing || totals.remaining <= 0}
                        />
                        <Button
                          onClick={addPayment}
                          disabled={processing || totals.remaining <= 0 || !paymentAmount}
                          className="w-full"
                        >
                          {processing ? 'Traitement...' : 'Enregistrer le paiement'}
                        </Button>
                      </div>
                    </section>

                    <section className="border rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Accorder un crédit</h3>
                      {!selectedSale.customer ? (
                        <p className="text-sm text-red-600">Cette vente n’a pas de client. Un crédit ne peut pas être autorisé.</p>
                      ) : selectedSale.saleCredit ? (
                        <p className="text-sm text-gray-600">Un crédit est déjà autorisé pour cette vente.</p>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-500">Client : <strong>{selectedSale.customer.name}</strong></p>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={creditAmount}
                            onChange={(event) => setCreditAmount(event.target.value)}
                            placeholder={`Maximum ${money(Math.max(0, Number(selectedSale.total) - totals.paid))} HTG`}
                            disabled={processing || totals.remaining <= 0}
                          />
                          <Input
                            value={creditNote}
                            onChange={(event) => setCreditNote(event.target.value)}
                            placeholder="Note facultative"
                            disabled={processing || totals.remaining <= 0}
                            maxLength={1000}
                          />
                          <Button
                            onClick={authorizeCredit}
                            disabled={processing || totals.remaining <= 0 || !creditAmount}
                            variant="outline"
                            className="w-full"
                          >
                            {processing ? 'Traitement...' : 'Accorder le crédit'}
                          </Button>
                        </div>
                      )}
                    </section>
                  </div>

                  <div className="mt-6 p-4 rounded-lg bg-gray-900 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-300">Reste à couvrir</p>
                      <p className="text-2xl font-bold">{money(totals.remaining)} HTG</p>
                    </div>
                    <p className="text-sm text-gray-300 max-w-xl">
                      La finalisation est exclusivement contrôlée par le serveur. Elle intervient seulement lorsque les paiements réels + le crédit explicitement autorisé couvrent le total et que le stock est disponible.
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
