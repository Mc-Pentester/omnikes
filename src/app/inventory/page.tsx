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

interface MovementFormData {
  type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT';
  quantity: string;
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
  const [formData, setFormData] = useState<MovementFormData>({
    type: 'PURCHASE',
    quantity: '',
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

  const handleAddMovement = (inventoryItem: Inventory) => {
    setSelectedInventory(inventoryItem);
    setFormData({
      type: 'PURCHASE',
      quantity: '',
      notes: '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    // Basic validation
    if (!formData.quantity || isNaN(parseInt(formData.quantity))) {
      setFormError('La quantité doit être un nombre valide.');
      setIsSubmitting(false);
      return;
    }

    if (parseInt(formData.quantity) <= 0) {
      setFormError('La quantité doit être positive.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`/api/inventory/${selectedInventory?.id}/movements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: formData.type,
          quantity: parseInt(formData.quantity),
          notes: formData.notes,
        }),
      });

      if (response.status === 401) {
        setFormError('Authentication required');
        setIsSubmitting(false);
        return;
      }

      if (response.status === 404) {
        setFormError('Inventory not found or access denied');
        setIsSubmitting(false);
        return;
      }

      if (response.status === 409) {
        setFormError('Insufficient stock for this operation');
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setFormError(data.error || 'Erreur lors de l\'enregistrement du mouvement');
        setIsSubmitting(false);
        return;
      }

      setShowModal(false);
      await fetchInventory();
    } catch (err) {
      console.error('Error creating movement:', err);
      setFormError('Erreur lors de l\'enregistrement du mouvement');
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddMovement(item)}
                          >
                            Ajuster
                          </Button>
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
        title={`Ajuster le stock - ${selectedInventory?.variant.product.name}`}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              form="movement-form"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {formError}
          </div>
        )}

        <form id="movement-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Type de mouvement
            </label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'PURCHASE' | 'SALE' | 'ADJUSTMENT' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="PURCHASE">Entrée</option>
              <option value="SALE">Sortie</option>
              <option value="ADJUSTMENT">Ajustement</option>
            </select>
          </div>

          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
              Quantité *
            </label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="10"
              required
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes du mouvement"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
