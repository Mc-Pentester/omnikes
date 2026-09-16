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

interface Product {
  id: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  variants: ProductVariant[];
}

interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  stock: number;
}

interface ProductFormData {
  name: string;
  description: string;
  category: string;
  sku: string;
  price: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    category: '',
    sku: '',
    price: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/products?isActive=true');
      
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }
      
      const data = await response.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Impossible de charger les produits');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProducts();
    }
  }, [user]);

  const handleCreate = () => {
    setModalMode('create');
    setFormData({
      name: '',
      description: '',
      category: '',
      sku: '',
      price: '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleEdit = (product: Product) => {
    setModalMode('edit');
    setSelectedProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      category: product.category || '',
      sku: product.variants[0]?.sku || '',
      price: product.variants[0]?.price?.toString() || '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Voulez-vous vraiment SUPPRIMER définitivement ce produit ? Cette action est irréversible et supprimera toutes les données associées.')) {
      return;
    }

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchProducts();
      } else {
        alert('Erreur lors de la suppression du produit.');
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('Erreur lors de la suppression du produit.');
    }
  };

  const handleDeactivate = async (productId: string) => {
    if (!confirm('Voulez-vous vraiment désactiver ce produit ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/products/${productId}/deactivate`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProducts();
      } else {
        alert('Erreur lors de la désactivation du produit.');
      }
    } catch (err) {
      console.error('Error deactivating product:', err);
      alert('Erreur lors de la désactivation du produit.');
    }
  };

  const handleActivate = async (productId: string) => {
    try {
      const response = await fetch(`/api/products/${productId}/activate`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProducts();
      } else {
        alert('Erreur lors de l\'activation du produit.');
      }
    } catch (err) {
      console.error('Error activating product:', err);
      alert('Erreur lors de l\'activation du produit.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    // Basic validation
    if (!formData.name.trim()) {
      setFormError('Le nom du produit est obligatoire.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.sku.trim()) {
      setFormError('Le SKU est obligatoire.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.price || isNaN(parseFloat(formData.price))) {
      setFormError('Le prix doit être un nombre valide.');
      setIsSubmitting(false);
      return;
    }

    try {
      const url = modalMode === 'create' 
        ? '/api/products'
        : `/api/products/${selectedProduct?.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PATCH';

      const payload = modalMode === 'create'
        ? {
            name: formData.name,
            description: formData.description,
            category: formData.category,
            variants: [
              {
                sku: formData.sku,
                price: parseFloat(formData.price),
              }
            ]
          }
        : {
            name: formData.name,
            description: formData.description,
            category: formData.category,
          };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        setFormError('Ce SKU existe déjà.');
        setIsSubmitting(false);
        return;
      }

      if (response.status === 403) {
        setFormError('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        setFormError('Erreur lors de l\'enregistrement du produit.');
        setIsSubmitting(false);
        return;
      }

      setShowModal(false);
      await fetchProducts();
    } catch (err) {
      console.error('Error saving product:', err);
      setFormError('Erreur lors de l\'enregistrement du produit.');
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
        <p className="text-gray-600">Chargement des produits...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchProducts}>Réessayer</Button>
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
                <h1 className="text-2xl font-bold text-gray-900">Produits</h1>
                <p className="text-sm text-gray-500">Gérez les produits de votre organisation.</p>
              </div>
            </div>
            <Button onClick={handleCreate}>+ Nouveau produit</Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {products.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Aucun produit</h2>
              <p className="text-gray-600 mb-6">Aucun produit n'est encore configuré pour votre organisation.</p>
              <Button onClick={handleCreate}>+ Créer un produit</Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.category || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.variants[0]?.sku || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.variants[0]?.price ? `${parseFloat(String(product.variants[0].price)).toFixed(2)} HTG` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            product.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {product.isActive ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(product)}
                            >
                              Modifier
                            </Button>
                            {product.isActive ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeactivate(product.id)}
                              >
                                Désactiver
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleActivate(product.id)}
                              >
                                Activer
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(product.id)}
                            >
                              Supprimer
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
        title={modalMode === 'create' ? 'Créer un produit' : 'Modifier le produit'}
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
              form="product-form"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enregistrement...' : modalMode === 'create' ? 'Créer' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {formError}
          </div>
        )}

        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nom du produit *
            </label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nom du produit"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Description du produit"
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Catégorie
            </label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Catégorie"
            />
          </div>

          {modalMode === 'create' && (
            <>
              <div>
                <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
                  SKU *
                </label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="SKU-001"
                  required
                />
              </div>

              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                  Prix (HTG) *
                </label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="100.00"
                  required
                />
              </div>
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}
