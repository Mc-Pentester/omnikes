'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { useAuth } from '@omnikes/contexts/AuthContext';

type CreditRow = {
  id: string;
  amount: string | number;
  paid: number;
  outstanding: number;
  dueAt: string;
  status: string;
  overdue: boolean;
  customer: { id: string; name: string; phone?: string | null; creditLimit?: string | number | null };
  sale: { id: string; orderNumber: string; currencyCode: string; currencySymbol: string; total: string | number };
  authorizedByUser?: { name?: string | null; email?: string };
};
type CreditPayment = {
  id: string;
  amount: string | number;
  method: string;
  reference?: string | null;
  createdAt: string;
  receivedByUser?: { name?: string | null; email?: string };
};

export default function CustomerCreditsPage() {
  const { user, loading: authLoading } = useAuth();
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [totals, setTotals] = useState<Record<string, { credit: number; paid: number; outstanding: number; overdue: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeId, setStoreId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<CreditPayment[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [compact, setCompact] = useState(false);

  const loadCredits = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ take: '100' });
      if (storeId) query.set('storeId', storeId);
      const response = await fetch('/api/credits?' + query.toString(), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les créances clients.');
      setCredits(data.credits || []);
      setTotals(data.totalsByCurrency || {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur de chargement des crédits.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (!authLoading && user) void loadCredits();
  }, [authLoading, user, loadCredits]);

  const receivePayment = async (credit: CreditRow) => {
    setPaymentError('');
    setPaymentMessage('');
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > credit.outstanding) {
      setPaymentError('Le montant doit être positif et ne pas dépasser le solde restant.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/credits/' + credit.id + '/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          amount: value,
          method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer le remboursement.');
      setPaymentMessage('Paiement enregistré. Solde restant : ' + Number(data.outstandingAfter).toFixed(2) + ' ' + credit.sale.currencyCode);
      setAmount('');
      setReference('');
      await loadCredits();
    } catch (cause) {
      setPaymentError(cause instanceof Error ? cause.message : 'Erreur lors de l’encaissement.');
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async (creditId: string) => {
    setHistoryError('');
    setHistoryId(creditId);
    try {
      const response = await fetch('/api/credits/' + creditId + '/payments');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Historique indisponible.');
      setHistory(data);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : 'Historique indisponible.');
      setHistory([]);
    }
  };

  if (authLoading || !user) return <main className="p-8">Chargement…</main>;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar compact={compact} onToggleCompact={() => setCompact((value) => !value)} />
      <main className="flex-1 min-w-0 h-screen overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Clients & encaissements</p>
              <h1 className="text-2xl font-bold text-foreground">Crédits clients</h1>
              <p className="text-sm text-muted">Suivez les créances, les échéances et les remboursements partiels.</p>
            </div>
            <Button variant="outline" onClick={() => void loadCredits()} disabled={loading}>Actualiser</Button>
          </header>

          {error && <Card className="p-4 text-danger">{error}</Card>}
          {Object.entries(totals).length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(totals).map(([currency, value]) => (
                <Card key={currency} className="p-4">
                  <p className="text-xs text-muted">Solde ouvert · {currency}</p>
                  <p className="mt-1 text-2xl font-semibold">{value.outstanding.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted">Accordé {value.credit.toFixed(2)} · encaissé {value.paid.toFixed(2)}</p>
                  <p className="text-xs text-danger">Échu : {value.overdue.toFixed(2)}</p>
                </Card>
              ))}
            </div>
          )}

          {loading ? <p className="text-sm text-muted">Chargement des créances…</p> : credits.length === 0 ? (
            <Card className="p-8 text-center">
              <h2 className="font-semibold">Aucune créance client</h2>
              <p className="mt-1 text-sm text-muted">Les crédits autorisés apparaîtront ici après la finalisation de leur vente.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {credits.map((credit) => (
                <Card key={credit.id} className="p-4 md:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{credit.customer.name}</h2>
                        <span className={credit.overdue ? 'rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger' : 'rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted'}>
                          {credit.overdue ? 'Échu' : credit.status === 'SETTLED' ? 'Soldé' : credit.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{credit.sale.orderNumber} · {credit.customer.phone || 'Sans téléphone'}</p>
                      <p className="mt-1 text-xs text-muted">Échéance : {new Date(credit.dueAt).toLocaleDateString()} · Autorisé par {credit.authorizedByUser?.name || credit.authorizedByUser?.email || 'Responsable'}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-right text-sm">
                      <div><p className="text-xs text-muted">Crédit</p><p className="font-semibold">{Number(credit.amount).toFixed(2)}</p></div>
                      <div><p className="text-xs text-muted">Payé</p><p className="font-semibold">{credit.paid.toFixed(2)}</p></div>
                      <div><p className="text-xs text-muted">Solde</p><p className="font-semibold">{credit.outstanding.toFixed(2)} {credit.sale.currencyCode}</p></div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                    {user.canReceiveCreditPayment && credit.outstanding > 0 && credit.status === 'AUTHORIZED' && (
                      <Button size="sm" onClick={() => { setSelectedId(selectedId === credit.id ? null : credit.id); setPaymentError(''); setPaymentMessage(''); }}>
                        {selectedId === credit.id ? 'Fermer encaissement' : 'Encaisser un remboursement'}
                      </Button>
                    )}
                    {user.canViewCreditHistory && (
                      <Button size="sm" variant="outline" onClick={() => void loadHistory(credit.id)}>Historique des paiements</Button>
                    )}
                  </div>

                  {selectedId === credit.id && (
                    <div className="mt-4 max-w-xl space-y-3 rounded-lg border border-border p-4">
                      <h3 className="font-medium">Nouveau remboursement · {credit.sale.currencyCode}</h3>
                      <Input type="number" min="0.01" max={credit.outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Maximum ${credit.outstanding.toFixed(2)}`} />
                      <select value={method} onChange={(event) => setMethod(event.target.value)} className="h-10 w-full rounded-md border border-border-strong px-3 text-sm">
                        <option value="CASH">Espèces</option>
                        <option value="CARD">Carte</option>
                        <option value="MOBILE_MONEY">Mobile Money</option>
                        <option value="BANK_TRANSFER">Virement</option>
                        <option value="CHECK">Chèque</option>
                      </select>
                      <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Référence (facultative)" />
                      {paymentError && <p role="alert" className="text-sm text-danger">{paymentError}</p>}
                      {paymentMessage && <p role="status" className="text-sm text-success">{paymentMessage}</p>}
                      <Button disabled={saving || !amount} onClick={() => void receivePayment(credit)}>{saving ? 'Enregistrement…' : 'Confirmer le remboursement'}</Button>
                    </div>
                  )}

                  {historyId === credit.id && (
                    <div className="mt-4 rounded-lg bg-surface-muted p-3">
                      <h3 className="text-sm font-medium">Historique des remboursements</h3>
                      {historyError ? <p className="mt-2 text-sm text-danger">{historyError}</p> : history.length === 0 ? <p className="mt-2 text-sm text-muted">Aucun paiement enregistré.</p> : (
                        <ul className="mt-2 divide-y divide-border">
                          {history.map((payment) => (
                            <li key={payment.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                              <span>{new Date(payment.createdAt).toLocaleString()} · {payment.method} · {payment.reference || 'Sans référence'}</span>
                              <strong>{Number(payment.amount).toFixed(2)} {credit.sale.currencyCode}</strong>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
