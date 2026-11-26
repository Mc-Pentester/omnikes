'use client';

import { useState, useEffect, useCallback } from 'react';
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
  barcode?: string | null;
  price: number;
  cost: number;
  stock: number;
  casePrice?: number | null;
  dozenPrice?: number | null;
  pack3Price?: number | null;
  unitPrice?: number | null;
  unitsPerCase?: number | null;
}

interface ProductFormData {
  name: string;
  description: string;
  category: string;
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  casePrice: string;
  dozenPrice: string;
  pack3Price: string;
  unitsPerCase: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const currencyLabel = user?.currencySymbol || user?.currency || 'USD';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    category: '',
    sku: '',
    barcode: '',
    price: '',
    cost: '',
    casePrice: '',
    dozenPrice: '',
    pack3Price: '',
    unitsPerCase: '1',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [returnToOnboarding, setReturnToOnboarding] = useState(false);
  const [initialStock, setInitialStock] = useState('0');
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [initialStockStoreId, setInitialStockStoreId] = useState('');

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
    queueMicrotask(() => {
      setReturnToOnboarding(new URLSearchParams(window.location.search).get('returnTo') === 'onboarding');
      if (user) void fetchProducts();
    });
  }, [user]);

  const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean))) as string[];
  const filteredProducts = products.filter((product) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || product.name.toLowerCase().includes(q) || product.variants.some((variant) => variant.sku.toLowerCase().includes(q) || (variant.barcode || '').toLowerCase().includes(q));
    return matchesSearch && (!categoryFilter || product.category === categoryFilter);
  });
  const activeCount = products.filter((product) => product.isActive).length;

  const handleCreate = useCallback(async (scannedBarcode = '') => {
    setModalMode('create');
    setInitialStock('0');
    setInitialStockStoreId('');
    try {
      const response = await fetch('/api/stores?isActive=true');
      const data = await response.json();
      const availableStores = data.stores || [];
      setStores(availableStores);
      if (availableStores.length > 0) setInitialStockStoreId(availableStores[0].id);
    } catch (err) {
      console.error('Error fetching stores for initial stock:', err);
      setStores([]);
    }
    setFormData({
      name: '',
      description: '',
      category: '',
      sku: '',
      barcode: scannedBarcode,
      price: '',
      cost: '',
      casePrice: '',
      dozenPrice: '',
      pack3Price: '',
      unitsPerCase: '1',
    });
    setFormError(null);
    setShowModal(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    const url = new URL(window.location.href);
    const scannedBarcode = url.searchParams.get('newBarcode');
    if (!scannedBarcode) return;
    url.searchParams.delete('newBarcode');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    queueMicrotask(() => void handleCreate(scannedBarcode));
  }, [user, handleCreate]);

  const handleEdit = (product: Product) => {
    setModalMode('edit');
    setSelectedProduct(product);
    setSelectedVariantId(product.variants[0]?.id || '');
    setFormData({
      name: product.name,
      description: product.description || '',
      category: product.category || '',
      sku: product.variants[0]?.sku || '',
      barcode: product.variants[0]?.barcode || '',
      price: product.variants[0]?.unitPrice?.toString() || product.variants[0]?.price?.toString() || '',
      cost: product.variants[0]?.cost?.toString() || '0',
      casePrice: product.variants[0]?.casePrice?.toString() || '',
      dozenPrice: product.variants[0]?.dozenPrice?.toString() || '',
      pack3Price: product.variants[0]?.pack3Price?.toString() || '',
      unitsPerCase: product.variants[0]?.unitsPerCase?.toString() || '1',
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

    const requestedInitialStock = Number(initialStock);
    if (!Number.isInteger(requestedInitialStock) || requestedInitialStock < 0) {
      setFormError('Le stock initial doit être un nombre entier positif ou zéro.');
      setIsSubmitting(false);
      return;
    }
    if (requestedInitialStock > 0 && !initialStockStoreId) {
      setFormError('Sélectionnez le magasin auquel attribuer le stock initial.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.price || !Number.isFinite(Number(formData.price)) || Number(formData.price) < 0) {
      setFormError('Le prix doit être un nombre valide et positif ou nul.');
      setIsSubmitting(false);
      return;
    }
    if (formData.cost.trim() === '' || !Number.isFinite(Number(formData.cost)) || Number(formData.cost) < 0) {
      setFormError('Le coût unitaire doit être un nombre valide et positif ou nul.');
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
                barcode: formData.barcode.trim() || undefined,
                price: parseFloat(formData.price),
                cost: parseFloat(formData.cost),
                unitPrice: parseFloat(formData.price),
                casePrice: formData.casePrice.trim() ? Number(formData.casePrice) : undefined,
                dozenPrice: formData.dozenPrice.trim() ? Number(formData.dozenPrice) : undefined,
                pack3Price: formData.pack3Price.trim() ? Number(formData.pack3Price) : undefined,
                unitsPerCase: Number(formData.unitsPerCase || 1),
              }
            ],
            ...(requestedInitialStock > 0
              ? { initialStock: { storeId: initialStockStoreId, quantity: requestedInitialStock } }
              : {}),
          }
        : {
            name: formData.name,
            description: formData.description,
            category: formData.category,
            variantId: selectedVariantId,
            barcode: formData.barcode.trim(),
            price: parseFloat(formData.price),
            cost: parseFloat(formData.cost),
            unitPrice: parseFloat(formData.price),
            casePrice: formData.casePrice.trim() ? Number(formData.casePrice) : undefined,
            dozenPrice: formData.dozenPrice.trim() ? Number(formData.dozenPrice) : undefined,
            pack3Price: formData.pack3Price.trim() ? Number(formData.pack3Price) : undefined,
            unitsPerCase: Number(formData.unitsPerCase || 1),
          };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        setFormError('Ce SKU ou code-barres existe déjà.');
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
      if (modalMode === 'create' && returnToOnboarding) {
        router.push('/onboarding?step=products');
      }
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
            <div className="flex items-center gap-2">
              {returnToOnboarding && <Button variant="outline" onClick={() => router.push('/onboarding?step=products')}>Retour à l&apos;assistant</Button>}
              <Button onClick={() => void handleCreate()}>+ Nouveau produit</Button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {products.length === 0 ? (
            <EmptyState
              title="Votre catalogue est prêt à commencer"
              description="Ajoutez votre premier produit pour construire votre catalogue et pouvoir passer vos premières ventes."
              actionLabel="Créer un produit"
              onAction={() => void handleCreate()}
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">SKU / Code-barres</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Prix de vente</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Coût d’acquisition</th>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{product.variants[0]?.sku || '-'}<span className="block text-xs">{product.variants[0]?.barcode || 'Sans code-barres'}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {(product.variants[0]?.unitPrice ?? product.variants[0]?.price) != null ? `${parseFloat(String(product.variants[0].unitPrice ?? product.variants[0].price)).toFixed(2)} ${currencyLabel}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {product.variants[0]?.cost != null ? `${parseFloat(String(product.variants[0].cost)).toFixed(2)} ${currencyLabel}` : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <span className={`font-semibold ${product.variants[0]?.stock === 0 ? 'text-danger' : (product.variants[0]?.stock ?? 0) < 5 ? 'text-warning' : 'text-success'}`}>
                            {product.variants[0]?.stock ?? 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge variant={product.isActive ? 'success' : 'neutral'}>
                            {product.isActive ? 'Actif' : 'Inactif'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          <div className="flex flex-wrap gap-2">
                            {product.variants.map((variant) => (
                              <Button
                                key={variant.id}
                                variant="outline"
                                size="sm"
                                onClick={() => router.push(`/inventory?sku=${encodeURIComponent(variant.sku)}`)}
                              >
                                Ajouter inventaire
                              </Button>
                            ))}
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
                <label htmlFor="barcode" className="block text-sm font-medium text-foreground mb-1">Code-barres (facultatif)</label>
                <Input id="barcode" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Scanner ou saisir le code-barres" autoComplete="off" autoFocus={modalMode === 'create'} />
                <p className="mt-1 text-xs text-muted">Scannez ici le code-barres (scanner USB/Bluetooth en mode clavier), puis complétez les informations avant d’enregistrer. Entrée ne soumet pas le formulaire.</p>
              </div>
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-foreground mb-1">
                  Prix de vente ({currencyLabel}) *
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
              <div>
                <label htmlFor="cost" className="block text-sm font-medium text-foreground mb-1">Coût d’acquisition unitaire ({currencyLabel}) *</label>
                <Input id="cost" type="number" min="0" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} placeholder="0.00" required />
                <p className="mt-1 text-xs text-muted">Ce coût sert au calcul de la valeur du stock (quantité × coût unitaire).</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted p-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Stock initial (facultatif)</p>
                  <p className="text-xs text-muted">Vous pouvez créer le produit sans stock et le réceptionner plus tard.</p>
                </div>
                <div>
                  <label htmlFor="initial-stock" className="block text-sm font-medium text-foreground mb-1">Quantité initiale</label>
                  <Input id="initial-stock" type="number" min="0" step="1" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} placeholder="0" />
                </div>
                {Number(initialStock) > 0 && (
                  <div>
                    <label htmlFor="initial-stock-store" className="block text-sm font-medium text-foreground mb-1">Magasin de réception *</label>
                    <select id="initial-stock-store" value={initialStockStoreId} onChange={(e) => setInitialStockStoreId(e.target.value)} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground" required>
                      <option value="">Sélectionner un magasin</option>
                      {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                    {stores.length === 0 && <p className="mt-1 text-xs text-danger">Aucun magasin actif disponible. Créez d’abord un magasin ou laissez le stock initial à zéro.</p>}
                  </div>
                )}
              </div>
            </>
          )}
          {modalMode === 'edit' && selectedProduct && selectedProduct.variants.length > 1 && (
            <div>
              <label htmlFor="barcode-variant" className="block text-sm font-medium text-foreground mb-1">Variante à modifier</label>
              <select id="barcode-variant" value={selectedVariantId} onChange={(e) => {
                const variant = selectedProduct.variants.find((item) => item.id === e.target.value);
                setSelectedVariantId(e.target.value);
                setFormData((current) => ({ ...current, barcode: variant?.barcode || '', price: variant?.unitPrice?.toString() || variant?.price?.toString() || '', cost: variant?.cost?.toString() || '0', casePrice: variant?.casePrice?.toString() || '', dozenPrice: variant?.dozenPrice?.toString() || '', pack3Price: variant?.pack3Price?.toString() || '', unitsPerCase: variant?.unitsPerCase?.toString() || '1' }));
              }} className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground">
                {selectedProduct.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.sku}</option>)}
              </select>
            </div>
          )}
          {modalMode === 'edit' && (
            <div className="rounded-lg border border-border bg-surface-muted p-3 space-y-3">
              <p className="text-sm font-semibold text-foreground">Prix du produit</p>
              <div>
                <label htmlFor="price" className="block text-sm font-medium text-foreground mb-1">Prix de vente ({currencyLabel}) *</label>
                <Input id="price" type="number" min="0" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="100.00" required />
                <p className="mt-1 text-xs text-muted">Prix appliqué aux prochaines ventes.</p>
              </div>
              <div>
                <label htmlFor="cost" className="block text-sm font-medium text-foreground mb-1">Coût d’acquisition unitaire ({currencyLabel}) *</label>
                <Input id="cost" type="number" min="0" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} placeholder="0.00" required />
                <p className="mt-1 text-xs text-muted">Utilisé pour calculer la valeur du stock, jamais le prix de vente.</p>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-border bg-surface-muted p-3 space-y-3">
            <p className="text-sm font-semibold text-foreground">Prix par conditionnement</p>
            <p className="text-xs text-muted">Le stock reste compté en unités de base. Laissez un prix vide pour désactiver ce conditionnement.</p>
            <div>
              <label htmlFor="pack3-price" className="block text-sm font-medium text-foreground mb-1">Lot de 3 ({currencyLabel})</label>
              <Input id="pack3-price" type="number" min="0" step="0.01" value={formData.pack3Price} onChange={(e) => setFormData({ ...formData, pack3Price: e.target.value })} placeholder="Prix du lot de 3" />
            </div>
            <div>
              <label htmlFor="dozen-price" className="block text-sm font-medium text-foreground mb-1">Douzaine ({currencyLabel})</label>
              <Input id="dozen-price" type="number" min="0" step="0.01" value={formData.dozenPrice} onChange={(e) => setFormData({ ...formData, dozenPrice: e.target.value })} placeholder="Prix de la douzaine" />
            </div>
            <div>
              <label htmlFor="units-per-case" className="block text-sm font-medium text-foreground mb-1">Unités par caisse</label>
              <Input id="units-per-case" type="number" min="1" step="1" value={formData.unitsPerCase} onChange={(e) => setFormData({ ...formData, unitsPerCase: e.target.value })} />
            </div>
            <div>
              <label htmlFor="case-price" className="block text-sm font-medium text-foreground mb-1">Prix de la caisse ({currencyLabel})</label>
              <Input id="case-price" type="number" min="0" step="0.01" value={formData.casePrice} onChange={(e) => setFormData({ ...formData, casePrice: e.target.value })} placeholder="Prix de la caisse" />
            </div>
          </div>
          {modalMode === 'edit' && selectedProduct && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Quantité en stock</p>
                  <p className="text-sm text-muted">{selectedProduct.variants.find((variant) => variant.id === selectedVariantId)?.stock ?? 0} unité(s) actuellement enregistrée(s)</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  const variant = selectedProduct.variants.find((item) => item.id === selectedVariantId);
                  if (variant) router.push(`/inventory?sku=${encodeURIComponent(variant.sku)}`);
                }}>Gérer la quantité</Button>
              </div>
              <p className="text-xs text-muted">Les réceptions et ajustements se font dans la gestion des stocks afin de conserver l’historique des mouvements.</p>
            </div>
          )}
          {modalMode === 'edit' && (
            <div>
              <label htmlFor="barcode" className="block text-sm font-medium text-foreground mb-1">Code-barres (facultatif)</label>
              <Input id="barcode" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} placeholder="Scanner ou saisir le code-barres" autoComplete="off" />
              <p className="mt-1 text-xs text-muted">Ajoutez ou modifiez le code-barres sans changer le SKU.</p>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
