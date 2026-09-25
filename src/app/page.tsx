'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Input } from '@omnikes/components/ui/input';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { useCurrentStore } from '@omnikes/contexts/StoreContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Logo } from '@omnikes/components/branding/Logo';

interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Product {
  id: string;
  name: string;
  variants: {
    id: string;
    sku: string;
    name: string;
    price: number;
  }[];
}

interface Store {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { currentStore, currentStoreId, setCurrentStore, clearCurrentStore, loading: storeLoading } = useCurrentStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amountReceived, setAmountReceived] = useState('');
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [serverTotals, setServerTotals] = useState<{ subtotal: number; tax: number; total: number } | null>(null);
  const [storesValidated, setStoresValidated] = useState(false);
  const [applyTax, setApplyTax] = useState(true);

  const generateOrderNumber = useCallback(() => `SALE-${Date.now()}`, []);
  const generatePaymentReference = useCallback(() => `PAY-${Date.now()}`, []);

  const handlePayment = useCallback(() => {
    if (cart.length === 0) return;
    setShowPaymentModal(true);
  }, [cart.length]);

  useEffect(() => {
    if (!loading && !error) {
      const searchInput = document.getElementById('product-search') as HTMLInputElement;
      searchInput?.focus();
    }
  }, [loading, error]);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.variants.some(v => v.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        const searchInput = document.getElementById('product-search') as HTMLInputElement;
        searchInput?.focus();
      }
      if (e.key === 'F12') {
        e.preventDefault();
        handlePayment();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showPaymentModal) setShowPaymentModal(false);
      }
      if (e.key === 'Enter' && document.activeElement?.id === 'product-search') {
        const firstProduct = filteredProducts[0];
        if (firstProduct && firstProduct.variants[0]) {
          e.preventDefault();
          addToCart(
            firstProduct.variants[0].id,
            firstProduct.id,
            firstProduct.name,
            firstProduct.variants[0].name,
            firstProduct.variants[0].sku,
            firstProduct.variants[0].price
          );
          setSearchTerm('');
          setTimeout(() => {
            const searchInput = document.getElementById('product-search') as HTMLInputElement;
            searchInput?.focus();
          }, 100);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePayment, filteredProducts, showPaymentModal]);

  const fetchStores = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/stores?isActive=true');
      if (!response.ok) throw new Error('Failed to fetch stores');
      const data = await response.json();
      setStores(data.stores || []);
    } catch (err) {
      console.error('Error fetching stores:', err);
      setError('Impossible de charger les magasins');
      setStores([]);
    }
  }, [user]);

  const fetchProducts = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Impossible de charger les produits');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchTaxRate = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/tax');
      if (response.ok) {
        const data = await response.json();
        setTaxRate(data.taxRate);
      } else {
        setTaxRate(null);
      }
    } catch (err) {
      setTaxRate(null);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setTimeout(() => {
        fetchStores();
        fetchProducts();
        fetchTaxRate();
      }, 0);
    }
  }, [user, fetchStores, fetchProducts, fetchTaxRate]);

  useEffect(() => {
    if (stores.length === 0) return;
    if (stores.length === 1 && !currentStoreId) {
      setCurrentStore(stores[0]);
      setStoresValidated(true);
      return;
    }
    if (currentStoreId) {
      const isValidStore = stores.some((s: Store) => s.id === currentStoreId);
      if (!isValidStore) {
        console.log('[POS][STORE] Invalid storeId in localStorage, clearing:', currentStoreId);
        clearCurrentStore();
      } else {
        if (currentStore && (!currentStore.name || !currentStore.code)) {
          const store = stores.find((s: Store) => s.id === currentStoreId);
          if (store) {
            console.log('[POS][STORE] Enriching store data for:', currentStoreId);
            setCurrentStore(store);
          }
        }
      }
    }
    setStoresValidated(true);
  }, [stores, currentStoreId, currentStore, setCurrentStore, clearCurrentStore]);

  if (authLoading || storeLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-600">Chargement...</p></div>;
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  if (stores.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-xl mb-4">Aucun magasin disponible</p>
          <p className="text-gray-600">Veuillez contacter votre administrateur pour configurer un magasin.</p>
        </div>
      </div>
    );
  }

  if (!currentStore) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-xl mb-4">Veuillez sélectionner un magasin</p>
          <select
            value=""
            onChange={(e) => {
              const store = stores.find(s => s.id === e.target.value);
              if (store) setCurrentStore(store);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Sélectionner un magasin</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const addToCart = async (variantId: string, productId: string, productName: string, variantName: string, sku: string, price: number) => {
    // Prevent adding to cart before stores are validated
    if (!storesValidated) {
      console.log('[POS][STORE] Stores not yet validated, ignoring addToCart');
      return;
    }

    const numericPrice = parseFloat(String(price));
    const existingItem = cart.find(item => item.variantId === variantId);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.variantId === variantId
          ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * parseFloat(String(item.unitPrice)) }
          : item
      ));
    } else {
      setCart([...cart, {
        variantId,
        productId,
        productName,
        variantName,
        sku,
        quantity: 1,
        unitPrice: numericPrice,
        totalPrice: numericPrice,
      }]);
    }

    if (!currentSaleId) {
      if (!currentStoreId) {
        console.error('No store selected');
        return;
      }
      try {
        console.log('[POS][STORE] Creating sale with storeId:', currentStoreId);
        const response = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: currentStoreId,
            orderNumber: generateOrderNumber(),
            channel: 'POS',
            customerId: selectedCustomer || undefined,
            subtotal: 0,
            tax: 0,
            total: 0,
            discount: 0,
            applyTax,
          }),
        });
        if (response.ok) {
          const sale = await response.json();
          console.log('[POS][STORE] Sale created successfully:', sale.id);
          setCurrentSaleId(sale.id);
        } else {
          const errorText = await response.text();
          console.error('[POS][STORE] Failed to create sale:', response.status, errorText);
        }
      } catch (err) {
        console.error('Error creating sale:', err);
      }
    }
  };

  const removeFromCart = (variantId: string) => {
    setCart(cart.filter(item => item.variantId !== variantId));
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    setCart(cart.map(item =>
      item.variantId === variantId
        ? { ...item, quantity, totalPrice: quantity * parseFloat(String(item.unitPrice)) }
        : item
    ));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const displayTax = serverTotals?.tax ?? (applyTax && taxRate !== null ? subtotal * taxRate : 0);
  const displayTotal = serverTotals?.total ?? (applyTax ? subtotal + displayTax : subtotal);
  const change = paymentMethod === 'CASH' ? (parseFloat(amountReceived) || 0) - displayTotal : 0;

  // Temporary forensic logging
  console.log('[TOTAL FORENSIC] Cart calculation:', {
    cartLength: cart.length,
    subtotal,
    taxRate,
    displayTax,
    displayTotal,
    serverTotals,
  });

  const syncCartToSale = async () => {
    if (!currentSaleId) return;
    try {
      console.log('[SYNC DEBUG] Starting sync for sale:', currentSaleId);
      
      // Update applyTax if changed
      await fetch(`/api/sales/${currentSaleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applyTax }),
      });
      
      const itemsResponse = await fetch(`/api/sales/${currentSaleId}/items`);
      console.log('[SYNC DEBUG] GET items response status:', itemsResponse.status);
      
      if (itemsResponse.ok) {
        const existingItems = await itemsResponse.json();
        console.log('[SYNC DEBUG] Existing items:', existingItems.length);
        
        for (const item of existingItems) {
          const deleteResponse = await fetch(`/api/sales/${currentSaleId}/items/${item.id}`, { method: 'DELETE' });
          console.log('[SYNC DEBUG] DELETE item', item.id, 'status:', deleteResponse.status);
          
          if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.error('[SYNC DEBUG] DELETE item failed:', deleteResponse.status, errorText);
            throw new Error(`Failed to delete item: ${deleteResponse.status} - ${errorText}`);
          }
        }
      } else {
        const errorText = await itemsResponse.text();
        console.error('[SYNC DEBUG] GET items failed:', itemsResponse.status, errorText);
        throw new Error(`Failed to get existing items: ${itemsResponse.status} - ${errorText}`);
      }
      
        console.log('[SYNC DEBUG] Adding cart items:', cart.length);
      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const payload = {
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: 0,
        };
        
        const itemResponse = await fetch(`/api/sales/${currentSaleId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (!itemResponse.ok) {
          const errorText = await itemResponse.text();
          console.error(`[SYNC DEBUG] Cart item ${i + 1}/${cart.length} POST failed:`, itemResponse.status, errorText);
          throw new Error(`Failed to add item ${i + 1}/${cart.length}: ${itemResponse.status} - ${errorText}`);
        }
      }
      
      const saleResponse = await fetch(`/api/sales/${currentSaleId}`);
      console.log('[SYNC DEBUG] GET sale response status:', saleResponse.status);
      
      if (saleResponse.ok) {
        const sale = await saleResponse.json();
        const totals = {
          subtotal: Number(sale.subtotal),
          tax: Number(sale.tax),
          total: Number(sale.total),
        };
        console.log('[SYNC DEBUG] Server totals:', totals);
        console.log('[TOTAL FORENSIC] Server calculation:', {
          serverSubtotal: totals.subtotal,
          serverTax: totals.tax,
          serverTotal: totals.total,
        });
        setServerTotals(totals);
        return totals; // Return totals for immediate use
      } else {
        const errorText = await saleResponse.text();
        console.error('[SYNC DEBUG] GET sale failed:', saleResponse.status, errorText);
        throw new Error(`Failed to get sale totals: ${saleResponse.status} - ${errorText}`);
      }
    } catch (err) {
      console.error('[SYNC DEBUG] Error syncing cart:', err);
      throw err; // Re-throw to allow completeSale to catch and display the error
    }
  };

  const completeSale = async () => {
    if (cart.length === 0 || !currentSaleId) return;
    const receivedAmount = parseFloat(amountReceived) || 0;
    if (paymentMethod === 'CASH' && receivedAmount < displayTotal) {
      alert(`Montant insuffisant. Minimum requis: ${parseFloat(String(displayTotal)).toFixed(2)} HTG`);
      return;
    }
    setIsProcessing(true);
    try {
      // Sync cart to ensure server totals are up to date
      const totals = await syncCartToSale();
      
      // Validate server totals
      if (!totals || totals.total <= 0) {
        throw new Error('Le total serveur de la vente est invalide. Veuillez réessayer.');
      }
      
      // Generate idempotency key for this checkout attempt
      const idempotencyKey = crypto.randomUUID();
      
      const response = await fetch(`/api/sales/${currentSaleId}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          method: paymentMethod,
          amount: totals.total,
          reference: generatePaymentReference(),
        }),
      });
      
      if (!response.ok) {
        let errorMessage = 'Échec du checkout';
        try {
          const data = await response.json();
          if (typeof data?.error === 'string') {
            errorMessage = data.error;
          } else if (typeof data?.message === 'string') {
            errorMessage = data.message;
          }
        } catch {
          // conserver le message générique
        }
        throw new Error(errorMessage);
      }
      
      setCart([]);
      setCurrentSaleId(null);
      setShowPaymentModal(false);
      setAmountReceived('');
      setServerTotals(null);
      alert('Vente complétée avec succès!');
      setTimeout(() => {
        const searchInput = document.getElementById('product-search') as HTMLInputElement;
        searchInput?.focus();
      }, 100);
    } catch (error) {
      console.error('Error completing sale:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la validation de la vente');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearCart = () => {
    setCart([]);
    setCurrentSaleId(null);
    setServerTotals(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-600">Chargement...</p></div>;
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
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo size={60} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OmniKès POS</h1>
              <span className="text-sm text-gray-500">Point de Vente</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <select
              value={currentStoreId || ''}
              onChange={(e) => {
                const store = stores.find(s => s.id === e.target.value);
                if (store) setCurrentStore(store);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
              aria-label="Sélectionner un magasin"
            >
              <option value="">Sélectionner un magasin</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
              ))}
            </select>
            
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
              disabled
              aria-label="Sélectionner un client"
            >
              <option value="">Client anonyme (non disponible)</option>
            </select>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className="mb-4 md:mb-6">
            <Input
              type="text"
              placeholder="Rechercher par nom ou SKU... (F1)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-lg h-12"
              id="product-search"
              autoComplete="off"
            />
          </div>

          {products.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Aucun produit disponible</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {filteredProducts.map(product =>
                product.variants.map(variant => (
                  <Card
                    key={variant.id}
                    className={`p-3 md:p-4 cursor-pointer hover:shadow-lg transition-all hover:scale-105 active:scale-95 min-h-[140px] md:min-h-[160px] flex flex-col justify-between ${!storesValidated ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => storesValidated && addToCart(
                      variant.id,
                      product.id,
                      product.name,
                      variant.name,
                      variant.sku,
                      variant.price
                    )}
                    role="button"
                    tabIndex={storesValidated ? 0 : -1}
                    onKeyDown={(e) => {
                      if (storesValidated && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        addToCart(variant.id, product.id, product.name, variant.name, variant.sku, variant.price);
                      }
                    }}
                    aria-label={`Ajouter ${product.name} - ${variant.name} au panier`}
                  >
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base md:text-lg">{product.name}</h3>
                      <p className="text-sm text-gray-600">{variant.name}</p>
                      <p className="text-xs text-gray-500 mt-1">SKU: {variant.sku}</p>
                    </div>
                    <p className="text-lg md:text-xl font-bold text-gray-900 mt-2 md:mt-3">{parseFloat(String(variant.price)).toFixed(2)} HTG</p>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        <div className="w-80 md:w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 md:p-6 border-b border-gray-200">
            <h2 className="text-lg md:text-xl font-bold text-gray-900">Panier</h2>
            <p className="text-sm text-gray-500">{cart.length} article(s)</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {cart.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Le panier est vide</p>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {cart.map(item => (
                  <div key={item.variantId} className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 text-sm md:text-base truncate">{item.productName}</h4>
                      <p className="text-xs md:text-sm text-gray-600 truncate">{item.variantName}</p>
                      <p className="text-xs text-gray-500">{item.sku}</p>
                      <p className="text-sm font-medium text-gray-900">{parseFloat(String(item.unitPrice)).toFixed(2)} HTG</p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-gray-200 rounded-lg hover:bg-gray-300 text-lg md:text-xl font-bold transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        aria-label={`Réduire la quantité de ${item.productName}`}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            updateQuantity(item.variantId, item.quantity - 1);
                          }
                        }}
                      >
                        -
                      </button>
                      <span className="w-8 md:w-12 text-center font-medium text-base md:text-lg" aria-live="polite">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-gray-200 rounded-lg hover:bg-gray-300 text-lg md:text-xl font-bold transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        aria-label={`Augmenter la quantité de ${item.productName}`}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            updateQuantity(item.variantId, item.quantity + 1);
                          }
                        }}
                      >
                        +
                      </button>
                    </div>

                    <div className="ml-2 md:ml-4 text-right flex-shrink-0">
                      <p className="font-bold text-gray-900 text-base md:text-lg">{parseFloat(String(item.totalPrice)).toFixed(2)} HTG</p>
                      <button
                        onClick={() => removeFromCart(item.variantId)}
                        className="text-xs md:text-sm text-red-600 hover:text-red-700 font-medium py-1 px-2 rounded hover:bg-red-50 transition-colors focus:ring-2 focus:ring-red-500 focus:outline-none"
                        aria-label={`Supprimer ${item.productName} du panier`}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            removeFromCart(item.variantId);
                          }
                        }}
                      >
                        🗑 Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 md:p-6 border-t border-gray-200 bg-gray-50">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sous-total</span>
                <span className="font-medium">{parseFloat(String(subtotal)).toFixed(2)} HTG</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyTax}
                    onChange={(e) => setApplyTax(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-600">Appliquer la taxe</span>
                </label>
                <span className="font-medium">
                  {applyTax && taxRate !== null ? `(${parseFloat(String(taxRate * 100)).toFixed(0)}%)` : '(0%)'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Taxe</span>
                <span className="font-medium">{parseFloat(String(displayTax)).toFixed(2)} HTG</span>
              </div>
              <div className="flex justify-between text-base md:text-lg font-bold border-t border-gray-200 pt-2">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900">{parseFloat(String(displayTotal)).toFixed(2)} HTG</span>
              </div>
            </div>

            <div className="flex gap-2 md:gap-3 mt-4">
              <Button
                onClick={clearCart}
                disabled={cart.length === 0 || !storesValidated}
                variant="outline"
                className="flex-1 h-12 md:h-14 text-base md:text-lg font-medium"
              >
                Vider
              </Button>
              <Button
                onClick={handlePayment}
                disabled={cart.length === 0 || isProcessing || !storesValidated}
                className="flex-1 h-12 md:h-14 text-base md:text-lg font-bold"
              >
                💳 Payer (F12)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPaymentModal(false);
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 id="payment-modal-title" className="text-2xl font-bold">Paiement</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label="Fermer"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            <p className="text-gray-600 mb-4">Total: {parseFloat(String(displayTotal)).toFixed(2)} HTG</p>
            
            <div className="space-y-3 mb-4">
              <button
                onClick={() => setPaymentMethod('CASH')}
                className={`w-full p-4 border rounded-lg text-left text-lg font-medium transition-colors ${paymentMethod === 'CASH' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}
                aria-pressed={paymentMethod === 'CASH'}
              >
                💵 Espèces
              </button>
              <button
                onClick={() => setPaymentMethod('CARD')}
                className={`w-full p-4 border rounded-lg text-left text-lg font-medium transition-colors ${paymentMethod === 'CARD' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}
                aria-pressed={paymentMethod === 'CARD'}
              >
                💳 Carte
              </button>
              <button
                onClick={() => setPaymentMethod('BANK_TRANSFER')}
                className={`w-full p-4 border rounded-lg text-left text-lg font-medium transition-colors ${paymentMethod === 'BANK_TRANSFER' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}
                aria-pressed={paymentMethod === 'BANK_TRANSFER'}
              >
                🏦 Virement bancaire
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="amount-received" className="block text-sm font-medium mb-2">Montant reçu</label>
              <Input
                id="amount-received"
                type="number"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="0.00"
                className="text-lg h-12"
                step="0.01"
              />
              {paymentMethod === 'CASH' && change > 0 && (
                <p className="text-sm text-green-600 mt-2 font-medium">Monnaie à rendre: {parseFloat(String(change)).toFixed(2)} HTG</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowPaymentModal(false)}
                variant="outline"
                className="flex-1 h-14 text-lg font-medium"
              >
                Annuler
              </Button>
              <Button
                onClick={completeSale}
                disabled={isProcessing}
                className="flex-1 h-14 text-lg font-bold"
              >
                {isProcessing ? 'Traitement...' : 'Confirmer'}
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
