'use client';

import { useCallback, useEffect, useState } from 'react';
import { Logo } from '@omnikes/components/branding/Logo';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Badge } from '@omnikes/components/ui/badge';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';

type Store = { id: string; name: string; code: string };
type Summary = {
  session: {
    id: string;
    status: string;
    storeId: string;
    openingAmount: string | number;
    countedAmount?: string | number | null;
    difference?: string | number | null;
  };
  openingAmount: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  refunds: number;
  expectedAmount: number;
  countedAmount: number | null;
  difference: number | null;
};

const formatAmount = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseAmount = (value: string) => Number(value.replace(',', '.'));

const isPositiveAmount = (value: string) => Number.isFinite(parseAmount(value)) && parseAmount(value) > 0;

export default function CashPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [session, setSession] = useState<Summary | null>(null);
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementType, setMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  const loadStores = useCallback(async () => {
    const res = await fetch('/api/stores');
    if (!res.ok) throw new Error('Impossible de charger les magasins');
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.stores ?? data.data ?? [];
    setStores(list);
    if (!storeId && list[0]) setStoreId(list[0].id);
  }, [storeId]);

  const loadSession = useCallback(async (id = storeId) => {
    if (!id) return;
    const res = await fetch('/api/cash-sessions?storeId=' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Impossible de charger la caisse');
    const data = await res.json();
    if (!data) {
      setSession(null);
      return;
    }

    const detail = await fetch('/api/cash-sessions/' + data.id);
    if (!detail.ok) throw new Error('Impossible de charger le détail de la caisse');
    setSession(await detail.json());
  }, [storeId]);

  useEffect(() => {
    // The effect intentionally triggers an async state synchronization from an external API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStores()
      .catch(e => setMessage(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [loadStores]);

  useEffect(() => {
    if (!storeId) return;
    // The effect intentionally triggers an async state synchronization from an external API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSession().catch(e => setMessage(e instanceof Error ? e.message : 'Erreur'));
  }, [storeId, loadSession]);

  const openCash = async () => {
    const res = await fetch('/api/cash-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, openingAmount: parseAmount(opening) }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error ?? 'Ouverture impossible');
    setOpening('');
    setMessage('Caisse ouverte.');
    await loadSession();
  };

  const addMovement = async () => {
    if (!session) return;
    const res = await fetch('/api/cash-sessions/' + session.session.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'movement',
        type: movementType,
        amount: parseAmount(movementAmount),
      }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error ?? 'Opération impossible');
    setMovementAmount('');
    setMessage('Mouvement enregistré.');
    await loadSession();
  };

  const countedPreview = counted ? parseAmount(counted) : null;
  const closingDifference = countedPreview !== null && Number.isFinite(countedPreview)
    ? countedPreview - session?.expectedAmount!
    : null;

  const closeCash = async () => {
    if (!session) return;
    const res = await fetch('/api/cash-sessions/' + session.session.id, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', countedAmount: parseAmount(counted) }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error ?? 'Clôture impossible');
    setCounted('');
    setMessage('Caisse clôturée.');
    setSession(data);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <p className="text-muted">Chargement de la caisse...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted flex">
      <Sidebar
        compact={isSidebarCompact}
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-surface border-b border-border px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Logo size={40} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Finance</p>
                <h1 className="mt-1 text-2xl font-bold text-foreground">Caisse</h1>
                <p className="mt-1 text-sm text-muted">
                  Ouvrez, suivez et clôturez votre caisse avec une vision claire du montant attendu.
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {message && (
              <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-foreground">
                <span>{message}</span>
                <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setMessage('')}>Fermer</button>
              </div>
            )}

            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Point de vente</p>
                  <p className="mt-1 text-xs text-muted">Sélectionnez le magasin dont vous gérez la caisse.</p>
                </div>
                <select
                  className="h-10 w-full sm:w-72 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                  value={storeId}
                  onChange={e => setStoreId(e.target.value)}
                >
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.code})
                    </option>
                  ))}
                </select>
              </div>
            </Card>

            {!session ? (
              <Card className="p-8">
                <div className="max-w-xl">
                  <Badge variant="warning">Caisse fermée</Badge>
                  <h2 className="mt-4 text-xl font-bold text-foreground">Ouvrir la caisse</h2>
                  <p className="mt-1 text-sm text-muted">
                    Saisissez le fond de caisse présent au démarrage. Il servira de base au rapprochement de fin de journée.
                  </p>

                  <div className="mt-6 space-y-2">
                    <label htmlFor="opening-amount" className="block text-sm font-medium text-foreground">
                      Fond de caisse (HTG)
                    </label>
                    <Input
                      id="opening-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={opening}
                      onChange={e => setOpening(e.target.value)}
                    />
                  </div>

                  <Button className="mt-5" disabled={!opening} onClick={openCash}>
                    Ouvrir la caisse
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Situation de caisse</h2>
                    <p className="text-sm text-muted">Les montants sont calculés à partir des opérations enregistrées.</p>
                  </div>
                  <Badge variant={session.session.status === 'OPEN' ? 'success' : 'neutral'}>
                    {session.session.status === 'OPEN' ? 'Caisse ouverte' : 'Caisse clôturée'}
                  </Badge>
                </div>

                <Card className="overflow-hidden border-primary/20">
                  <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Disponible théorique</p>
                      <p className="mt-2 text-4xl font-bold tracking-tight text-foreground">{formatAmount(session.expectedAmount)} <span className="text-lg font-semibold text-muted">HTG</span></p>
                      <p className="mt-2 text-sm text-muted">Montant attendu en espèces à cet instant, après les ventes, entrées, sorties et remboursements.</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] bg-primary-soft px-4 py-3 text-left sm:min-w-44">
                      <p className="text-xs font-medium text-muted">Fond initial</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{formatAmount(session.openingAmount)} HTG</p>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  {[
                    ['Ventes espèces', session.cashSales, 'text-success'],
                    ['Entrées', session.cashIn, 'text-success'],
                    ['Sorties', session.cashOut, 'text-warning'],
                    ['Remboursements', session.refunds, 'text-danger'],
                  ].map(([label, value, tone]) => (
                    <Card key={label} className="p-5">
                      <p className="text-sm text-muted">{label}</p>
                      <p className={`mt-2 text-xl font-bold ${tone}`}>{formatAmount(value)} <span className="text-xs font-medium">HTG</span></p>
                    </Card>
                  ))}
                  <Card className="p-5 bg-surface-muted">
                    <p className="text-sm text-muted">Fond initial</p>
                    <p className="mt-2 text-xl font-bold text-foreground">{formatAmount(session.openingAmount)} <span className="text-xs font-medium">HTG</span></p>
                  </Card>
                </div>

                {session.session.status === 'OPEN' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card className="p-6">
                      <Badge variant="info">Opération manuelle</Badge>
                      <h2 className="mt-3 text-lg font-semibold text-foreground">Mouvement de caisse</h2>
                      <p className="mt-1 text-sm text-muted">
                        Enregistrez une entrée ou une sortie qui ne provient pas directement d'une vente.
                      </p>

                      <div className="mt-5 space-y-4">
                        <div>
                          <label htmlFor="movement-type" className="block text-sm font-medium text-foreground mb-1">
                            Type de mouvement
                          </label>
                          <select
                            id="movement-type"
                            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                            value={movementType}
                            onChange={e => setMovementType(e.target.value as 'CASH_IN' | 'CASH_OUT')}
                          >
                            <option value="CASH_IN">Entrée de caisse</option>
                            <option value="CASH_OUT">Sortie de caisse</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="movement-amount" className="block text-sm font-medium text-foreground mb-1">
                            Montant (HTG)
                          </label>
                          <Input
                            id="movement-amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="0.00"
                            value={movementAmount}
                            onChange={e => setMovementAmount(e.target.value)}
                          />
                        </div>

                        <Button disabled={!isPositiveAmount(movementAmount)} onClick={addMovement}>
                          {movementType === 'CASH_IN' ? 'Enregistrer l’entrée' : 'Enregistrer la sortie'}
                        </Button>
                      </div>
                    </Card>

                    <Card className="p-6">
                      <Badge variant="warning">Fin de session</Badge>
                      <h2 className="mt-3 text-lg font-semibold text-foreground">Clôturer la caisse</h2>
                      <p className="mt-1 text-sm text-muted">
                        Comptez physiquement l'espèce présente, puis comparez-la au montant théorique.
                      </p>

                      <div className="mt-5 rounded-[var(--radius-md)] bg-surface-muted p-4">
                        <p className="text-sm text-muted">Montant théorique</p>
                        <p className="mt-1 text-2xl font-bold text-primary">{formatAmount(session.expectedAmount)} HTG</p>
                      </div>

                      <div className="mt-4">
                        <label htmlFor="counted-amount" className="block text-sm font-medium text-foreground mb-1">
                          Montant compté (HTG)
                        </label>
                        <Input
                          id="counted-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={counted}
                          onChange={e => setCounted(e.target.value)}
                        />
                      </div>

                      {closingDifference !== null && Number.isFinite(closingDifference) && (
                        <div className={`mt-4 rounded-[var(--radius-md)] border px-4 py-3 ${closingDifference === 0 ? 'border-success/20 bg-success-soft' : 'border-warning/20 bg-warning-soft'}`}>
                          <p className="text-xs font-medium text-muted">Écart estimé</p>
                          <p className={`mt-1 text-lg font-bold ${closingDifference === 0 ? 'text-success' : 'text-warning'}`}>{formatAmount(closingDifference)} HTG</p>
                          <p className="mt-1 text-xs text-muted">Vérifiez le montant compté avant de confirmer la clôture.</p>
                        </div>
                      )}

                      <Button className="mt-4" disabled={!isPositiveAmount(counted)} onClick={closeCash}>
                        Clôturer la caisse
                      </Button>
                    </Card>
                  </div>
                )}

                {session.session.status === 'CLOSED' && (
                  <Card className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <Badge variant={Number(session.difference ?? 0) === 0 ? 'success' : 'warning'}>
                          {Number(session.difference ?? 0) === 0 ? 'Caisse équilibrée' : 'Écart constaté'}
                        </Badge>
                        <h2 className="mt-3 text-lg font-semibold text-foreground">Rapprochement de clôture</h2>
                        <p className="mt-1 text-sm text-muted">Résultat enregistré lors de la fermeture de la caisse.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-muted">Écart</p>
                        <p className={`mt-1 text-2xl font-bold ${Number(session.difference ?? 0) === 0 ? 'text-success' : 'text-warning'}`}>
                          {formatAmount(session.difference)} HTG
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-[var(--radius-md)] bg-surface-muted p-4">
                        <p className="text-sm text-muted">Montant compté</p>
                        <p className="mt-1 text-xl font-semibold text-foreground">{formatAmount(session.countedAmount)} HTG</p>
                      </div>
                      <div className="rounded-[var(--radius-md)] bg-surface-muted p-4">
                        <p className="text-sm text-muted">Montant théorique</p>
                        <p className="mt-1 text-xl font-semibold text-foreground">{formatAmount(session.expectedAmount)} HTG</p>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
