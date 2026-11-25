'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { useAuth } from '@omnikes/contexts/AuthContext';

type ReturnSaleItem = {
  id: string;
  quantity: number;
  returnedQuantity: number;
  totalPrice: string | number;
  variant: { id: string; sku: string; product: { name: string } };
};
type ReturnRecord = {
  id: string;
  status: string;
  reason?: string | null;
  totalRefunded: string | number;
  createdAt: string;
  items: Array<{ id: string; quantity: number; totalRefunded: string | number; saleItem: { id: string; variant: { sku: string; product: { name: string } } } }>;
};
type EligibleSale = {
  id: string;
  orderNumber: string;
  createdAt: string;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  currencyCode: string;
  currencySymbol: string;
  storeId: string;
  store: { id: string; name: string };
  customer?: { id: string; name: string; phone?: string | null } | null;
  items: ReturnSaleItem[];
  returns: ReturnRecord[];
};
type RecentReturn = ReturnRecord & {
  sale: { id: string; orderNumber: string; customerName: string; currencyCode: string; currencySymbol: string; storeName: string };
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default function ReturnsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [sales, setSales] = useState<EligibleSale[]>([]);
  const [recentReturns, setRecentReturns] = useState<RecentReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [compact, setCompact] = useState(false);

  const loadSales = useCallback(async (term = '') => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ take: '100' });
      if (term.trim()) query.set('search', term.trim());
      const response = await fetch('/api/returns/eligible-sales?' + query.toString(), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les ventes admissibles.');
      setSales(data.sales || []);
      setRecentReturns(data.recentReturns || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur de chargement des retours.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
    if (!authLoading && user?.canReturnSale) {
      const timer = window.setTimeout(() => void loadSales(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [authLoading, user, loadSales, router]);

  const selectedSale = sales.find((sale) => sale.id === selectedSaleId) || null;
  const selectedItems = useMemo(
    () => selectedSale?.items.filter((item) => (quantities[item.id] || 0) > 0) || [],
    [selectedSale, quantities],
  );

  const estimateRefund = useCallback((sale: EligibleSale, item: ReturnSaleItem, quantity: number) => {
    const sortedItems = [...sale.items].sort((a, b) => a.id.localeCompare(b.id));
    const netTotal = money(sortedItems.reduce((sum, line) => sum + Number(line.totalPrice), 0));
    const taxTotal = money(Number(sale.tax) || 0);
    let cumulativeNet = 0;
    let previousTax = 0;
    let itemTax = 0;
    for (const line of sortedItems) {
      cumulativeNet = money(cumulativeNet + Number(line.totalPrice));
      const cumulativeTax = netTotal > 0 ? money(taxTotal * cumulativeNet / netTotal) : 0;
      if (line.id === item.id) itemTax = money(cumulativeTax - previousTax);
      previousTax = cumulativeTax;
    }
    const beforeQuantity = item.returnedQuantity || 0;
    const afterQuantity = beforeQuantity + quantity;
    const before = money(money(Number(item.totalPrice) * beforeQuantity / item.quantity) + money(itemTax * beforeQuantity / item.quantity));
    const after = money(money(Number(item.totalPrice) * afterQuantity / item.quantity) + money(itemTax * afterQuantity / item.quantity));
    return money(after - before);
  }, []);

  const estimatedTotal = selectedSale
    ? money(selectedItems.reduce((sum, item) => sum + estimateRefund(selectedSale, item, quantities[item.id] || 0), 0))
    : 0;

  const selectSale = (sale: EligibleSale) => {
    setSelectedSaleId(sale.id);
    setQuantities({});
    setReason('');
    setIdempotencyKey(null);
    setError('');
    setMessage('');
  };

  const updateQuantity = (item: ReturnSaleItem, value: number) => {
    const max = Math.max(0, item.quantity - (item.returnedQuantity || 0));
    setQuantities((current) => ({ ...current, [item.id]: Math.min(max, Math.max(0, Math.trunc(value) || 0)) }));
    setIdempotencyKey(null);
  };

  const submitReturn = async () => {
    if (!selectedSale || selectedItems.length === 0) {
      setError('Sélectionnez au moins un article et une quantité à retourner.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    const key = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(key);
    try {
      const response = await fetch('/api/sales/' + selectedSale.id + '/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          saleId: selectedSale.id,
          items: selectedItems.map((item) => ({ saleItemId: item.id, quantity: quantities[item.id] })),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Le retour n’a pas pu être enregistré.');
      setMessage('Retour enregistré. Montant calculé : ' + Number(data.totalRefunded).toFixed(2) + ' ' + selectedSale.currencyCode + '.');
      setSelectedSaleId(null);
      setQuantities({});
      setReason('');
      setIdempotencyKey(null);
      await loadSales(search);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur lors du traitement du retour.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) return <main className="p-8">Chargement…</main>;
  if (!user.canReturnSale) return <main className="min-h-screen bg-background p-6"><Card className="mx-auto mt-16 max-w-xl p-6 text-center"><h1 className="text-xl font-semibold">Accès non autorisé</h1><p className="mt-2 text-sm text-muted">Votre rôle ne dispose pas de la permission de traiter les retours.</p><Button className="mt-4" onClick={() => router.replace('/')}>Retour à l’accueil</Button></Card></main>;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar compact={compact} onToggleCompact={() => setCompact((value) => !value)} />
      <main className="flex-1 min-w-0 h-screen overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Ventes & service après-vente</p>
              <h1 className="text-2xl font-bold text-foreground">Traitement des retours</h1>
              <p className="mt-1 text-sm text-muted">Retrouvez une vente terminée, sélectionnez les articles retournés et enregistrez l’opération.</p>
            </div>
            <Button variant="outline" onClick={() => void loadSales(search)} disabled={loading}>Actualiser</Button>
          </header>

          {error && <Card className="p-3 text-sm text-danger" role="alert">{error}</Card>}
          {message && <Card className="p-3 text-sm text-success" role="status">{message}</Card>}

          <Card className="space-y-4 p-4 md:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label htmlFor="return-sale-search" className="mb-1 block text-sm font-medium">Rechercher une vente</label>
                <Input id="return-sale-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="N° de commande ou nom du client" />
              </div>
              <Button variant="outline" onClick={() => void loadSales(search)} disabled={loading}>Rechercher</Button>
            </div>

            {loading ? <p className="text-sm text-muted">Chargement des ventes terminées…</p> : sales.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <h2 className="font-semibold">Aucune vente à retourner</h2>
                <p className="mt-1 text-sm text-muted">Les ventes terminées avec des quantités encore retournables apparaîtront ici.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sales.map((sale) => {
                  const remainingUnits = sale.items.reduce((sum, item) => sum + Math.max(0, item.quantity - (item.returnedQuantity || 0)), 0);
                  return (
                    <div key={sale.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{sale.orderNumber}</p>
                        <p className="text-sm text-muted">{sale.customer?.name || 'Client comptoir'} · {sale.store.name}</p>
                        <p className="text-xs text-muted">{new Date(sale.createdAt).toLocaleString()} · {remainingUnits} unité(s) encore retournable(s)</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <strong className="text-sm">{Number(sale.total).toFixed(2)} {sale.currencyCode}</strong>
                        <Button size="sm" variant={selectedSaleId === sale.id ? 'outline' : 'default'} onClick={() => selectedSaleId === sale.id ? setSelectedSaleId(null) : selectSale(sale)}>
                          {selectedSaleId === sale.id ? 'Fermer' : 'Traiter le retour'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {selectedSale && (
            <Card className="space-y-4 p-4 md:p-5">
              <div>
                <p className="text-sm text-muted">Commande {selectedSale.orderNumber}</p>
                <h2 className="text-lg font-semibold">Articles à retourner</h2>
                <p className="text-sm text-muted">{selectedSale.customer?.name || 'Client comptoir'} · {selectedSale.store.name}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead><tr className="border-b border-border text-left text-muted"><th className="py-2 pr-3">Article / SKU</th><th className="py-2 pr-3">Vendu</th><th className="py-2 pr-3">Déjà retourné</th><th className="py-2 pr-3">Disponible</th><th className="py-2">Quantité à retourner</th></tr></thead>
                  <tbody>
                    {selectedSale.items.map((item) => {
                      const available = item.quantity - (item.returnedQuantity || 0);
                      return <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="py-3 pr-3"><p className="font-medium">{item.variant.product.name}</p><p className="text-xs text-muted">{item.variant.sku}</p></td>
                        <td className="py-3 pr-3">{item.quantity}</td>
                        <td className="py-3 pr-3">{item.returnedQuantity || 0}</td>
                        <td className="py-3 pr-3">{available}</td>
                        <td className="py-3"><Input aria-label={'Quantité à retourner - ' + item.variant.product.name} type="number" min="0" max={available} step="1" value={quantities[item.id] || 0} disabled={available <= 0} onChange={(event) => updateQuantity(item, Number(event.target.value))} /></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <label htmlFor="return-reason" className="mb-1 block text-sm font-medium">Motif du retour (facultatif)</label>
                  <textarea id="return-reason" value={reason} onChange={(event) => { setReason(event.target.value); setIdempotencyKey(null); }} maxLength={1000} rows={3} className="w-full rounded-md border border-border-strong bg-background p-3 text-sm" placeholder="Ex. : article défectueux, erreur de commande…" />
                </div>
                <div className="min-w-[220px] rounded-lg bg-surface-muted p-3">
                  <p className="text-xs text-muted">Montant estimé du retour, taxes incluses</p>
                  <p className="mt-1 text-2xl font-bold">{estimatedTotal.toFixed(2)} {selectedSale.currencyCode}</p>
                  <Button className="mt-3 w-full" disabled={saving || selectedItems.length === 0} onClick={() => void submitReturn()}>{saving ? 'Enregistrement…' : 'Confirmer le retour'}</Button>
                </div>
              </div>
            </Card>
          )}

          <section className="space-y-3">
            <div><h2 className="text-lg font-semibold">Historique récent des retours</h2><p className="text-sm text-muted">Les opérations enregistrées restent consultables pour assurer leur traçabilité.</p></div>
            {recentReturns.length === 0 ? <Card className="p-5 text-sm text-muted">Aucun retour enregistré récemment.</Card> : (
              <Card className="divide-y divide-border p-4">
                {recentReturns.map((record) => (
                  <div key={record.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-medium">{record.sale.orderNumber} · {record.sale.customerName}</p><p className="text-xs text-muted">{new Date(record.createdAt).toLocaleString()} · {record.sale.storeName} · {record.items.map((item) => item.saleItem.variant.product.name + ' × ' + item.quantity).join(', ')}</p>{record.reason && <p className="mt-1 text-xs text-muted">Motif : {record.reason}</p>}</div>
                    <strong className="text-sm">{Number(record.totalRefunded).toFixed(2)} {record.sale.currencyCode}</strong>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
