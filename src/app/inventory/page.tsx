'use client';

import { useState, useEffect, useEffectEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface Inventory {
  id: string;
  storeId: string;
  variantId: string;
  quantity: number;
  reservedQuantity: number;
  variant: {
    id: string;
    sku: string;
    price: number;
    product: {
      id: string;
      name: string;
    };
  };
  store: {
    id: string;
    name: string;
  };
}

interface InventoryMovement {
  id: string;
  type: string;
  quantity: number;
  referenceId?: string | null;
  referenceType?: string | null;
  notes?: string | null;
  createdAt: string;
}

type InventoryWorkflow = 'receive' | 'adjust' | 'transfer';

interface InventoryFormData {
  quantity: string;
  reason: string;
  referenceId: string;
  notes: string;
  targetInventoryId: string;
}

export default function InventoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [workflow, setWorkflow] = useState<InventoryWorkflow>('receive');
  const [formData, setFormData] = useState<InventoryFormData>({
    quantity: '',
    reason: '',
    referenceId: '',
    notes: '',
    targetInventoryId: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'reserved' | 'zero'>('all');
  const [historyInventory, setHistoryInventory] = useState<Inventory | null>(null);
  const [history, setHistory] = useState<InventoryMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/inventory?skip=0&take=100');
      
      if (!response.ok) {
        throw new Error('Failed to fetch inventory');
      }
      
      const data = await response.json();
      setInventory(data.inventory || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError('Impossible de charger l\'inventaire');
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryOnAuth = useEffectEvent(() => {
    if (user) void fetchInventory();
  });

  useEffect(() => {
    if (!user) return;

    const timeoutId = window.setTimeout(() => {
      loadInventoryOnAuth();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [user]);

  const handleOpenWorkflow = (inventoryItem: Inventory, nextWorkflow: InventoryWorkflow) => {
    setSelectedInventory(inventoryItem);
    setWorkflow(nextWorkflow);
    setFormData({
      quantity: nextWorkflow === 'adjust' ? String(inventoryItem.quantity) : '',
      reason: '',
      referenceId: '',
      notes: '',
      targetInventoryId: '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    const quantity = Number(formData.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setFormError('La quantité doit être un nombre entier valide.');
      setIsSubmitting(false);
      return;
    }

    if (workflow === 'receive' && quantity <= 0) {
      setFormError('La quantité reçue doit être supérieure à zéro.');
      setIsSubmitting(false);
      return;
    }

    if (workflow === 'adjust' && !formData.reason.trim()) {
      setFormError('La raison de l\'ajustement est obligatoire.');
      setIsSubmitting(false);
      return;
    }

    if (workflow === 'transfer' && !formData.targetInventoryId) {
      setFormError('Le magasin de destination est obligatoire.');
      setIsSubmitting(false);
      return;
    }

    try {
      const endpoint = workflow === 'receive'
        ? `/api/inventory/${selectedInventory?.id}/receive`
        : workflow === 'adjust'
          ? `/api/inventory/${selectedInventory?.id}/adjust`
          : `/api/inventory/${selectedInventory?.id}/transfer`;

      const body = workflow === 'receive'
        ? {
            quantity,
            referenceId: formData.referenceId || undefined,
            notes: formData.notes || undefined,
          }
        : workflow === 'adjust'
          ? {
              newQuantity: quantity,
              reason: formData.reason,
              referenceId: formData.referenceId || undefined,
              notes: formData.notes || undefined,
            }
          : {
              targetInventoryId: formData.targetInventoryId,
              quantity,
              referenceId: formData.referenceId || undefined,
              notes: formData.notes || undefined,
            };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        setFormError('Authentication required');
        return;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(data.error || 'Erreur lors de l\'enregistrement.');
        return;
      }

      setShowModal(false);
      await fetchInventory();
    } catch (err) {
      console.error('Error updating inventory:', err);
      setFormError('Erreur lors de l\'enregistrement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Chargement de l&apos;inventaire...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchInventory}>Réessayer</Button>
        </div>
      </div>
    );
  }

  const stores = Array.from(
    new Map(inventory.map((item) => [item.storeId, item.store])).values()
  );

  const filteredInventory = inventory.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      item.variant.product.name.toLowerCase().includes(q) ||
      item.variant.sku.toLowerCase().includes(q);
    const matchesStore = !storeFilter || item.storeId === storeFilter;
    const available = Math.max(0, item.quantity - item.reservedQuantity);
    const matchesStock =
      stockFilter === 'all' ||
      (stockFilter === 'available' && available > 0) ||
      (stockFilter === 'reserved' && item.reservedQuantity > 0) ||
      (stockFilter === 'zero' && item.quantity === 0);
    return matchesSearch && matchesStore && matchesStock;
  });

  const totalUnits = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const totalReserved = inventory.reduce((sum, item) => sum + item.reservedQuantity, 0);
  const zeroStockCount = inventory.filter((item) => item.quantity === 0).length;

  const openHistory = async (item: Inventory) => {
    setHistoryInventory(item);
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/inventory/${item.id}/movements?skip=0&take=50`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Impossible de charger l’historique');
      setHistory(data.movements || []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Impossible de charger l’historique');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        compact={isSidebarCompact} 
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)} 
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Logo size={40} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Inventaire</h1>
                <p className="text-sm text-gray-500">Gérez le stock de vos magasins.</p>
              </div>
            <Button variant="outline" onClick={() => router.push('/inventory/report')}>
              📊 Rapport d&apos;inventaire
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {inventory.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Aucun inventaire</h2>
              <p className="text-gray-600 mb-4">L&apos;inventaire est créé automatiquement lorsque vous ajoutez du stock.</p>
              <p className="text-sm text-gray-500 mb-6">Prérequis : créez d&apos;abord un magasin et un produit avec une variante.</p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => router.push('/stores')}>Gérer les magasins</Button>
                <Button onClick={() => router.push('/products')}>Gérer les produits</Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-5">
                  <p className="text-sm text-gray-500">Articles en stock</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{totalUnits}</p>
                  <p className="text-xs text-gray-500 mt-1">{inventory.length} références suivies</p>
                </Card>
                <Card className="p-5">
                  <p className="text-sm text-gray-500">Quantités réservées</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{totalReserved}</p>
                  <p className="text-xs text-gray-500 mt-1">Non disponibles à la vente</p>
                </Card>
                <Card className="p-5">
                  <p className="text-sm text-gray-500">Ruptures</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{zeroStockCount}</p>
                  <p className="text-xs text-gray-500 mt-1">Références à quantité zéro</p>
                </Card>
              </div>

              <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher produit ou SKU..."
                  />
                  <select
                    value={storeFilter}
                    onChange={(e) => setStoreFilter(e.target.value)}
                    className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="">Tous les magasins</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
                    className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="all">Tous les stocks</option>
                    <option value="available">Disponible</option>
                    <option value="reserved">Avec réservation</option>
                    <option value="zero">Rupture</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={() => { setSearch(''); setStoreFilter(''); setStockFilter('all'); }}
                  >
                    Réinitialiser
                  </Button>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="font-semibold text-gray-900">Stock par référence</h2>
                    <p className="text-sm text-gray-500">{filteredInventory.length} résultat(s)</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produit / SKU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Magasin</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stock</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Réservé</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Disponible</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredInventory.map((item) => {
                        const available = Math.max(0, item.quantity - item.reservedQuantity);
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{item.variant.product.name}</div>
                              <div className="text-xs text-gray-500">{item.variant.sku}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">{item.store.name}</td>
                            <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">{item.quantity}</td>
                            <td className="px-6 py-4 text-right text-sm text-gray-500">{item.reservedQuantity}</td>
                            <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">{available}</td>
                            <td className="px-6 py-4">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => openHistory(item)}>Historique</Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenWorkflow(item, 'receive')}>Recevoir</Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenWorkflow(item, 'transfer')}>Transférer</Button>
                                <Button variant="outline" size="sm" onClick={() => handleOpenWorkflow(item, 'adjust')}>Ajuster</Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredInventory.length === 0 && (
                  <div className="p-8 text-center text-sm text-gray-500">Aucun stock ne correspond aux filtres.</div>
                )}
              </Card>
            </div>
          )}
        </main>
      </div>

      <Modal
        isOpen={Boolean(historyInventory)}
        onClose={() => setHistoryInventory(null)}
        title={historyInventory ? `Historique — ${historyInventory.variant.product.name}` : 'Historique'}
      >
        {historyInventory && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4 text-sm">
              <div className="font-medium text-gray-900">{historyInventory.variant.product.name}</div>
              <div className="text-gray-500">SKU: {historyInventory.variant.sku} · {historyInventory.store.name}</div>
              <div className="mt-1 text-gray-700">Stock actuel : <strong>{historyInventory.quantity}</strong></div>
            </div>
            {historyLoading && <p className="text-sm text-gray-500">Chargement de l&apos;historique...</p>}
            {historyError && <p className="text-sm text-red-600">{historyError}</p>}
            {!historyLoading && !historyError && history.length === 0 && (
              <p className="text-sm text-gray-500">Aucun mouvement enregistré.</p>
            )}
            {!historyLoading && !historyError && history.length > 0 && (
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-200 border border-gray-200 rounded-lg">
                {history.map((movement) => (
                  <div key={movement.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-gray-900">{movement.type}</span>
                      <span className={movement.quantity >= 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
                        {movement.quantity >= 0 ? '+' : ''}{movement.quantity}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(movement.createdAt).toLocaleString('fr-FR')}
                    </div>
                    {movement.referenceId && <div className="mt-1 text-xs text-gray-600">Référence : {movement.referenceId}</div>}
                    {movement.notes && <div className="mt-1 text-xs text-gray-600">{movement.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={workflow === 'receive'
          ? `Recevoir du stock — ${selectedInventory?.variant.product.name}`
          : workflow === 'adjust'
            ? `Ajustement d'inventaire — ${selectedInventory?.variant.product.name}`
            : `Transférer du stock — ${selectedInventory?.variant.product.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" form="inventory-workflow-form" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement...' : workflow === 'receive' ? 'Enregistrer la réception' : 'Enregistrer l\'ajustement'}
            </Button>
          </>
        }
      >
        {selectedInventory && (
          <div className="mb-4 rounded-lg bg-gray-50 p-4 text-sm">
            <div className="font-medium text-gray-900">{selectedInventory.variant.product.name}</div>
            <div className="text-gray-500">SKU: {selectedInventory.variant.sku} · Magasin: {selectedInventory.store.name}</div>
            <div className="mt-1 text-gray-700">Stock actuel : <strong>{selectedInventory.quantity}</strong></div>
          </div>
        )}

        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {formError}
          </div>
        )}

        <form id="inventory-workflow-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="inventory-quantity" className="block text-sm font-medium text-gray-700 mb-1">
              {workflow === 'receive' ? 'Quantité reçue *' : workflow === 'adjust' ? 'Nouvelle quantité en stock *' : 'Quantité à transférer *'}
            </label>
            <Input
              id="inventory-quantity"
              type="number"
              min={workflow === 'receive' ? 1 : 0}
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              required
            />
            {workflow === 'adjust' && selectedInventory && (
              <p className="mt-1 text-xs text-gray-500">
                Le système enregistrera automatiquement la différence entre {selectedInventory.quantity} et la nouvelle quantité.
              </p>
            )}
          </div>

          {workflow === 'adjust' && (
            <div>
              <label htmlFor="inventory-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Raison de l&apos;ajustement *
              </label>
              <Input
                id="inventory-reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Comptage physique, perte, casse, correction..."
                required
              />
            </div>
          )}

          {workflow === 'transfer' && selectedInventory && (
            <div>
              <label htmlFor="inventory-target" className="block text-sm font-medium text-gray-700 mb-1">
                Magasin de destination *
              </label>
              <select
                id="inventory-target"
                value={formData.targetInventoryId}
                onChange={(e) => setFormData({ ...formData, targetInventoryId: e.target.value })}
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                required
              >
                <option value="">Sélectionner une référence de destination</option>
                {inventory
                  .filter((item) => item.id !== selectedInventory.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.store.name} — {item.variant.product.name} ({item.variant.sku})
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Le transfert déplace le stock de ce magasin vers la référence sélectionnée.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="inventory-reference" className="block text-sm font-medium text-gray-700 mb-1">
              {workflow === 'receive' ? 'Référence de réception / fournisseur' : workflow === 'transfer' ? 'Référence du transfert' : 'Référence'}
            </label>
            <Input
              id="inventory-reference"
              value={formData.referenceId}
              onChange={(e) => setFormData({ ...formData, referenceId: e.target.value })}
              placeholder={workflow === 'receive' ? 'Bon de livraison, facture, fournisseur...' : 'Référence interne...'}
            />
          </div>

          <div>
            <label htmlFor="inventory-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <Input
              id="inventory-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes complémentaires"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
