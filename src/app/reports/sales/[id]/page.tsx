'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number;
  variant: {
    id: string;
    sku: string;
    product: {
      name: string;
    };
  };
}

interface Payment {
  id: string;
  method: string;
  amount: number;
  status: string;
  createdAt: string;
  reference?: string;
}

interface Sale {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
  createdAt: string;
  completedAt?: string;
  store: {
    id: string;
    name: string;
    code: string;
  };
  customer?: {
    id: string;
    name: string;
    email?: string;
  };
  items: SaleItem[];
  payments: Payment[];
}

export default function SaleDetailPage() {
  const params = useParams();
  const saleId = params.id as string;
  
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-HT', {
      style: 'currency',
      currency: 'HTG',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-HT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const fetchSale = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/sales/${saleId}`);
      
      if (res.status === 404) {
        setError('Vente introuvable');
        return;
      }
      
      if (res.status === 403) {
        setError('Accès refusé');
        return;
      }
      
      if (!res.ok) {
        throw new Error('Erreur lors du chargement de la vente');
      }

      const data = await res.json();
      setSale(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (saleId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchSale();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar
          compact={isSidebarCompact}
          onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
        />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Détail de la Vente</h1>
            <div className="text-center py-12">
              <div className="text-lg">Chargement...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar
          compact={isSidebarCompact}
          onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
        />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Détail de la Vente</h1>
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
            <div className="mt-4">
              <Link href="/reports/sales" className="text-blue-500 hover:underline">
                ← Retour au rapport des ventes
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar
          compact={isSidebarCompact}
          onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
        />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Détail de la Vente</h1>
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
              Vente introuvable
            </div>
            <div className="mt-4">
              <Link href="/reports/sales" className="text-blue-500 hover:underline">
                ← Retour au rapport des ventes
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalPaid = sale.payments
    .filter(p => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        compact={isSidebarCompact}
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <Link href="/reports/sales" className="text-blue-500 hover:underline">
                ← Retour au rapport des ventes
              </Link>
            </div>
            
            <h1 className="text-3xl font-bold mb-2">Vente #{sale.orderNumber}</h1>
            <p className="text-gray-600 mb-8">
              {formatDate(sale.createdAt)} — {sale.store.name} ({sale.store.code})
            </p>

            {/* Informations générales */}
            <div className="bg-white border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Informations</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Client</div>
                  <div className="font-medium">{sale.customer?.name || 'N/A'}</div>
                  {sale.customer?.email && (
                    <div className="text-sm text-gray-500">{sale.customer.email}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Statut</div>
                  <div className={`font-medium ${
                    sale.status === 'COMPLETED' ? 'text-green-600' :
                    sale.status === 'CANCELLED' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {sale.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Totaux */}
            <div className="bg-white border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Totaux</h2>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sous-total</span>
                  <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Remise</span>
                  <span className="font-medium text-red-600">-{formatCurrency(sale.discount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Taxe ({(sale.taxRate * 100).toFixed(0)}%)</span>
                  <span className="font-medium">{formatCurrency(sale.tax)}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(sale.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lignes de vente */}
            <div className="bg-white border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Lignes de vente</h2>
              {sale.items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Aucune ligne</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Produit</th>
                        <th className="text-left py-2">SKU</th>
                        <th className="text-right py-2">Qté</th>
                        <th className="text-right py-2">Prix unitaire</th>
                        <th className="text-right py-2">Remise</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="py-2">{item.variant.product.name}</td>
                          <td className="py-2 text-gray-600">{item.variant.sku}</td>
                          <td className="text-right py-2">{item.quantity}</td>
                          <td className="text-right py-2">{formatCurrency(item.unitPrice)}</td>
                          <td className="text-right py-2 text-red-600">-{formatCurrency(item.discount)}</td>
                          <td className="text-right py-2 font-medium">{formatCurrency(item.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Paiements */}
            <div className="bg-white border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Paiements</h2>
              {sale.payments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Aucun paiement</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Date</th>
                        <th className="text-left py-2">Méthode</th>
                        <th className="text-right py-2">Montant</th>
                        <th className="text-left py-2">Statut</th>
                        <th className="text-left py-2">Référence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.payments.map((payment) => (
                        <tr key={payment.id} className="border-b">
                          <td className="py-2">{formatDate(payment.createdAt)}</td>
                          <td className="py-2">{payment.method}</td>
                          <td className="text-right py-2 font-medium">{formatCurrency(payment.amount)}</td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              payment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {payment.status}
                            </span>
                          </td>
                          <td className="py-2 text-gray-600">{payment.reference || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex justify-between font-medium">
                      <span>Total payé</span>
                      <span>{formatCurrency(totalPaid)}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-600">Reste à payer</span>
                      <span className={Number(sale.total) - totalPaid > 0 ? 'text-red-600' : 'text-green-600'}>
                        {formatCurrency(Number(sale.total) - totalPaid)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
