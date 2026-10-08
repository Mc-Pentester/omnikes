'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { EmptyState } from '@omnikes/components/ui/empty-state';
import { Input } from '@omnikes/components/ui/input';
import { Badge } from '@omnikes/components/ui/badge';
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
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/products');
      
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
    const timer = window.setTimeout(() => {
      if (user) void fetchProducts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean))) as string[];
  const filteredProducts = products.filter((product) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || product.name.toLowerCase().includes(q) || product.variants.some((variant) => variant.sku.toLowerCase().includes(q));
    return matchesSearch && (!categoryFilter || product.category === categoryFilter);
  });
  const activeCount = products.filter((product) => product.isActive).length;

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
        <p className="text-muted">Chargement des produits...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger mb-4">{error}</p>
          <Button onClick={fetchProducts}>Réessayer</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted flex">
      <Sidebar 
        compact={isSidebarCompact} 
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)} 
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-surface border-b border-border px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo size={40} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Catalogue</p>
                <h1 className="mt-1 text-2xl font-bold text-foreground">Produits</h1>
                <p className="mt-1 text-sm text-muted">Votre catalogue, vos prix et vos références au même endroit.</p>
              </div>
            </div>
            <Button onClick={handleCreate}>+ Nouveau produit</Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {products.length === 0 ? (
            <EmptyState
              title="Votre catalogue est prêt à commencer"
              description="Ajoutez votre premier produit pour construire votre catalogue et pouvoir passer vos premières ventes."
              actionLabel="Créer un produit"
              onAction={handleCreate}
              icon="box"
              tone="primary"
            />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-5"><p className="text-sm text-muted">Références</p><p className="mt-1 text-2xl font-bold text-foreground">{products.length}</p><p className="mt-1 text-xs text-muted">{filteredProducts.length} affichée(s)</p></Card>
                <Card className="p-5"><p className="text-sm text-muted">Produits actifs</p><p className="mt-1 text-2xl font-bold text-success">{activeCount}</p><p className="mt-1 text-xs text-muted">Disponibles dans le catalogue</p></Card>
                <Card className="p-5"><p className="text-sm text-muted">Produits inactifs</p><p className="mt-1 text-2xl font-bold text-muted">{products.length - activeCount}</p><p className="mt-1 text-xs text-muted">À réactiver si nécessaire</p></Card>
              </div>
              <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit ou un SKU..." /></div>
                  <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground">
                    <option value="">Toutes les catégories</option>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <Button variant="outline" onClick={() => { setSearch(''); setCategoryFilter(''); }}>Réinitialiser</Button>
                </div>
              </Card>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-muted border-b border-border">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Nom</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Catégorie</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">SKU</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Prix</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Stock</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Statut</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface divide-y divide-border">
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-surface-muted">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{product.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{product.category || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{product.variants[0]?.sku || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {product.variants[0]?.price != null ? `${parseFloat(String(product.variants[0].price)).toFixed(2)} HTG` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {product.variants[0]?.stock != null ? (
                            <span className={`font-semibold ${product.variants[0].stock <= 0 ? 'text-danger' : product.variants[0].stock < 5 ? 'text-warning' : 'text-success'}`}>
                              {product.variants[0].stock}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge variant={product.isActive ? 'success' : 'neutral'}>
                            {product.isActive ? 'Actif' : 'Inactif'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
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
              {filteredProducts.length === 0 && (
                <EmptyState
                  title="Aucun produit ne correspond"
                  description="Modifiez votre recherche ou réinitialisez les filtres pour retrouver votre catalogue."
                  actionLabel="Réinitialiser les filtres"
                  onAction={() => { setSearch(''); setCategoryFilter(''); }}
                  icon="search"
                  tone="info"
                />
              )}
            </div>
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
          <div className="mb-4 p-3 bg-danger-soft border border-danger rounded-lg text-sm text-danger">
            {formError}
          </div>
        )}

        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
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
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
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
            <label htmlFor="category" className="block text-sm font-medium text-foreground mb-1">
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
                <label htmlFor="sku" className="block text-sm font-medium text-foreground mb-1">
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
                <label htmlFor="price" className="block text-sm font-medium text-foreground mb-1">
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
