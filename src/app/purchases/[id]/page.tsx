'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { Logo } from '@omnikes/components/branding/Logo';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';

type PurchaseItem = {
id: string;
orderedQuantity: number;
receivedQuantity: number;
unitCost: number | string;
totalCost: number | string;
variant: {
sku: string;
product: {
name: string;
};
};
};

type Purchase = {
id: string;
reference: string;
status: string;
subtotal: number | string;
tax: number | string;
discount: number | string;
total: number | string;
notes?: string | null;
orderedAt?: string | null;
receivedAt?: string | null;
createdAt: string;
supplier: {
id: string;
code: string;
name: string;
};
store: {
id: string;
name: string;
};
items: PurchaseItem[];
};

type PurchaseAction = 'order' | 'cancel';

const money = (value: number | string) =>
  `${Number(value || 0).toFixed(2)} HTG`;

const labels: Record<string, string> = {
DRAFT: 'Brouillon',
ORDERED: 'Commandée',
PARTIALLY_RECEIVED: 'Partiellement reçue',
RECEIVED: 'Reçue',
CANCELLED: 'Annulée',
};

export default function PurchaseDetailPage() {
const router = useRouter();
const params = useParams<{ id: string }>();
const { user, loading: authLoading } = useAuth();

const purchaseId = params.id;

const [purchase, setPurchase] = useState<Purchase | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const [compact, setCompact] = useState(false);
const [saving, setSaving] = useState(false);
const [actionError, setActionError] = useState<string | null>(null);

const [showReceive, setShowReceive] = useState(false);
const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

useEffect(() => {
if (!authLoading && !user) {
router.push('/login');
}
}, [authLoading, user, router]);

const load = useCallback(async () => {
if (!purchaseId) {
return;
}

setLoading(true);
setError(null);

try {
  const response = await fetch(
    `/api/purchases/${encodeURIComponent(purchaseId)}`,
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || 'Impossible de charger la commande',
    );
  }

  setPurchase(data);
} catch (e) {
  setError(
    e instanceof Error
      ? e.message
      : 'Impossible de charger la commande',
  );
} finally {
  setLoading(false);
}

}, [purchaseId]);

useEffect(() => {
if (!user || !purchaseId) {
return;
}

const timer = window.setTimeout(() => {
  void load();
}, 0);

return () => window.clearTimeout(timer);
}, [user, purchaseId, load]);

const action = useCallback(
async (name: PurchaseAction) => {
if (!purchase) {
return;
}

  setActionError(null);
  setSaving(true);

  try {
    const response = await fetch(
      `/api/purchases/${encodeURIComponent(purchase.id)}/${name}`,
      {
        method: 'POST',
      },
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Action impossible');
    }

    await load();
  } catch (e) {
    setActionError(
      e instanceof Error ? e.message : 'Action impossible',
    );
  } finally {
    setSaving(false);
  }
},
[purchase, load],

);

const openReceive = useCallback(() => {
if (!purchase) {
return;
}

setActionError(null);

const quantities = Object.fromEntries(
  purchase.items.map((item) => [
    item.id,
    String(item.orderedQuantity - item.receivedQuantity),
  ]),
);

setReceiveQty(quantities);
setShowReceive(true);

}, [purchase]);

const updateReceiveQty = useCallback(
(itemId: string, value: string) => {
setReceiveQty((current) => ({
...current,
[itemId]: value,
}));
},
[],
);

const receive = useCallback(async () => {
if (!purchase) {
return;
}

setActionError(null);

const items = purchase.items
  .map((item) => ({
    purchaseItemId: item.id,
    quantity: Number(receiveQty[item.id] || 0),
  }))
  .filter((item) => item.quantity > 0);

if (!items.length) {
  setActionError('Indiquez au moins une quantité à recevoir.');
  return;
}

setSaving(true);

try {
  const response = await fetch(
    `/api/purchases/${encodeURIComponent(purchase.id)}/receive`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Réception impossible');
  }

  setShowReceive(false);
  await load();
} catch (e) {
  setActionError(
    e instanceof Error ? e.message : 'Réception impossible',
  );
} finally {
  setSaving(false);
}

}, [purchase, receiveQty, load]);

if (authLoading || !user) {
if (authLoading) {
return (
<div className="min-h-screen flex items-center justify-center">
Chargement...
</div>
);
}

return null;

}

