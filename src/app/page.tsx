'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Input } from '@omnikes/components/ui/input';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { useCurrentStore } from '@omnikes/contexts/StoreContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Logo } from '@omnikes/components/branding/Logo';
import { ScaleReaderPanel } from '@omnikes/components/hardware/ScaleReaderPanel';
import { PosReceipt } from '@omnikes/components/sales/PosReceipt';

const SALE_UNIT_TO_GRAMS: Record<'UNIT' | 'G' | 'KG' | 'LB' | 'OZ', number> = { UNIT: 1, G: 1, KG: 1000, LB: 453.59237, OZ: 28.349523125 };

function formatCartQuantity(quantity: number, saleUnit: 'UNIT' | 'G' | 'KG' | 'LB' | 'OZ'): string {
  if (saleUnit === 'UNIT') return String(quantity);
  const value = quantity / SALE_UNIT_TO_GRAMS[saleUnit];
  return `${value.toFixed(value % 1 === 0 ? 0 : 3)} ${saleUnit}`;
}

interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  saleUnit: 'UNIT' | 'G' | 'KG' | 'LB' | 'OZ';
  packaging: 'UNIT' | 'PACK3' | 'DOZEN' | 'CASE';
  baseUnits: number;
}

interface Product {
  id: string;
  name: string;
  variants: {
    id: string;
    sku: string;
    barcode?: string | null;
    name: string;
    price: number;
    saleUnit: 'UNIT' | 'G' | 'KG' | 'LB' | 'OZ';
    casePrice?: number | null;
    dozenPrice?: number | null;
    pack3Price?: number | null;
    unitPrice?: number | null;
    unitsPerCase?: number | null;
  }[];
}

