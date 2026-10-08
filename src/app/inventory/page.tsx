'use client';

import { useState, useEffect, useEffectEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { EmptyState } from '@omnikes/components/ui/empty-state';
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
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <p className="text-muted">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <p className="text-muted">Chargement de l&apos;inventaire...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger mb-4">{error}</p>
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
  const totalAvailable = inventory.reduce((sum, item) => sum + Math.max(0, item.quantity - item.reservedQuantity), 0);
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
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Stock</p>
                <h1 className="mt-1 text-2xl font-bold text-foreground">Gestion des stocks</h1>
                <p className="mt-1 text-sm text-muted">Visualisez, recevez et déplacez votre stock sans perdre le fil des mouvements.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => router.push('/inventory/report')}>
              Rapport d&apos;inventaire
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {inventory.length === 0 ? (
            <EmptyState
              title="Votre stock sera prêt en quelques étapes"
              description="Créez d&apos;abord un magasin et un produit. OmniKès créera ensuite le suivi de stock lorsque vous commencerez à approvisionner vos références."
              actionLabel="Gérer les produits"
              onAction={() => router.push('/products')}
              secondaryActionLabel="Gérer les magasins"
              onSecondaryAction={() => router.push('/stores')}
              icon="store"
              tone="info"
            />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="p-5">
                  <p className="text-sm text-muted">Articles en stock</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">{totalUnits}</p>
                  <p className="text-xs text-muted mt-1">{inventory.length} références suivies</p>
                </Card>
                <Card className="p-5">
                  <p className="text-sm text-muted">Quantités réservées</p>
                  <p className="mt-1 text-3xl font-bold text-warning">{totalReserved}</p>
                  <p className="text-xs text-muted mt-1">Non disponibles à la vente</p>
                </Card>
                <Card className="p-5">
                  <p className="text-sm text-muted">Disponible à la vente</p>
                  <p className="mt-1 text-3xl font-bold text-success">{totalAvailable}</p>
                  <p className="text-xs text-muted mt-1">Stock moins les réservations</p>
                </Card>
                <Card className="p-5">
                  <p className="text-sm text-muted">Ruptures</p>
                  <p className="mt-1 text-3xl font-bold text-danger">{zeroStockCount}</p>
                  <p className="text-xs text-muted mt-1">Références à quantité zéro</p>
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
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option value="">Tous les magasins</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
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
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div>
                    <h2 className="font-semibold text-foreground">Stock par référence</h2>
                    <p className="text-sm text-muted">{filteredInventory.length} résultat(s)</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-muted border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Produit / SKU</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Magasin</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Stock</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Réservé</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Disponible</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                      {filteredInventory.map((item) => {
                        const available = Math.max(0, item.quantity - item.reservedQuantity);
                        return (
                          <tr key={item.id} className="hover:bg-surface-muted">
                            <td className="px-6 py-4">
                              <div className="font-medium text-foreground">{item.variant.product.name}</div>
                              <div className="text-xs text-muted">{item.variant.sku}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-muted">{item.store.name}</td>
                            <td className="px-6 py-4 text-right"><span className={`inline-flex min-w-12 justify-center rounded-full px-2.5 py-1 text-sm font-bold ${item.quantity === 0 ? 'bg-danger-soft text-danger' : item.quantity < 5 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}`}>{item.quantity}</span></td>
                            <td className="px-6 py-4 text-right text-sm text-muted">{item.reservedQuantity}</td>
                            <td className="px-6 py-4 text-right"><span className="font-semibold text-foreground">{available}</span><span className="ml-2 text-xs text-muted">{available === 0 ? 'Indisponible' : 'disponible'}</span></td>
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
                  <div className="p-8">
                    <EmptyState
                      title="Aucun stock ne correspond"
                      description="Modifiez votre recherche ou vos filtres pour afficher d&apos;autres références."
                      actionLabel="Réinitialiser les filtres"
                      onAction={() => { setSearch(''); setStoreFilter(''); setStockFilter('all'); }}
                      icon="search"
                      tone="info"
                    />
                  </div>
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
            <div className="rounded-lg bg-surface-muted p-4 text-sm">
              <div className="font-medium text-foreground">{historyInventory.variant.product.name}</div>
              <div className="text-muted">SKU: {historyInventory.variant.sku} · {historyInventory.store.name}</div>
              <div className="mt-1 text-foreground">Stock actuel : <strong>{historyInventory.quantity}</strong></div>
            </div>
            {historyLoading && <p className="text-sm text-muted">Chargement de l&apos;historique...</p>}
            {historyError && <p className="text-sm text-danger">{historyError}</p>}
            {!historyLoading && !historyError && history.length === 0 && (
              <p className="text-sm text-muted">Aucun mouvement enregistré.</p>
            )}
            {!historyLoading && !historyError && history.length > 0 && (
              <div className="max-h-96 overflow-y-auto divide-y divide-border border border-border rounded-lg">
                {history.map((movement) => (
                  <div key={movement.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{movement.type}</span>
                      <span className={movement.quantity >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                        {movement.quantity >= 0 ? '+' : ''}{movement.quantity}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {new Date(movement.createdAt).toLocaleString('fr-FR')}
                    </div>
                    {movement.referenceId && <div className="mt-1 text-xs text-muted">Référence : {movement.referenceId}</div>}
                    {movement.notes && <div className="mt-1 text-xs text-muted">{movement.notes}</div>}
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
          <div className="mb-4 rounded-lg bg-surface-muted p-4 text-sm">
            <div className="font-medium text-foreground">{selectedInventory.variant.product.name}</div>
            <div className="text-muted">SKU: {selectedInventory.variant.sku} · Magasin: {selectedInventory.store.name}</div>
            <div className="mt-1 text-foreground">Stock actuel : <strong>{selectedInventory.quantity}</strong></div>
          </div>
        )}

        {formError && (
          <div className="mb-4 p-3 bg-danger-soft border border-danger rounded-lg text-sm text-danger">
            {formError}
          </div>
        )}

        <form id="inventory-workflow-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="inventory-quantity" className="block text-sm font-medium text-foreground mb-1">
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
              <p className="mt-1 text-xs text-muted">
                Le système enregistrera automatiquement la différence entre {selectedInventory.quantity} et la nouvelle quantité.
              </p>
            )}
          </div>

          {workflow === 'adjust' && (
            <div>
              <label htmlFor="inventory-reason" className="block text-sm font-medium text-foreground mb-1">
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
              <label htmlFor="inventory-target" className="block text-sm font-medium text-foreground mb-1">
                Magasin de destination *
              </label>
              <select
                id="inventory-target"
                value={formData.targetInventoryId}
                onChange={(e) => setFormData({ ...formData, targetInventoryId: e.target.value })}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
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
              <p className="mt-1 text-xs text-muted">
                Le transfert déplace le stock de ce magasin vers la référence sélectionnée.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="inventory-reference" className="block text-sm font-medium text-foreground mb-1">
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
            <label htmlFor="inventory-notes" className="block text-sm font-medium text-foreground mb-1">
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