return (
<div className="min-h-screen bg-background flex">
<Sidebar
compact={compact}
onToggleCompact={() => setCompact((current) => !current)}
/>

  <div className="flex-1 flex flex-col h-screen overflow-hidden">
    <header className="bg-surface border-b px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Logo size={40} />

        <div>
          <h1 className="text-2xl font-bold">
            Détail de l&apos;achat
          </h1>

          <p className="text-sm text-muted">
            {purchase?.reference || 'Commande fournisseur'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {purchase?.status === 'DRAFT' && (
          <>
            <Button
              variant="outline"
              onClick={() => void action('order')}
              disabled={saving}
            >
              Commander
            </Button>

            <Button
              variant="outline"
              onClick={() => void action('cancel')}
              disabled={saving}
            >
              Annuler
            </Button>
          </>
        )}

        {(purchase?.status === 'ORDERED' ||
          purchase?.status === 'PARTIALLY_RECEIVED') && (
          <Button onClick={openReceive} disabled={saving}>
            Réceptionner
          </Button>
        )}

        <Button
          variant="outline"
          onClick={() => router.push('/purchases')}
        >
          Retour aux achats
        </Button>
      </div>
    </header>

    <main className="flex-1 overflow-y-auto p-6 space-y-4">
      {loading && (
        <Card className="p-12 text-center">
          Chargement...
        </Card>
      )}

      {error && (
        <Card className="p-4 text-danger">
          {error}

          <Button
            className="ml-3"
            variant="outline"
            onClick={() => void load()}
          >
            Réessayer
          </Button>
        </Card>
      )}

      {actionError && (
        <Card className="p-4 text-danger">
          {actionError}
        </Card>
      )}

      {purchase && (
        <>
          <Card className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted uppercase">
                Fournisseur
              </div>
              <div className="font-semibold">
                {purchase.supplier.name}
              </div>
              <div className="text-xs text-muted">
                {purchase.supplier.code}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase">
                Magasin
              </div>
              <div className="font-semibold">
                {purchase.store.name}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase">
                Statut
              </div>
              <div className="font-semibold">
                {labels[purchase.status] || purchase.status}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted uppercase">
                Total
              </div>
              <div className="text-xl font-bold">
                {money(purchase.total)}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="p-5 border-b">
              <h2 className="font-semibold">Articles</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background border-b">
                  <tr>
                    {[
                      'Article',
                      'SKU',
                      'Commandé',
                      'Reçu',
                      'Coût unitaire',
                      'Total',
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-5 py-3 text-left text-xs font-medium text-muted uppercase"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {purchase.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4 font-medium">
                        {item.variant.product.name}
                      </td>

                      <td className="px-5 py-4 text-sm">
                        {item.variant.sku}
                      </td>

                      <td className="px-5 py-4 text-sm">
                        {item.orderedQuantity}
                      </td>

                      <td className="px-5 py-4 text-sm">
                        {item.receivedQuantity}
                      </td>

                      <td className="px-5 py-4 text-sm">
                        {money(item.unitCost)}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold">
                        {money(item.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5 space-y-2">
            <div className="flex justify-between">
              <span>Sous-total</span>
              <strong>{money(purchase.subtotal)}</strong>
            </div>

            <div className="flex justify-between">
              <span>Taxe</span>
              <span>{money(purchase.tax)}</span>
            </div>

            <div className="flex justify-between">
              <span>Remise</span>
              <span>{money(purchase.discount)}</span>
            </div>

            <div className="border-t pt-2 flex justify-between text-lg">
              <span>Total</span>
              <strong>{money(purchase.total)}</strong>
            </div>

            {purchase.notes && (
              <div className="pt-3 text-sm text-muted">
                Note : {purchase.notes}
              </div>
            )}
          </Card>
        </>
      )}
    </main>
  </div>

  <Modal
    isOpen={showReceive}
    onClose={() => setShowReceive(false)}
    title={
      purchase
        ? `Réception — ${purchase.reference}`
        : 'Réception'
    }
  >
    <div className="space-y-4">
      {actionError && (
        <div className="p-3 bg-danger-soft text-danger rounded text-sm">
          {actionError}
        </div>
      )}

      {purchase?.items.map((item) => {
        const remaining =
          item.orderedQuantity - item.receivedQuantity;

        return (
          <div
            key={item.id}
            className="grid grid-cols-3 gap-3 items-center"
          >
            <div className="col-span-2">
              <div className="font-medium">
                {item.variant.product.name}
              </div>

              <div className="text-xs text-muted">
                {item.variant.sku} — restant {remaining}
              </div>
            </div>

            <Input
              type="number"
              min="0"
              max={remaining}
              value={receiveQty[item.id] || '0'}
              onChange={(event) =>
                updateReceiveQty(item.id, event.target.value)
              }
            />
          </div>
        );
      })}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setShowReceive(false)}
        >
          Annuler
        </Button>

        <Button
          onClick={() => void receive()}
          disabled={saving}
        >
          {saving ? 'Réception...' : 'Valider la réception'}
        </Button>
      </div>
    </div>
  </Modal>
</div>

);
}