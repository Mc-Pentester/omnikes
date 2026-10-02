'use client';

import { useState, useEffect } from 'react';
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

type InventoryWorkflow = 'receive' | 'adjust';

interface InventoryFormData {
  quantity: string;
  reason: string;
  referenceId: string;
  notes: string;
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
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/inventory');
      
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

  useEffect(() => {
    if (user) {
      fetchInventory();
    }
  }, [user]);

  const handleOpenWorkflow = (inventoryItem: Inventory, nextWorkflow: InventoryWorkflow) => {
    setSelectedInventory(inventoryItem);
    setWorkflow(nextWorkflow);
    setFormData({
      quantity: nextWorkflow === 'adjust' ? String(inventoryItem.quantity) : '',
      reason: '',
      referenceId: '',
      notes: '',
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

    try {
      const endpoint = workflow === 'receive'
        ? `/api/inventory/${selectedInventory?.id}/receive`
        : `/api/inventory/${selectedInventory?.id}/adjust`;

      const body = workflow === 'receive'
        ? {
            quantity,
            referenceId: formData.referenceId || undefined,
            notes: formData.notes || undefined,
          }
        : {
            newQuantity: quantity,
            reason: formData.reason,
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
        <p className="text-gray-600">Chargement de l'inventaire...</p>
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        compact={isSidebarCompact} 
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)} 
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo size={40} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Inventaire</h1>
                <p className="text-sm text-gray-500">Gérez le stock de vos magasins.</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {inventory.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Aucun inventaire</h2>
              <p className="text-gray-600 mb-4">L'inventaire est créé automatiquement lorsque vous ajoutez du stock.</p>
              <p className="text-sm text-gray-500 mb-6">Prérequis: Créez d'abord un magasin et un produit avec une variante.</p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => router.push('/stores')}>Gérer les magasins</Button>
                <Button onClick={() => router.push('/products')}>Gérer les produits</Button>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produit</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Magasin</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {inventory.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.variant.product.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.store.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.quantity}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenWorkflow(item, 'receive')}
                            >
                              Recevoir
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenWorkflow(item, 'adjust')}
                            >
                              Ajuster
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={workflow === 'receive'
          ? `Recevoir du stock — ${selectedInventory?.variant.product.name}`
          : `Ajustement d'inventaire — ${selectedInventory?.variant.product.name}`}
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
              {workflow === 'receive' ? 'Quantité reçue *' : 'Nouvelle quantité en stock *'}
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
                Raison de l'ajustement *
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

          <div>
            <label htmlFor="inventory-reference" className="block text-sm font-medium text-gray-700 mb-1">
              {workflow === 'receive' ? 'Référence de réception / fournisseur' : 'Référence'}
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
      </Modal>>
    </div>
  );
}
