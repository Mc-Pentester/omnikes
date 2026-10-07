'use client';

import { useCallback, useEffect, useState } from 'react';

type Store = { id: string; name: string; code: string };
type Summary = {
  session: { id: string; status: string; storeId: string; openingAmount: string | number; countedAmount?: string | number | null; difference?: string | number | null };
  openingAmount: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  refunds: number;
  expectedAmount: number;
  countedAmount: number | null;
  difference: number | null;
};

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
    if (!data) setSession(null);
    else {
      const detail = await fetch('/api/cash-sessions/' + data.id);
      if (!detail.ok) throw new Error('Impossible de charger le détail de la caisse');
      setSession(await detail.json());
    }
  };

  useEffect(() => {
    loadStores()
      .catch(e => setMessage(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [loadStores]);

  useEffect(() => {
    if (!storeId) return;
    loadSession().catch(e => setMessage(e instanceof Error ? e.message : 'Erreur'));
  }, [storeId]);

  const openCash = async () => {
    const res = await fetch('/api/cash-sessions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, openingAmount: Number(opening) }),
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'movement', type: movementType, amount: Number(movementAmount) }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error ?? 'Opération impossible');
    setMovementAmount('');
    setMessage('Mouvement enregistré.');
    await loadSession();
  };

  const closeCash = async () => {
    if (!session) return;
    const res = await fetch('/api/cash-sessions/' + session.session.id, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'close', countedAmount: Number(counted) }),
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error ?? 'Clôture impossible');
    setCounted('');
    setMessage('Caisse clôturée.');
    await loadSession();
  };

  if (loading) return <main className="p-6">Chargement…</main>;

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestion de caisse</h1>
        <p className="text-sm text-gray-500">Ouverture, mouvements, rapprochement et clôture.</p>
      </div>

      {message && <div className="rounded border p-3 text-sm">{message}</div>}

      <section className="rounded-lg border p-4 space-y-3">
        <label className="block text-sm font-medium">Magasin</label>
        <select className="w-full border rounded p-2" value={storeId} onChange={e => setStoreId(e.target.value)}>
          {stores.map(store => <option key={store.id} value={store.id}>{store.name} ({store.code})</option>)}
        </select>
      </section>

      {!session ? (
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold">Ouvrir la caisse</h2>
          <input className="w-full border rounded p-2" type="number" min="0" step="0.01" placeholder="Fond de caisse" value={opening} onChange={e => setOpening(e.target.value)} />
          <button className="rounded bg-black text-white px-4 py-2 disabled:opacity-50" disabled={!opening} onClick={openCash}>Ouvrir</button>
        </section>
      ) : (
        <>
          <section className="grid md:grid-cols-4 gap-3">
            {[
              ['Fond initial', session.openingAmount],
              ['Ventes espèces', session.cashSales],
              ['Entrées', session.cashIn],
              ['Sorties', session.cashOut],
              ['Remboursements', session.refunds],
              ['Théorique', session.expectedAmount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-4"><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-semibold">{Number(value).toFixed(2)}</p></div>
            ))}
          </section>

          {session.session.status === 'OPEN' && (
            <div className="grid md:grid-cols-2 gap-4">
              <section className="rounded-lg border p-4 space-y-3">
                <h2 className="font-semibold">Mouvement manuel</h2>
                <select className="w-full border rounded p-2" value={movementType} onChange={e => setMovementType(e.target.value as 'CASH_IN' | 'CASH_OUT')}>
                  <option value="CASH_IN">Entrée de caisse</option>
                  <option value="CASH_OUT">Sortie de caisse</option>
                </select>
                <input className="w-full border rounded p-2" type="number" min="0.01" step="0.01" value={movementAmount} onChange={e => setMovementAmount(e.target.value)} placeholder="Montant" />
                <button className="rounded bg-black text-white px-4 py-2 disabled:opacity-50" disabled={!movementAmount} onClick={addMovement}>Enregistrer</button>
              </section>
              <section className="rounded-lg border p-4 space-y-3">
                <h2 className="font-semibold">Clôturer</h2>
                <p className="text-sm">Montant théorique : <strong>{session.expectedAmount.toFixed(2)}</strong></p>
                <input className="w-full border rounded p-2" type="number" min="0" step="0.01" value={counted} onChange={e => setCounted(e.target.value)} placeholder="Montant compté" />
                <button className="rounded bg-black text-white px-4 py-2 disabled:opacity-50" disabled={!counted} onClick={closeCash}>Clôturer la caisse</button>
              </section>
            </div>
          )}

          {session.session.status === 'CLOSED' && (
            <section className="rounded-lg border p-4">
              <p>Montant compté : <strong>{session.countedAmount?.toFixed(2)}</strong></p>
              <p>Écart : <strong>{session.difference?.toFixed(2)}</strong></p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
