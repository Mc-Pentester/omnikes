'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Input } from '@omnikes/components/ui/input';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { useCurrentStore } from '@omnikes/contexts/StoreContext';

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

export default function POSPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { currentStore, currentStoreId, setCurrentStore, clearCurrentStore, loading: storeLoading } = useCurrentStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amountReceived, setAmountReceived] = useState('');

  // Fetch stores from API
  const fetchStores = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/stores?isActive=true');
      
      if (!response.ok) {
        throw new Error('Failed to fetch stores');
      }
      
      const data = await response.json();
      const fetchedStores = data.stores || [];
      setStores(fetchedStores);

      // Validate and restore current store from localStorage
      if (currentStoreId) {
        const isValidStore = fetchedStores.some((s: Store) => s.id === currentStoreId);
        if (!isValidStore) {
          // Store from localStorage is not valid for this organization
          clearCurrentStore();
        } else {
          // Restore the full store object
          const store = fetchedStores.find((s: Store) => s.id === currentStoreId);
          if (store) {
            setCurrentStore(store);
          }
        }
      } else if (fetchedStores.length === 1) {
        // Auto-select if only one store available
        setCurrentStore(fetchedStores[0]);
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
      setError('Impossible de charger les magasins');
      setStores([]);
    }
  }, [user, currentStoreId, setCurrentStore, clearCurrentStore]);

  // Fetch real products from API
  const fetchProducts = useCallback(async () => {
    if (!user) return;

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
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchStores();
      fetchProducts();
    }
  }, [user, fetchStores, fetchProducts]);

  if (authLoading || storeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
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

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.variants.some(v => v.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addToCart = async (productId: string, variantId: string, productName: string, variantName: string, sku: string, price: number) => {
    const existingItem = cart.find(item => item.variantId === variantId);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.variantId === variantId
          ? { ...item, quantity: item.quantity + 1, totalPrice: (item.quantity + 1) * item.unitPrice }
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
        unitPrice: price,
        totalPrice: price,
      }]);
    }

    // If no sale exists, create one
    if (!currentSaleId) {
      if (!currentStoreId) {
        console.error('No store selected');
        return;
      }
      try {
        const response = await fetch('/api/sales', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storeId: currentStoreId,
            orderNumber: `SALE-${Date.now()}`,
            channel: 'POS',
            customerId: selectedCustomer || undefined,
            subtotal: 0,
            tax: 0,
            total: 0,
          }),
        });
        
        if (response.ok) {
          const sale = await response.json();
          setCurrentSaleId(sale.id);
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
        ? { ...item, quantity, totalPrice: quantity * item.unitPrice }
        : item
    ));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  // BLOCKER: Tax rate should come from backend TaxConfiguration
  // No API available to fetch organization tax rate
  // TEMPORARY: Using 18% fallback - requires tax rate API
  const tax = subtotal * 0.18;
  const total = subtotal + tax;
  const change = paymentMethod === 'CASH' ? (parseFloat(amountReceived) || 0) - total : 0;

  const syncCartToSale = async () => {
    if (!currentSaleId) return;

    try {
      // Clear existing items
      const itemsResponse = await fetch(`/api/sales/${currentSaleId}/items`);
      if (itemsResponse.ok) {
        const existingItems = await itemsResponse.json();
        for (const item of existingItems) {
          await fetch(`/api/sales/${currentSaleId}/items/${item.id}`, {
            method: 'DELETE',
          });
        }
      }

      // Add cart items
      for (const item of cart) {
        await fetch(`/api/sales/${currentSaleId}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: 0,
          }),
        });
      }

      // Update sale totals
      await fetch(`/api/sales/${currentSaleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subtotal,
          tax,
          total,
        }),
      });
    } catch (err) {
      console.error('Error syncing cart:', err);
    }
  };

  const completeSale = async () => {
    if (cart.length === 0 || !currentSaleId) return;
    
    // Validate payment amount for cash
    const receivedAmount = parseFloat(amountReceived) || 0;
    if (paymentMethod === 'CASH' && receivedAmount < total) {
      alert(`Montant insuffisant. Minimum requis: ${total.toFixed(2)} HTG`);
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Sync cart to sale
      await syncCartToSale();

      // Add payment
      const paymentResponse = await fetch(`/api/sales/${currentSaleId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: paymentMethod,
          amount: total,
          reference: `PAY-${Date.now()}`,
        }),
      });

      if (!paymentResponse.ok) {
        throw new Error('Failed to add payment');
      }

      // Complete sale
      const response = await fetch(`/api/sales/${currentSaleId}/complete`, {
        method: 'POST',
      });

      if (response.ok) {
        setSaleId(currentSaleId);
        setCart([]);
        setCurrentSaleId(null);
        setShowPaymentModal(false);
        setAmountReceived('');
        alert('Vente complétée avec succès!');
      } else {
        throw new Error('Failed to complete sale');
      }
    } catch (error) {
      console.error('Error completing sale:', error);
      alert('Erreur lors de la validation de la vente');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = () => {
    if (cart.length === 0) return;
    setShowPaymentModal(true);
  };

  const clearCart = () => {
    setCart([]);
    setCurrentSaleId(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        (document.querySelector('input[type="text"]') as HTMLInputElement)?.focus();
      }
      if (e.key === 'F12') {
        e.preventDefault();
        handlePayment();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowPaymentModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePayment]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo size={80} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">OmniKès POS</h1>
              <p className="text-sm text-gray-500">Point de Vente</p>
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
            >
              <option value="">Client anonyme (non disponible)</option>
            </select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-73px)]">
        {/* Product Search */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6">
            <Input
              type="text"
              placeholder="Rechercher par nom ou SKU... (F1)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-lg"
            />
          </div>

          {products.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Aucun produit disponible</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map(product =>
                product.variants.map(variant => (
                  <Card
                    key={variant.id}
                    className="p-4 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => addToCart(
                      product.id,
                      variant.id,
                      product.name,
                      variant.name,
                      variant.sku,
                      variant.price
                    )}
                  >
                    <h3 className="font-semibold text-gray-900">{product.name}</h3>
                    <p className="text-sm text-gray-600">{variant.name}</p>
                    <p className="text-xs text-gray-500 mt-1">SKU: {variant.sku}</p>
                    <p className="text-lg font-bold text-gray-900 mt-2">{variant.price.toFixed(2)} HTG</p>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Panier</h2>
            <p className="text-sm text-gray-500">{cart.length} article(s)</p>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {cart.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Le panier est vide</p>
            ) : (
              <div className="space-y-4">
                {cart.map(item => (
                  <div key={item.variantId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{item.productName}</h4>
                      <p className="text-sm text-gray-600">{item.variantName}</p>
                      <p className="text-xs text-gray-500">{item.sku}</p>
                      <p className="text-sm font-medium text-gray-900">{item.unitPrice.toFixed(2)} HTG</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300"
                      >
                        +
                      </button>
                    </div>

                    <div className="ml-4 text-right">
                      <p className="font-bold text-gray-900">{item.totalPrice.toFixed(2)} HTG</p>
                      <button
                        onClick={() => removeFromCart(item.variantId)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sous-total</span>
                <span className="font-medium">{subtotal.toFixed(2)} HTG</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Taxe (18%)</span>
                <span className="font-medium">{tax.toFixed(2)} HTG</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900">{total.toFixed(2)} HTG</span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                onClick={clearCart}
                disabled={cart.length === 0}
                variant="outline"
                className="flex-1"
              >
                Vider
              </Button>
              <Button
                onClick={handlePayment}
                disabled={cart.length === 0 || isProcessing}
                className="flex-1"
              >
                💳 Payer (F12)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-2">Paiement</h2>
            <p className="text-gray-600 mb-4">Total: {total.toFixed(2)} HTG</p>
            
            <div className="space-y-3 mb-4">
              <button
                onClick={() => setPaymentMethod('CASH')}
                className={`w-full p-3 border rounded-lg text-left ${paymentMethod === 'CASH' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
              >
                💵 Espèces
              </button>
              <button
                onClick={() => setPaymentMethod('CARD')}
                className={`w-full p-3 border rounded-lg text-left ${paymentMethod === 'CARD' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
              >
                💳 Carte
              </button>
              <button
                onClick={() => setPaymentMethod('TRANSFER')}
                className={`w-full p-3 border rounded-lg text-left ${paymentMethod === 'TRANSFER' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
              >
                🏦 Virement
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Montant reçu</label>
              <Input
                type="number"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="0.00"
              />
              {paymentMethod === 'CASH' && change > 0 && (
                <p className="text-sm text-green-600 mt-2">Monnaie à rendre: {change.toFixed(2)} HTG</p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setShowPaymentModal(false)}
                variant="outline"
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={completeSale}
                disabled={isProcessing}
                className="flex-1"
              >
                {isProcessing ? 'Traitement...' : 'Confirmer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
