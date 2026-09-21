'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface Store {
  id: string;
  name: string;
  code: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  cost?: number;
  barcode?: string;
  attributes?: any;
  isActive: boolean;
  product: {
    id: string;
    name: string;
  };
}

interface ProformaItemDraft {
  variantId: string;
  quantity: number;
  variant: ProductVariant;
}

export default function NewProformaPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
  });
  const [formData, setFormData] = useState({
    storeId: '',
    customerId: undefined as string | undefined,
    validUntil: '',
    notes: '',
  });
  const [items, setItems] = useState<ProformaItemDraft[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchStores = async () => {
    try {
      const response = await fetch('/api/stores');
      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const fetchVariants = async () => {
    try {
      const response = await fetch('/api/products');
      if (response.ok) {
        const data = await response.json();
        const products = data.products || [];
        
        // Fetch variants for each product
        const allVariants: ProductVariant[] = [];
        for (const product of products) {
          const variantResponse = await fetch(`/api/products/${product.id}/variants`);
          if (variantResponse.ok) {
            const variantData = await variantResponse.json();
            const productVariants = (variantData.variants || [])
              .filter((v: any) => v.isActive !== false)
              .map((v: any) => ({
                id: v.id,
                sku: v.sku,
                price: v.price,
                cost: v.cost,
                barcode: v.barcode,
                attributes: v.attributes,
                isActive: v.isActive,
                product: { id: product.id, name: product.name },
              }));
            allVariants.push(...productVariants);
          }
        }
        setVariants(allVariants);
      }
    } catch (err) {
      console.error('Error fetching variants:', err);
    }
  };

  useEffect(() => {
    if (user) {
      setLoadingData(true);
      Promise.all([fetchStores(), fetchCustomers(), fetchVariants()]).finally(() => {
        setLoadingData(false);
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        items: items.map(item => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      };

      const response = await fetch('/api/proformas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/proformas/${data.id}`);
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour créer une proforma.');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la création de la proforma.');
      }
    } catch (err) {
      console.error('Error creating proforma:', err);
      alert('Erreur lors de la création de la proforma.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newCustomer),
      });

      if (response.ok) {
        const data = await response.json();
        setCustomers([...customers, data]);
        setFormData({ ...formData, customerId: data.id });
        setNewCustomer({ name: '', email: '', phone: '', address: '', city: '' });
        setShowNewCustomerForm(false);
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour créer un client.');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la création du client.');
      }
    } catch (err) {
      console.error('Error creating customer:', err);
      alert('Erreur lors de la création du client.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    if (!selectedVariantId || itemQuantity <= 0) {
      alert('Veuillez sélectionner un article et une quantité valide.');
      return;
    }

    const variant = variants.find(v => v.id === selectedVariantId);
    if (!variant) {
      alert('Article introuvable.');
      return;
    }

    // Check if variant already exists in items
    const existingItemIndex = items.findIndex(item => item.variantId === selectedVariantId);
    if (existingItemIndex >= 0) {
      // Update quantity
      const updatedItems = [...items];
      updatedItems[existingItemIndex] = {
        ...updatedItems[existingItemIndex],
        quantity: updatedItems[existingItemIndex].quantity + itemQuantity,
      };
      setItems(updatedItems);
    } else {
      // Add new item
      setItems([...items, {
        variantId: selectedVariantId,
        quantity: itemQuantity,
        variant,
      }]);
    }

    setSelectedVariantId('');
    setItemQuantity(1);
  };

  const handleRemoveItem = (variantId: string) => {
    setItems(items.filter(item => item.variantId !== variantId));
  };

  const { subtotal, tax, total } = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.variant.price) * item.quantity), 0);
    const tax = subtotal * 0.1; // TODO: Use organization tax rate
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }, [items]);

  if (authLoading || loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return null;
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
              <Button variant="outline" onClick={() => router.push('/proformas')}>
                ← Retour
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Nouvelle proforma</h1>
                <p className="text-sm text-gray-500">Créer une nouvelle proforma</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Card className="max-w-2xl mx-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Magasin
                </label>
                <select
                  required
                  value={formData.storeId}
                  onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner un magasin</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} ({store.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.customerId || ''}
                    onChange={(e) => setFormData({ ...formData, customerId: e.target.value || undefined })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sélectionner un client (optionnel)</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowNewCustomerForm(!showNewCustomerForm)}
                  >
                    + Nouveau
                  </Button>
                </div>
              </div>

              {showNewCustomerForm && (
                <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Nouveau client</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Nom *
                      </label>
                      <input
                        type="text"
                        required
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Téléphone
                      </label>
                      <input
                        type="tel"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Adresse
                      </label>
                      <input
                        type="text"
                        value={newCustomer.address}
                        onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Ville
                      </label>
                      <input
                        type="text"
                        value={newCustomer.city}
                        onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNewCustomerForm(false)}
                        disabled={loading}
                      >
                        Annuler
                      </Button>
                      <Button type="button" size="sm" disabled={loading} onClick={handleCreateCustomer}>
                        {loading ? 'Création...' : 'Créer'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Articles
                </label>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select
                      value={selectedVariantId}
                      onChange={(e) => setSelectedVariantId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sélectionner un article</option>
                      {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.product.name} - {variant.sku} - {Number(variant.price).toFixed(2)} HTG
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddItem}
                      disabled={loading}
                    >
                      Ajouter
                    </Button>
                  </div>

                  {items.length > 0 && (
                    <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Articles ajoutés</h3>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div key={item.variantId} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                            <div>
                              <div className="font-medium text-sm">{item.variant.product.name}</div>
                              <div className="text-xs text-gray-500">{item.variant.sku}</div>
                              <div className="text-xs text-gray-500">{item.quantity} × {Number(item.variant.price).toFixed(2)} HTG</div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveItem(item.variantId)}
                              disabled={loading}
                            >
                              Supprimer
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Sous-total:</span>
                          <span>{subtotal.toFixed(2)} HTG</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Taxe:</span>
                          <span>{tax.toFixed(2)} HTG</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span>Total:</span>
                          <span>{total.toFixed(2)} HTG</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Valide jusqu'au
                </label>
                <input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Notes ou conditions particulières..."
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/proformas')}
                  disabled={loading}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Création...' : 'Créer la proforma'}
                </Button>
              </div>
            </form>
          </Card>
        </main>
      </div>
    </div>
  );
}
