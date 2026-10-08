'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface Supplier {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
}

interface Purchase {
  id: string;
  reference: string;
  status: string;
  total: number | string;
  orderedAt?: string | null;
  receivedAt?: string | null;
}

interface Payment {
  id: string;
  amount: number | string;
  method: string;
  reference?: string | null;
  note?: string | null;
  paidAt: string;
  purchase?: { id: string; reference: string; total: number | string } | null;
}

interface Balance {
  totalPurchases: number | string;
  totalPaid: number | string;
  balance: number | string;
}

interface Store {
  id: string;
  name: string;
  code: string;
}

const money = (value: number | string) => Number(value || 0).toFixed(2) + ' HTG';

const statusLabel: Record<string, string> = {
  DRAFT: 'Brouillon',
  ORDERED: 'Commandée',
  PARTIALLY_RECEIVED: 'Partiellement reçue',
  RECEIVED: 'Reçue',
  CANCELLED: 'Annulée',
};

export default function SupplierDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentStoreId, setPaymentStoreId] = useState('');
  const [paymentPurchaseId, setPaymentPurchaseId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'BANK' | 'MONCASH' | 'NATCASH' | 'OTHER' | 'CASH'>('BANK');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [cashSessionId, setCashSessionId] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    setError(null);
    try {
      const [supplierResponse, balanceResponse, purchasesResponse, paymentsResponse] = await Promise.all([
        fetch('/api/suppliers/' + params.id),
        fetch('/api/suppliers/' + params.id + '/balance'),
        fetch('/api/purchases?supplierId=' + encodeURIComponent(params.id) + '&take=100'),
        fetch('/api/supplier-payments?supplierId=' + encodeURIComponent(params.id) + '&take=100'),
      ]);

      const [supplierData, balanceData, purchasesData, paymentsData] = await Promise.all([
        supplierResponse.json().catch(() => ({})),
        balanceResponse.json().catch(() => ({})),
        purchasesResponse.json().catch(() => ({})),
        paymentsResponse.json().catch(() => ({})),
      ]);

      if (!supplierResponse.ok) throw new Error(supplierData.error || 'Fournisseur introuvable');
      if (!balanceResponse.ok) throw new Error(balanceData.error || 'Impossible de charger le solde');
      if (!purchasesResponse.ok) throw new Error(purchasesData.error || 'Impossible de charger les achats');
      if (!paymentsResponse.ok) throw new Error(paymentsData.error || 'Impossible de charger les paiements');

      setSupplier(supplierData);
      setBalance(balanceData);
      setPurchases(purchasesData.purchases || []);
      setPayments(paymentsData.payments || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger le fournisseur');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    const loadStores = async () => {
      const response = await fetch('/api/stores?isActive=true&take=100');
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const availableStores = data.stores || [];
        setStores(availableStores);
        setPaymentStoreId((current) => current || availableStores[0]?.id || '');
      }
    };
    void loadStores();
  }, [user]);

  useEffect(() => {
    if (!showPayment || paymentMethod !== 'CASH' || !paymentStoreId) return;
    const loadCashSession = async () => {
      const response = await fetch('/api/cash-sessions?storeId=' + encodeURIComponent(paymentStoreId));
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.id) {
        setCashSessionId(data.id);
      } else {
        setCashSessionId('');
        setPaymentError('Aucune caisse ouverte pour ce magasin. Ouvrez une caisse avant un paiement en espèces.');
      }
    };
    void loadCashSession();
  }, [showPayment, paymentMethod, paymentStoreId]);

  const openPayment = () => {
    setPaymentStoreId(stores[0]?.id || '');
    setPaymentPurchaseId('');
    setPaymentAmount('');
    setPaymentMethod('BANK');
    setCashSessionId('');
    setPaymentReference('');
    setPaymentNote('');
    setPaymentError(null);
    setShowPayment(true);
  };

  const savePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    setPaymentError(null);
    const amount = Number(paymentAmount);
    if (!paymentStoreId || !Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Le magasin et un montant positif sont obligatoires.');
      return;
    }
    if (paymentMethod === 'CASH' && !cashSessionId) {
      setPaymentError('Aucune caisse ouverte pour ce magasin. Ouvrez une caisse avant de payer en espèces.');
      return;
    }
    setPaymentSaving(true);
    try {
      const response = await fetch('/api/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          supplierId: params.id,
          storeId: paymentStoreId,
          purchaseId: paymentPurchaseId || undefined,
          amount: paymentAmount,
          method: paymentMethod,
          cashSessionId: paymentMethod === 'CASH' ? cashSessionId : undefined,
          reference: paymentReference.trim() || undefined,
          note: paymentNote.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer le paiement');
      setShowPayment(false);
      await load();
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : 'Impossible d’enregistrer le paiement');
    } finally {
      setPaymentSaving(false);
    }
  };

  if (authLoading || !user) return authLoading ? <div className="min-h-screen flex items-center justify-center">Chargement...</div> : null;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar compact={compact} onToggleCompact={() => setCompact(!compact)} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo size={40} />
            <div>
              <h1 className="text-2xl font-bold">{supplier?.name || 'Fournisseur'}</h1>
              <p className="text-sm text-muted">{supplier?.code || 'Détail fournisseur'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/suppliers')}>Retour</Button>
            <Button onClick={openPayment} disabled={!supplier || Number(balance?.balance || 0) <= 0}>Payer</Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <Card className="p-4 text-danger">
              {error}
              <Button className="ml-3" variant="outline" onClick={() => void load()}>Réessayer</Button>
            </Card>
          )}

          {loading ? (
            <Card className="p-12 text-center">Chargement du fournisseur...</Card>
          ) : supplier ? (
            <>
              <Card className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div><div className="text-xs uppercase text-muted">Fournisseur</div><div className="font-semibold">{supplier.name}</div></div>
                  <div><div className="text-xs uppercase text-muted">Téléphone</div><div>{supplier.phone || '-'}</div></div>
                  <div><div className="text-xs uppercase text-muted">Email</div><div>{supplier.email || '-'}</div></div>
                  <div><div className="text-xs uppercase text-muted">Statut</div><div>{supplier.isActive ? 'Actif' : 'Inactif'}</div></div>
                </div>
                {supplier.address && <div className="mt-4 text-sm text-muted">{supplier.address}</div>}
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-5"><div className="text-sm text-muted">Total achats</div><div className="text-2xl font-bold mt-1">{money(balance?.totalPurchases || 0)}</div></Card>
                <Card className="p-5"><div className="text-sm text-muted">Total payé</div><div className="text-2xl font-bold mt-1">{money(balance?.totalPaid || 0)}</div></Card>
                <Card className="p-5"><div className="text-sm text-muted">Solde dû</div><div className="text-2xl font-bold mt-1">{money(balance?.balance || 0)}</div></Card>
              </div>

              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b"><h2 className="font-semibold">Historique des achats</h2></div>
                {purchases.length === 0 ? <div className="p-8 text-center text-muted">Aucun achat pour ce fournisseur.</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-background border-b"><tr>
                        {['Référence', 'Statut', 'Commandé le', 'Reçu le', 'Total', ''].map((h) => <th key={h} className="px-5 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
                      </tr></thead>
                      <tbody className="divide-y">
                        {purchases.map((purchase) => <tr key={purchase.id}>
                          <td className="px-5 py-4 font-medium">{purchase.reference}</td>
                          <td className="px-5 py-4 text-sm">{statusLabel[purchase.status] || purchase.status}</td>
                          <td className="px-5 py-4 text-sm">{purchase.orderedAt ? new Date(purchase.orderedAt).toLocaleDateString('fr-FR') : '-'}</td>
                          <td className="px-5 py-4 text-sm">{purchase.receivedAt ? new Date(purchase.receivedAt).toLocaleDateString('fr-FR') : '-'}</td>
                          <td className="px-5 py-4 text-sm font-semibold">{money(purchase.total)}</td>
                          <td className="px-5 py-4"><Button size="sm" variant="outline" onClick={() => router.push('/purchases/' + purchase.id)}>Détails</Button></td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b"><h2 className="font-semibold">Historique des paiements</h2></div>
                {payments.length === 0 ? <div className="p-8 text-center text-muted">Aucun paiement enregistré.</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-background border-b"><tr>
                        {['Date', 'Méthode', 'Achat', 'Référence', 'Montant'].map((h) => <th key={h} className="px-5 py-3 text-left text-xs font-medium text-muted uppercase">{h}</th>)}
                      </tr></thead>
                      <tbody className="divide-y">
                        {payments.map((payment) => <tr key={payment.id}>
                          <td className="px-5 py-4 text-sm">{new Date(payment.paidAt).toLocaleString('fr-FR')}</td>
                          <td className="px-5 py-4 text-sm">{payment.method}</td>
                          <td className="px-5 py-4 text-sm">{payment.purchase?.reference || 'Solde fournisseur'}</td>
                          <td className="px-5 py-4 text-sm">{payment.reference || '-'}</td>
                          <td className="px-5 py-4 text-sm font-semibold">{money(payment.amount)}</td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </main>
      </div>
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Payer le fournisseur">
        <form onSubmit={savePayment} className="space-y-4">
          {paymentError && <div className="p-3 rounded bg-danger-soft text-danger text-sm">{paymentError}</div>}
          <div className="text-sm text-muted">Fournisseur : <span className="font-semibold text-foreground">{supplier?.name}</span></div>
          <select className="w-full rounded-md border border-border px-3 py-2 text-sm" value={paymentStoreId} onChange={(e) => setPaymentStoreId(e.target.value)}>
            <option value="">Sélectionner un magasin</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name} ({store.code})</option>)}
          </select>
          <select className="w-full rounded-md border border-border px-3 py-2 text-sm" value={paymentPurchaseId} onChange={(e) => setPaymentPurchaseId(e.target.value)}>
            <option value="">Paiement sur le solde fournisseur</option>
            {purchases.filter((purchase) => purchase.status !== 'DRAFT' && purchase.status !== 'CANCELLED').map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.reference} — {money(purchase.total)}</option>)}
          </select>
          <Input placeholder="Montant *" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
          <select className="w-full rounded-md border border-border px-3 py-2 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
            <option value="BANK">Banque</option>
            <option value="MONCASH">MonCash</option>
            <option value="NATCASH">NatCash</option>
            <option value="CASH">Espèces</option>
            <option value="OTHER">Autre</option>
          </select>
          {paymentMethod === 'CASH' && <div className={cashSessionId ? 'text-sm text-success' : 'text-sm text-warning'}>{cashSessionId ? 'Caisse ouverte : paiement en espèces autorisé.' : 'Aucune caisse ouverte pour ce magasin.'}</div>}
          <Input placeholder="Référence" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
          <Input placeholder="Note" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowPayment(false)}>Annuler</Button><Button type="submit" disabled={paymentSaving || !stores.length}>{paymentSaving ? 'Enregistrement...' : 'Enregistrer le paiement'}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