interface Customer { id: string; name: string; }

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amountReceived, setAmountReceived] = useState('');
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [serverTotals, setServerTotals] = useState<{ subtotal: number; tax: number; total: number } | null>(null);
  const [applyTax, setApplyTax] = useState(false);
  const [pendingScaleReading, setPendingScaleReading] = useState<{ weightGrams: number; stable: boolean } | null>(null);
  const barcodeLookupInProgress = useRef(false);
  const barcodeQueueRef = useRef<string[]>([]);

  const generateOrderNumber = useCallback(() => `SALE-${Date.now()}`, []);
  const generatePaymentReference = useCallback(() => `PAY-${Date.now()}`, []);
  const handleScaleReading = useCallback((reading: { weightGrams: number; stable: boolean }) => {
    setPendingScaleReading(reading);
  }, []);

  const handlePayment = useCallback(() => {
    if (cart.length === 0) return;
    setShowPaymentModal(true);
  }, [cart.length]);

  // Persist cart state when navigating to cash page
  const persistCartState = useCallback(() => {
    if (currentSaleId && cart.length > 0) {
      const cartState = {
        currentSaleId,
        cart,
        serverTotals,
        paymentMethod,
        amountReceived,
        selectedCustomer,
        discountAmount,
      };
      localStorage.setItem('omnikes_pending_cart', JSON.stringify(cartState));
    }
  }, [currentSaleId, cart, serverTotals, paymentMethod, amountReceived, selectedCustomer, discountAmount]);

  // Restore cart state when returning from cash page
  const restoreCartState = useCallback(() => {
    const saved = localStorage.getItem('omnikes_pending_cart');
    if (saved) {
      try {
        const cartState = JSON.parse(saved);
        setCurrentSaleId(cartState.currentSaleId);
        setCart(cartState.cart);
        setServerTotals(cartState.serverTotals);
        setPaymentMethod(cartState.paymentMethod);
        setAmountReceived(cartState.amountReceived);
        setSelectedCustomer(cartState.selectedCustomer);
        setDiscountAmount(cartState.discountAmount ?? '0');
        localStorage.removeItem('omnikes_pending_cart');
      } catch (error) {
        console.error('Failed to restore cart state:', error);
        localStorage.removeItem('omnikes_pending_cart');
      }
    }
  }, []);

  useEffect(() => {
    if (!loading && !error) {
      const searchInput = document.getElementById('product-search') as HTMLInputElement;
      searchInput?.focus();
    }
  }, [loading, error]);

  const storesValidated = stores.length > 0 && !!currentStoreId && stores.some((store) => store.id === currentStoreId);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const query = searchTerm.trim();
        const endpoint = query
          ? `/api/products?search=${encodeURIComponent(query)}&take=100&skip=0`
          : '/api/products?take=50&skip=0';
        const response = await fetch(endpoint, { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setProducts(data.products || []);
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) console.error('POS product search failed:', err);
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchTerm, user]);

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.variants.some(v => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || (v.barcode || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addToCart = useCallback(async (variantId: string, productId: string, productName: string, variantName: string, sku: string, price: number, saleUnit: CartItem['saleUnit'] = 'UNIT', packaging: CartItem['packaging'] = 'UNIT', baseUnits = 1) => {
    // Prevent adding to cart before stores are validated
    if (!storesValidated) {
      return;
    }

    setServerTotals(null);
    const numericPrice = parseFloat(String(price));
    const gramsPerSaleUnit = SALE_UNIT_TO_GRAMS;
    const isWeighted = saleUnit !== 'UNIT';
    if (isWeighted && !pendingScaleReading) {
      alert('Lisez d’abord le poids sur la balance avant d’ajouter ce produit.');
      return;
    }
    const quantity = isWeighted ? Math.max(1, Math.round(pendingScaleReading!.weightGrams)) : 1;
    const effectiveUnitPrice = isWeighted ? numericPrice / gramsPerSaleUnit[saleUnit] : numericPrice;
    const existingItem = cart.find(item => item.variantId === variantId && item.packaging === packaging);
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.variantId === variantId && item.packaging === packaging
          ? { ...item, quantity: isWeighted ? quantity : item.quantity + 1, totalPrice: (isWeighted ? quantity : item.quantity + 1) * parseFloat(String(item.unitPrice)) }
          : item
      ));
    } else {
      setCart([...cart, {
        variantId,
        productId,
        productName,
        variantName,
        sku,
        quantity,
        unitPrice: effectiveUnitPrice,
        totalPrice: quantity * effectiveUnitPrice,
        saleUnit,
        packaging,
        baseUnits,
      }]);
      if (isWeighted) setPendingScaleReading(null);
    }

    if (!currentSaleId) {
      if (!currentStoreId) {
        console.error('No store selected');
        return;
      }
      try {
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
          setCurrentSaleId(sale.id);
        } else {
          const errorText = await response.text();
          console.error('[POS][STORE] Failed to create sale:', response.status, errorText);
        }
      } catch (err) {
        console.error('Error creating sale:', err);
      }
    }
  }, [storesValidated, pendingScaleReading, cart, currentSaleId, currentStoreId, generateOrderNumber, selectedCustomer, applyTax]);

  // Keep queued scanner events bound to the latest cart/sale state after React rerenders.
  const addToCartRef = useRef(addToCart);
  useEffect(() => {
    addToCartRef.current = addToCart;
  }, [addToCart]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ take: '100', skip: '0' });
      if (customerSearch.trim()) query.set('search', customerSearch.trim());
      void fetch(`/api/customers?${query.toString()}`, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Chargement des clients refusé (${response.status})`);
          const data = await response.json();
          setCustomers(Array.isArray(data.customers) ? data.customers : []);
        })
        .catch((err) => {
          if (!(err instanceof DOMException && err.name === 'AbortError')) {
            console.error('POS customer list failed:', err);
            setCustomers([]);
          }
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [user, customerSearch]);

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
        const enabled = data.enabled === true;
        setTaxEnabled(enabled);
        setTaxRate(enabled ? Number(data.taxRate) : 0);
        setApplyTax(enabled);
      } else {
        setTaxEnabled(false);
        setTaxRate(null);
        setApplyTax(false);
      }
    } catch {
      setTaxEnabled(false);
      setTaxRate(null);
      setApplyTax(false);
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
    if (!user && !authLoading) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Restore cart state on mount if returning from cash page
  useEffect(() => {
    if (!user || loading || error) return;

    const timer = window.setTimeout(() => {
      restoreCartState();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [user, loading, error, restoreCartState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (stores.length === 0) return;
      if (stores.length === 1 && !currentStoreId) {
        setCurrentStore(stores[0]);
        return;
      }
      if (currentStoreId) {
        const isValidStore = stores.some((s: Store) => s.id === currentStoreId);
        if (!isValidStore) {
          clearCurrentStore();
        } else if (currentStore && (!currentStore.name || !currentStore.code)) {
          const store = stores.find((s) => s.id === currentStoreId);
          if (store) {
            setCurrentStore(store);
          }
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [stores, currentStoreId, currentStore, setCurrentStore, clearCurrentStore]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        document.getElementById('product-search')?.focus();
      }
      if (event.key === 'F12') {
        event.preventDefault();
        handlePayment();
      }
      if (event.key === 'Escape' && showPaymentModal) {
        event.preventDefault();
        setShowPaymentModal(false);
      }

      const activeElement = document.activeElement;
      if (event.key !== 'Enter' || !(activeElement instanceof HTMLInputElement) || activeElement.id !== 'product-search') return;

      const scannedBarcode = activeElement.value.trim();
      if (!scannedBarcode) return;

      event.preventDefault();
      // Clear the controlled input immediately. If another scan arrives while the
      // current lookup/cart update is pending, its Enter event queues the full code.
      activeElement.value = '';
      setSearchTerm('');

      if (barcodeLookupInProgress.current) {
        barcodeQueueRef.current.push(scannedBarcode);
        return;
      }

      barcodeLookupInProgress.current = true;
      void (async () => {
        let nextBarcode: string | undefined = scannedBarcode;
        try {
          while (nextBarcode) {
            const currentBarcode = nextBarcode;
            nextBarcode = undefined;

            try {
              const response = await fetch(`/api/products?barcode=${encodeURIComponent(currentBarcode)}`, { cache: 'no-store' });

              if (response.status === 404) {
                const createProduct = window.confirm('Code-barres inconnu. Voulez-vous créer un produit avec ce code-barres ?');
                if (createProduct) {
                  barcodeQueueRef.current = [];
                  router.push(`/products?newBarcode=${encodeURIComponent(currentBarcode)}`);
                  break;
                }
                nextBarcode = barcodeQueueRef.current.shift();
                continue;
              }

              if (!response.ok) {
                window.alert(response.status === 401 || response.status === 403 || response.status === 402
                  ? 'Vous n’êtes pas autorisé à consulter ce produit ou cette fonctionnalité.'
                  : 'Impossible de vérifier ce code-barres. Réessayez.');
                nextBarcode = barcodeQueueRef.current.shift();
                continue;
              }

              const data = await response.json();
              const product = data.product as Product | undefined;
              const variant = product?.variants?.[0];
              if (!product || !variant) {
                window.alert('Aucune variante disponible ne correspond à ce code-barres.');
                nextBarcode = barcodeQueueRef.current.shift();
                continue;
              }

              await addToCartRef.current(variant.id, product.id, product.name, variant.name, variant.sku, variant.unitPrice ?? variant.price, variant.saleUnit);
              nextBarcode = barcodeQueueRef.current.shift();
            } catch (err) {
              console.error('Barcode lookup failed:', err);
              window.alert('Impossible de vérifier ce code-barres. Vérifiez la connexion puis réessayez.');
              nextBarcode = barcodeQueueRef.current.shift();
            }
          }
        } finally {
          barcodeLookupInProgress.current = false;
          if (document.getElementById('product-search')) {
            window.setTimeout(() => document.getElementById('product-search')?.focus(), 0);
          }
        }
      })();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePayment, showPaymentModal, addToCart, router]);

  if (authLoading || storeLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted">Chargement...</p></div>;
  }

  if (stores.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-lg text-center">
          <p className="text-xl font-semibold text-foreground mb-3">Votre premier magasin reste à configurer</p>
          <p className="text-muted mb-6">
            Votre compte administrateur est prêt. Créez maintenant le premier magasin de votre organisation pour commencer à utiliser le point de vente.
          </p>
          <Button onClick={() => router.push('/onboarding')}>
            Configurer mon premier magasin
          </Button>
        </div>
      </div>
    );
  }

  if (!currentStore) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger text-xl mb-4">Veuillez sélectionner un magasin</p>
          <select
            value=""
            onChange={(e) => {
              const store = stores.find(s => s.id === e.target.value);
              if (store) setCurrentStore(store);
            }}
            className="h-10 px-3 border border-[var(--border)] bg-[var(--surface)] rounded-[var(--radius-md)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
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

  const removeFromCart = (variantId: string, packaging: CartItem['packaging'] = 'UNIT') => {
    setServerTotals(null);
    setCart(cart.filter(item => !(item.variantId === variantId && item.packaging === packaging)));
  };

  const updateQuantity = (variantId: string, quantity: number, packaging: CartItem['packaging'] = 'UNIT') => {
    setServerTotals(null);
    if (quantity <= 0) {
      removeFromCart(variantId, packaging);
      return;
    }
    setCart(cart.map(item =>
      item.variantId === variantId && item.packaging === packaging
        ? { ...item, quantity, totalPrice: quantity * parseFloat(String(item.unitPrice)) }
        : item
    ));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountValue = Math.max(0, Number(discountAmount) || 0);
  const discountedSubtotal = Math.max(0, subtotal - discountValue);
  const displayTax = serverTotals?.tax ?? (taxEnabled && applyTax && taxRate !== null ? discountedSubtotal * taxRate : 0);
  const displayTotal = serverTotals?.total ?? (taxEnabled && applyTax ? discountedSubtotal + displayTax : discountedSubtotal);
  const change = paymentMethod === 'CASH' ? (parseFloat(amountReceived) || 0) - displayTotal : 0;

  const syncCartToSale = async () => {
    if (!currentSaleId) throw new Error('Aucune vente active à synchroniser.');
    const response = await fetch(`/api/sales/${currentSaleId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applyTax,
        discount: discountValue,
        items: cart.map((item) => ({ variantId: item.variantId, quantity: item.quantity, packaging: item.packaging })),
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Impossible de synchroniser le panier: ${response.status} - ${errorText}`);
    }
    const sale = await response.json();
    const totals = { subtotal: Number(sale.subtotal), tax: Number(sale.tax), total: Number(sale.total) };
    setServerTotals(totals);
    return totals;
  };

  const completeSale = async () => {
    if (cart.length === 0 || !currentSaleId) return;
    setIsProcessing(true);
    try {
      // Validate the cashier-entered discount before sending the cart.
      if (discountValue > subtotal) throw new Error('La remise ne peut pas dépasser le sous-total.');
      // Sync cart to ensure server totals are up to date
      const totals = await syncCartToSale();

      // Validate server totals
      if (!totals || totals.total <= 0) {
        throw new Error('Le total serveur de la vente est invalide. Veuillez réessayer.');
      }
      const receivedAmount = parseFloat(amountReceived) || 0;
      if (paymentMethod === 'CASH' && receivedAmount < totals.total) {
        alert(`Montant insuffisant. Minimum requis: ${totals.total.toFixed(2)} HTG`);
        return;
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
          ...(paymentMethod === 'CASH' ? { cashReceived: receivedAmount } : {}),
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Échec du checkout';
        let isCashSessionError = false;
        try {
          const data = await response.json();
          if (typeof data?.error === 'string') {
            errorMessage = data.error;
            isCashSessionError = data.error.includes('open cash session');
          } else if (typeof data?.message === 'string') {
            errorMessage = data.message;
            isCashSessionError = data.message.includes('open cash session');
          }
        } catch {
          // conserver le message générique
        }

        // Special handling for cash session error
        if (isCashSessionError && response.status === 409) {
          const userConfirmed = confirm(
            'La caisse est fermée. Pour finaliser cette vente en espèces, vous devez d\'abord ouvrir la caisse.\n\n' +
            'Voulez-vous aller à la page de caisse pour l\'ouvrir ?\n\n' +
            'Votre panier sera conservé.'
          );
          if (userConfirmed) {
            persistCartState();
            router.push('/cash');
          }
          throw new Error('Caisse fermée');
        }

        throw new Error(errorMessage);
      }

      const completedId = currentSaleId;
      setCart([]);
      setCurrentSaleId(null);
      setCompletedSaleId(completedId);
      setShowPaymentModal(false);
      setAmountReceived('');
      setPaymentMethod('CASH');
      setDiscountAmount('0');
      setSelectedCustomer('');
      setCustomerSearch('');
      setServerTotals(null);
      localStorage.removeItem('omnikes_pending_cart');
      setTimeout(() => {
        const searchInput = document.getElementById('product-search') as HTMLInputElement;
        searchInput?.focus();
      }, 100);
    } catch (error) {
      // Don't show alert for cash session error (user already handled it)
      if (error instanceof Error && error.message === 'Caisse fermée') {
        return;
      }
      // Log unexpected errors only
      if (!(error instanceof Error && error.message === 'Caisse fermée')) {
        console.error('Error completing sale:', error);
      }
      alert(error instanceof Error ? error.message : 'Erreur lors de la validation de la vente');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearCart = () => {
    setCart([]);
    setCurrentSaleId(null);
    setServerTotals(null);
    setDiscountAmount('0');
    setSelectedCustomer('');
    setCustomerSearch('');
    setAmountReceived('');
    setPaymentMethod('CASH');
    localStorage.removeItem('omnikes_pending_cart');
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted">Chargement...</p></div>;
  }

  if (completedSaleId) {
    return (
      <PosReceipt
        saleId={completedSaleId}
        onNewSale={() => {
          setCompletedSaleId(null);
          setTimeout(() => document.getElementById('product-search')?.focus(), 100);
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger mb-4">{error}</p>
          <Button onClick={fetchProducts}>Réessayer</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      <Sidebar 
        compact={isSidebarCompact} 
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--background)]">
        <header className="bg-[var(--surface)] border-b border-[var(--border)] px-4 md:px-6 py-3 flex items-center justify-between shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-4">
            <Logo size={60} />
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-[var(--foreground)]">Point de vente</h1>
              <span className="text-sm text-[var(--muted)]">POS · Vente rapide</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <ScaleReaderPanel
      compact
      onReading={handleScaleReading}
    />

            <select
              value={currentStoreId || ''}
              onChange={(e) => {
                const store = stores.find(s => s.id === e.target.value);
                if (store) setCurrentStore(store);
              }}
              className="h-10 px-3 border border-[var(--border)] bg-[var(--surface)] rounded-[var(--radius-md)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
              aria-label="Sélectionner un magasin"
            >
              <option value="">Sélectionner un magasin</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
              ))}
            </select>
            
            <input
              type="search"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Rechercher un client"
              aria-label="Rechercher un client"
              className="h-10 w-44 px-3 border border-[var(--border)] bg-[var(--surface)] rounded-[var(--radius-md)] text-sm text-[var(--foreground)]"
            />
            <select value={selectedCustomer} onChange={(e) => {
              const customerId = e.target.value;
              if (!currentSaleId) { setSelectedCustomer(customerId); return; }
              void (async () => {
                const response = await fetch(`/api/sales/${currentSaleId}/customer`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ customerId: customerId || null }),
                });
                if (!response.ok) {
                  const data = await response.json().catch(() => ({}));
                  alert(data.error || 'Impossible d’associer ce client à la vente.');
                  return;
                }
                setSelectedCustomer(customerId);
              })();
            }} className="h-10 px-3 border border-[var(--border)] bg-[var(--surface)] rounded-[var(--radius-md)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]" aria-label="Sélectionner un client">
              <option value="">Client anonyme</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
        </header>

        <div className="flex-1 flex min-h-0 overflow-hidden flex-col lg:flex-row">
        <div className="flex-1 min-w-0 p-4 md:p-6 overflow-y-auto">
          <div className="mb-4 md:mb-6">
            <Input
              type="text"
              placeholder="Rechercher par nom, SKU ou code-barres… Scanner puis Entrée (F1)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-base md:text-lg h-14 shadow-[var(--shadow-sm)]"
              id="product-search"
              autoComplete="off"
            />
          </div>

          {products.length === 0 ? (
            <p className="text-center text-muted py-8">Aucun produit disponible</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
              {filteredProducts.map(product =>
                product.variants.map(variant => (
                  <Card
                    key={variant.id}
                    className={`p-4 cursor-pointer border border-[var(--border)] hover:border-[var(--primary)] hover:shadow-[var(--shadow-md)] transition-all active:scale-[0.99] min-h-[168px] flex flex-col justify-between ${!storesValidated ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => storesValidated && addToCart(
                      variant.id,
                      product.id,
                      product.name,
                      variant.name,
                      variant.sku,
                      (variant.unitPrice ?? variant.price),
                      variant.saleUnit
                    )}
                    role="button"
                    tabIndex={storesValidated ? 0 : -1}
                    onKeyDown={(e) => {
                      if (storesValidated && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        addToCart(variant.id, product.id, product.name, variant.name, variant.sku, (variant.unitPrice ?? variant.price), variant.saleUnit);
                      }
                    }}
                    aria-label={`Ajouter ${product.name} - ${variant.name} au panier`}
                  >
                    <div>
                      <h3 className="font-semibold text-[var(--foreground)] text-sm md:text-base">{product.name}</h3>
                      <p className="text-sm text-[var(--muted)]">{variant.name}</p>
                      <p className="text-xs text-[var(--muted)] mt-1">SKU: {variant.sku}</p>{variant.barcode && <p className="text-xs text-[var(--muted)]">Code-barres: {variant.barcode}</p>}
                    </div>
                    <p className="text-lg font-bold text-[var(--primary)] mt-3">{parseFloat(String(variant.unitPrice ?? variant.price)).toFixed(2)} HTG / unité</p>
                    {variant.saleUnit === 'UNIT' && (variant.pack3Price != null || variant.dozenPrice != null || variant.casePrice != null) && (
                      <div className="mt-3 grid grid-cols-2 gap-2" onClick={(event) => event.stopPropagation()}>
                        {variant.pack3Price != null && <button type="button" className="rounded border border-border px-2 py-2 text-xs font-semibold" onClick={(event) => { event.stopPropagation(); void addToCart(variant.id, product.id, product.name, variant.name, variant.sku, Number(variant.pack3Price), variant.saleUnit, 'PACK3', 3); }}>Lot de 3 · {Number(variant.pack3Price).toFixed(2)}</button>}
                        {variant.dozenPrice != null && <button type="button" className="rounded border border-border px-2 py-2 text-xs font-semibold" onClick={(event) => { event.stopPropagation(); void addToCart(variant.id, product.id, product.name, variant.name, variant.sku, Number(variant.dozenPrice), variant.saleUnit, 'DOZEN', 12); }}>Douzaine · {Number(variant.dozenPrice).toFixed(2)}</button>}
                        {variant.casePrice != null && Number(variant.unitsPerCase) > 0 && <button type="button" className="rounded border border-border px-2 py-2 text-xs font-semibold" onClick={(event) => { event.stopPropagation(); void addToCart(variant.id, product.id, product.name, variant.name, variant.sku, Number(variant.casePrice), variant.saleUnit, 'CASE', Number(variant.unitsPerCase)); }}>Caisse ({variant.unitsPerCase}) · {Number(variant.casePrice).toFixed(2)}</button>}
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}
        </div>

        <div data-testid="pos-cart" className="w-full lg:w-[390px] xl:w-[430px] bg-[var(--surface)] border-t lg:border-t-0 lg:border-l border-[var(--border)] flex flex-col shrink-0">
          <div className="p-4 md:p-5 border-b border-[var(--border)]">
            <h2 className="text-lg font-bold text-[var(--foreground)]">Panier</h2>
            <p className="text-sm text-[var(--muted)]">{cart.length} article(s)</p>
          </div>

          <div className="flex-1 min-h-[180px] overflow-y-auto p-4 md:p-5">
            {cart.length === 0 ? (
              <p className="text-center text-muted py-8">Le panier est vide</p>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {cart.map(item => (
                  <div key={`${item.variantId}:${item.packaging}`} className="flex items-center justify-between gap-2 p-3 md:p-4 bg-[var(--surface-muted)] border border-[var(--border)] rounded-[var(--radius-md)]">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground text-sm md:text-base truncate">{item.productName}</h4>
                      <p className="text-xs md:text-sm text-muted truncate">{item.variantName}</p>
                      <p className="text-xs text-muted">{item.sku}</p>
                      <p className="text-xs font-semibold text-primary">{item.packaging === 'CASE' ? `Caisse (${item.baseUnits} unités)` : item.packaging === 'DOZEN' ? 'Douzaine' : item.packaging === 'PACK3' ? 'Lot de 3' : 'Unité'}</p>
                      <p className="text-sm font-medium text-foreground">{item.saleUnit === 'UNIT'
                        ? `${item.unitPrice.toFixed(2)} HTG / ${item.packaging === 'CASE' ? 'caisse' : item.packaging === 'DOZEN' ? 'douzaine' : item.packaging === 'PACK3' ? 'lot de 3' : 'unité'}`
                        : `${(item.unitPrice * SALE_UNIT_TO_GRAMS[item.saleUnit]).toFixed(2)} HTG / ${item.saleUnit}`}</p>
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity - 1, item.packaging)}
                        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-surface-muted rounded-lg hover:bg-border text-lg md:text-xl font-bold transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
                        aria-label={`Réduire la quantité de ${item.productName} (${item.packaging})`}
                        tabIndex={0}
                      >
                        -
                      </button>
                      <span className="w-16 md:w-20 text-center font-medium text-base md:text-lg" aria-live="polite">{formatCartQuantity(item.quantity, item.saleUnit)}</span>
                      <button
                        onClick={() => updateQuantity(item.variantId, item.quantity + 1, item.packaging)}
                        className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-surface-muted rounded-lg hover:bg-border text-lg md:text-xl font-bold transition-colors focus:ring-2 focus:ring-primary focus:outline-none"
                        aria-label={`Augmenter la quantité de ${item.productName} (${item.packaging})`}
                        tabIndex={0}
                      >
                        +
                      </button>
                    </div>

                    <div className="ml-2 md:ml-4 text-right flex-shrink-0">
                      <p className="font-bold text-foreground text-base md:text-lg">{parseFloat(String(item.totalPrice)).toFixed(2)} HTG</p>
                      <button
                        onClick={() => removeFromCart(item.variantId, item.packaging)}
                        className="text-xs md:text-sm text-danger hover:text-danger font-medium py-1 px-2 rounded hover:bg-danger-soft transition-colors focus:ring-2 focus:ring-danger focus:outline-none"
                        aria-label={`Supprimer ${item.productName} du panier`}
                        tabIndex={0}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 md:p-5 border-t border-[var(--border)] bg-[var(--surface-muted)]">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Sous-total</span>
                <span className="font-medium">{parseFloat(String(subtotal)).toFixed(2)} HTG</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <label htmlFor="pos-discount" className="text-muted">Remise (HTG)</label>
                <Input id="pos-discount" type="number" min="0" max={subtotal} step="0.01" value={discountAmount} onChange={(e) => { setServerTotals(null); setDiscountAmount(e.target.value); }} className="h-9 w-32 text-right" />
              </div>
              {discountValue > 0 && <div className="flex justify-between text-sm"><span className="text-muted">Après remise</span><span>{discountedSubtotal.toFixed(2)} HTG</span></div>}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxEnabled && applyTax}
                    disabled={!taxEnabled}
                    onChange={(e) => { setServerTotals(null); setApplyTax(e.target.checked); }}
                    className="w-4 h-4 text-primary rounded disabled:opacity-50"
                  />
                  <span className="text-muted">Appliquer la taxe</span>
                </label>
                <span className="font-medium">
                  {applyTax && taxRate !== null ? `(${parseFloat(String(taxRate * 100)).toFixed(0)}%)` : '(0%)'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Taxe</span>
                <span className="font-medium">{parseFloat(String(displayTax)).toFixed(2)} HTG</span>
              </div>
              <div className="flex justify-between text-base md:text-lg font-bold border-t border-border pt-2">
                <span className="text-[var(--foreground)]">Total</span>
                <span className="text-[var(--foreground)]">{parseFloat(String(displayTotal)).toFixed(2)} HTG</span>
              </div>
            </div>

            <div className="mt-4 flex gap-2 md:gap-3">
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
                Payer (F12)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showPaymentModal && (
        <div 
          className="fixed inset-0 bg-foreground/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPaymentModal(false);
            }
          }}
        >
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-6 w-full max-w-md shadow-[var(--shadow-md)]">
            <div className="flex justify-between items-center mb-4">
              <h2 id="payment-modal-title" className="text-2xl font-bold">Paiement</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-muted hover:text-muted focus:outline-none"
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
            <p className="text-muted mb-4">Total: {parseFloat(String(displayTotal)).toFixed(2)} HTG</p>
            
            <div className="space-y-3 mb-4">
              <button
                onClick={() => setPaymentMethod('CASH')}
                className={`w-full p-4 border rounded-lg text-left text-lg font-medium transition-colors ${paymentMethod === 'CASH' ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-background'}`}
                aria-pressed={paymentMethod === 'CASH'}
              >
                Espèces
              </button>
              <button
                onClick={() => setPaymentMethod('CARD')}
                className={`w-full p-4 border rounded-lg text-left text-lg font-medium transition-colors ${paymentMethod === 'CARD' ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-background'}`}
                aria-pressed={paymentMethod === 'CARD'}
              >
                Carte
              </button>
              <button
                onClick={() => setPaymentMethod('BANK_TRANSFER')}
                className={`w-full p-4 border rounded-lg text-left text-lg font-medium transition-colors ${paymentMethod === 'BANK_TRANSFER' ? 'border-primary bg-primary-soft' : 'border-border-strong hover:bg-background'}`}
                aria-pressed={paymentMethod === 'BANK_TRANSFER'}
              >
                Virement bancaire
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
                <p className="text-sm text-success mt-2 font-medium">Monnaie à rendre: {parseFloat(String(change)).toFixed(2)} HTG</p>
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
