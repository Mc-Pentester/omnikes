'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

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
  supplier: { id: string; code: string; name: string };
  store: { id: string; name: string };
  items: Array<{
    id: string;
    orderedQuantity: number;
    receivedQuantity: number;
    unitCost: number | string;
    totalCost: number | string;
    variant: { sku: string; product: { name: string } };
  }>;
};

const money = (value: number | string) => Number(value || 0).toFixed(2) + ' HTG';

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
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !params.id) return;
    let active = true;
    fetch('/api/purchases/' + encodeURIComponent(params.id))
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Impossible de charger la commande');
        if (active) setPurchase(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Impossible de charger la commande');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user, params.id]);

  if (authLoading || !user) {
    return authLoading ? <div className="min-h-screen flex items-center justify-center">Chargement...</div> : null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar compact={compact} onToggleCompact={() => setCompact(!compact)} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo size={40} />
            <div>
              <h1 className="text-2xl font-bold">Détail de l&apos;achat</h1>
              <p className="text-sm text-gray-500">{purchase?.reference || 'Commande fournisseur'}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => router.push('/purchases')}>Retour aux achats</Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && <Card className="p-12 text-center">Chargement...</Card>}
          {error && <Card className="p-4 text-red-600">{error}</Card>}
          {purchase && (
            <>
              <Card className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div><div className="text-xs text-gray-500 uppercase">Fournisseur</div><div className="font-semibold">{purchase.supplier.name}</div><div className="text-xs text-gray-500">{purchase.supplier.code}</div></div>
                <div><div className="text-xs text-gray-500 uppercase">Magasin</div><div className="font-semibold">{purchase.store.name}</div></div>
                <div><div className="text-xs text-gray-500 uppercase">Statut</div><div className="font-semibold">{labels[purchase.status] || purchase.status}</div></div>
                <div><div className="text-xs text-gray-500 uppercase">Total</div><div className="text-xl font-bold">{money(purchase.total)}</div></div>
              </Card>
              <Card className="overflow-hidden">
                <div className="p-5 border-b"><h2 className="font-semibold">Articles</h2></div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b"><tr>{['Article','SKU','Commandé','Reçu','Coût unitaire','Total'].map((h) => <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
                    <tbody className="divide-y">
                      {purchase.items.map((item) => <tr key={item.id}>
                        <td className="px-5 py-4 font-medium">{item.variant.product.name}</td>
                        <td className="px-5 py-4 text-sm">{item.variant.sku}</td>
                        <td className="px-5 py-4 text-sm">{item.orderedQuantity}</td>
                        <td className="px-5 py-4 text-sm">{item.receivedQuantity}</td>
                        <td className="px-5 py-4 text-sm">{money(item.unitCost)}</td>
                        <td className="px-5 py-4 text-sm font-semibold">{money(item.totalCost)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card className="p-5 space-y-2">
                <div className="flex justify-between"><span>Sous-total</span><strong>{money(purchase.subtotal)}</strong></div>
                <div className="flex justify-between"><span>Taxe</span><span>{money(purchase.tax)}</span></div>
                <div className="flex justify-between"><span>Remise</span><span>{money(purchase.discount)}</span></div>
                <div className="border-t pt-2 flex justify-between text-lg"><span>Total</span><strong>{money(purchase.total)}</strong></div>
                {purchase.notes && <div className="pt-3 text-sm text-gray-600">Note : {purchase.notes}</div>}
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
