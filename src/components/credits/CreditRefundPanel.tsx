'use client';

import { useState } from 'react';
import { Button } from '@omnikes/components/ui/button';
import { Input } from '@omnikes/components/ui/input';

type RefundReturn = { id: string; totalRefunded: number; createdAt: string; refundableRemaining: number };
type RefundPayment = { id: string; amount: string | number; refundedAmount: string | number; method: string; reference?: string | null };

export function CreditRefundPanel({
  creditId, currencyCode, returns, payments, onComplete,
}: {
  creditId: string;
  currencyCode: string;
  returns: RefundReturn[];
  payments: RefundPayment[];
  onComplete: () => Promise<void>;
}) {
  const [returnId, setReturnId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const selectedReturn = returns.find((item) => item.id === returnId);
  const selectedPayment = payments.find((item) => item.id === paymentId);
  const paymentRemaining = selectedPayment
    ? Number(selectedPayment.amount) - Number(selectedPayment.refundedAmount || 0)
    : 0;
  const maximum = Math.max(0, Math.min(selectedReturn?.refundableRemaining ?? 0, paymentRemaining));

  const submit = async () => {
    setError('');
    setMessage('');
    const value = Number(amount);
    if (!selectedReturn || !selectedPayment || !Number.isFinite(value) || value <= 0 || value > maximum) {
      setError('Le montant doit être positif et ne pas dépasser le solde remboursable du retour et du paiement.');
      return;
    }
    const key = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(key);
    setSaving(true);
    try {
      const response = await fetch('/api/credits/' + creditId + '/refunds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          returnId, paymentId, amount: value,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer le remboursement.');
      setMessage('Remboursement enregistré : ' + value.toFixed(2) + ' ' + currencyCode);
      setIdempotencyKey(null);
      setAmount('');
      setReference('');
      await onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erreur lors du remboursement.');
    } finally {
      setSaving(false);
    }
  };

  const availableReturns = returns.filter((item) => item.refundableRemaining > 0);
  const availablePayments = payments.filter((item) => Number(item.amount) > Number(item.refundedAmount || 0));
  if (availableReturns.length === 0 || availablePayments.length === 0) return null;

  return (
    <section className="mt-3 border-t border-border pt-3 space-y-3">
      <h4 className="text-sm font-medium">Rembourser un trop-perçu après retour</h4>
      <label className="block space-y-1 text-sm">
        <span>Retour concerné</span>
        <select value={returnId} onChange={(event) => { setReturnId(event.target.value); setIdempotencyKey(null); }} className="h-10 w-full rounded-md border border-border-strong px-3">
          <option value="">Sélectionner un retour</option>
          {availableReturns.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleDateString()} · reste {item.refundableRemaining.toFixed(2)} {currencyCode}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>Encaissement d’origine</span>
        <select value={paymentId} onChange={(event) => { setPaymentId(event.target.value); setIdempotencyKey(null); }} className="h-10 w-full rounded-md border border-border-strong px-3">
          <option value="">Sélectionner un paiement</option>
          {availablePayments.map((item) => <option key={item.id} value={item.id}>{item.method} · {item.reference || item.id} · disponible {(Number(item.amount) - Number(item.refundedAmount || 0)).toFixed(2)}</option>)}
        </select>
      </label>
      <Input type="number" min="0.01" max={maximum || undefined} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); setIdempotencyKey(null); }} placeholder={maximum > 0 ? 'Maximum ' + maximum.toFixed(2) : 'Montant à rembourser'} />
      <Input value={reference} onChange={(event) => { setReference(event.target.value); setIdempotencyKey(null); }} placeholder="Référence du remboursement (facultative)" />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      <Button size="sm" disabled={saving || !returnId || !paymentId || !amount || maximum <= 0} onClick={() => void submit()}>{saving ? 'Enregistrement…' : 'Confirmer le remboursement'}</Button>
    </section>
  );
}
