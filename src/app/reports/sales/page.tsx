'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface SummaryData {
  totalRevenue: number;
  salesCount: number;
  itemsSold: number;
  totalDiscount: number;
  totalTax: number;
  averageSale: number;
  totalPaid: number;
  authorizedCredit: number;
  uncoveredAmount: number;
  currency: string;
}

interface PeriodData {
  period: string;
  salesCount: number;
  revenue: number;
  itemsSold: number;
  discount: number;
  tax: number;
}

interface PaymentMethodData {
  paymentMethod: string;
  transactionCount: number;
  amount: number;
}

interface StoreData {
  storeId: string;
  storeName: string;
  salesCount: number;
  revenue: number;
  itemsSold: number;
}

interface Store {
  id: string;
  name: string;
  code: string;
}

interface SaleListItem {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  store: {
    name: string;
    code: string;
  };
  customer?: {
    name: string;
  };
}

export default function SalesReportPage() {
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [byPeriod, setByPeriod] = useState<PeriodData[]>([]);
  const [byPaymentMethod, setByPaymentMethod] = useState<PaymentMethodData[]>([]);
  const [byStore, setByStore] = useState<StoreData[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [salesList, setSalesList] = useState<SaleListItem[]>([]);
  const [showSalesList, setShowSalesList] = useState(false);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [storeId, setStoreId] = useState<string>('');
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [search, setSearch] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(25);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-HT', {
      style: 'currency',
      currency: summary?.currency || 'HTG',
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

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (storeId) params.append('storeId', storeId);

      const [summaryRes, periodRes, paymentRes, storeRes] = await Promise.all([
        fetch(`/api/reports/sales/summary?${params.toString()}`),
        fetch(`/api/reports/sales/by-period?${params.toString()}&granularity=${granularity}`),
        fetch(`/api/reports/sales/by-payment-method?${params.toString()}`),
        fetch(`/api/reports/sales/by-store?${params.toString()}`),
      ]);

      if (!summaryRes.ok || !periodRes.ok || !paymentRes.ok || !storeRes.ok) {
        throw new Error('Erreur lors du chargement des rapports');
      }

      const summaryData = await summaryRes.json();
      const periodData = await periodRes.json();
      const paymentData = await paymentRes.json();
      const storeData = await storeRes.json();

      setSummary(summaryData);
      setByPeriod(periodData);
      setByPaymentMethod(paymentData);
      setByStore(storeData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesList = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      if (paymentMethod) params.append('paymentMethod', paymentMethod);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (storeId) params.append('storeId', storeId);
      params.append('skip', String((page - 1) * pageSize));
      params.append('take', String(pageSize));

      const res = await fetch(`/api/sales?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error('Erreur lors du chargement des ventes');
      }

      const data = await res.json();
      setSalesList(data.sales || []);
      setTotal(data.total || 0);
      setTotalPages(Math.ceil((data.total || 0) / pageSize));
    } catch (err) {
      console.error('Error fetching sales list:', err);
    }
  };

  const handleListSearch = () => {
    setPage(1);
    if (showSalesList) {
      fetchSalesList();
    }
  };

  const handleListReset = () => {
    setSearch('');
    setStatus('');
    setPaymentMethod('');
    setPage(1);
    if (showSalesList) {
      fetchSalesList();
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStores();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, storeId, granularity]);

  useEffect(() => {
    if (showSalesList) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchSalesList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSalesList, page, search, status, paymentMethod, startDate, endDate, storeId]);

  const setToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  };

  const setLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const setLast30Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex">
        <Sidebar
          compact={isSidebarCompact}
          onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
        />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Rapport des Ventes</h1>
            <div className="text-center py-12">
              <div className="text-lg">Chargement des ventes...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex">
        <Sidebar
          compact={isSidebarCompact}
          onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
        />
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Rapport des Ventes</h1>
            <div className="bg-danger-soft border border-danger text-danger px-4 py-3 rounded">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        compact={isSidebarCompact}
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <Link href="/reports" className="text-primary hover:underline">
                ← Tous les rapports
              </Link>
            </div>
            <h1 className="text-3xl font-bold mb-2">Rapport des Ventes</h1>
            <p className="text-muted mb-8">Analyse des ventes, du chiffre d&apos;affaires et des paiements.</p>

            {/* Filtres */}
            <div className="bg-surface border rounded-[var(--radius-lg)] p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Filtres du rapport</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date début</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date fin</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Magasin</label>
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Tous les magasins</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} ({store.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Granularité</label>
                  <select
                    value={granularity}
                    onChange={(e) => setGranularity(e.target.value as 'day' | 'week' | 'month')}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="day">Jour</option>
                    <option value="week">Semaine</option>
                    <option value="month">Mois</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Période rapide</label>
                  <div className="flex gap-2">
                    <button
                      onClick={setToday}
                      className="flex-1 bg-primary text-white px-3 py-2 rounded hover:bg-primary-hover"
                    >
                      Aujourd&apos;hui
                    </button>
                    <button
                      onClick={setLast7Days}
                      className="flex-1 bg-primary text-white px-3 py-2 rounded hover:bg-primary-hover"
                    >
                      7 jours
                    </button>
                    <button
                      onClick={setLast30Days}
                      className="flex-1 bg-primary text-white px-3 py-2 rounded hover:bg-primary-hover"
                    >
                      30 jours
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* KPI */}
            {summary && (
              <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                <div className="bg-surface border rounded-[var(--radius-lg)] p-6 shadow-sm">
                  <div className="text-sm text-muted mb-1">CA Total</div>
                  <div className="text-2xl font-bold text-success">{formatCurrency(summary.totalRevenue)}</div>
                </div>
                <div className="bg-surface border rounded-[var(--radius-lg)] p-6 shadow-sm">
                  <div className="text-sm text-muted mb-1">Ventes</div>
                  <div className="text-2xl font-bold text-info">{summary.salesCount}</div>
                </div>
                <div className="bg-surface border rounded-[var(--radius-lg)] p-6 shadow-sm">
                  <div className="text-sm text-muted mb-1">Panier Moyen</div>
                  <div className="text-2xl font-bold text-info">{formatCurrency(summary.averageSale)}</div>
                </div>
                <div className="bg-surface border rounded-[var(--radius-lg)] p-6 shadow-sm">
                  <div className="text-sm text-muted mb-1">Taxes</div>
                  <div className="text-2xl font-bold text-warning">{formatCurrency(summary.totalTax)}</div>
                </div>
                <div className="bg-surface border rounded-[var(--radius-lg)] p-6 shadow-sm">
                  <div className="text-sm text-muted mb-1">Remises</div>
                  <div className="text-2xl font-bold text-danger">{formatCurrency(summary.totalDiscount)}</div>
                </div>
              </div>
              <div className="bg-surface border rounded-[var(--radius-lg)] p-6 mb-8 shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Rapprochement financier</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted mb-1">Paiements réels</div>
                    <div className="text-xl font-bold">{formatCurrency(summary.totalPaid)}</div>
                    <div className="text-xs text-muted">Paiements COMPLETED hors CREDIT</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted mb-1">Crédit autorisé</div>
                    <div className="text-xl font-bold">{formatCurrency(summary.authorizedCredit)}</div>
                    <div className="text-xs text-muted">SaleCredit AUTHORIZED</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted mb-1">Montant non couvert</div>
                    <div className="text-xl font-bold">{formatCurrency(summary.uncoveredAmount)}</div>
                    <div className="text-xs text-muted">CA complété − paiements réels − crédit autorisé</div>
                  </div>
                </div>
              </div>
              </>
            )}

            {/* Évolution des ventes */}
            <div className="bg-surface border rounded-[var(--radius-lg)] p-6 mb-8 shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Évolution des Ventes</h2>
              {byPeriod.length === 0 ? (
                <div className="text-center py-8 text-muted">Aucune donnée disponible</div>
              ) : (
                <div className="space-y-3">
                  {byPeriod.map((item) => {
                    const maxRevenue = Math.max(...byPeriod.map(p => p.revenue));
                    const percentage = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                    return (
                      <div key={item.period} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{item.period}</span>
                          <span className="text-muted">{formatCurrency(item.revenue)} ({item.salesCount} ventes)</span>
                        </div>
                        <div className="h-4 bg-surface-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-info rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Répartition des paiements */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="bg-surface border rounded-[var(--radius-lg)] p-6 shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Répartition des Paiements</h2>
                {byPaymentMethod.length === 0 ? (
                  <div className="text-center py-8 text-muted">Aucune donnée disponible</div>
                ) : (
                  <div className="space-y-3">
                    {byPaymentMethod.map((item) => {
                      const maxAmount = Math.max(...byPaymentMethod.map(p => p.amount));
                      const percentage = maxAmount > 0 ? (item.amount / maxAmount) * 100 : 0;
                      return (
                        <div key={item.paymentMethod} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{item.paymentMethod}</span>
                            <span className="text-muted">{formatCurrency(item.amount)}</span>
                          </div>
                          <div className="h-3 bg-surface-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-success rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted">{item.transactionCount} transactions</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-surface border rounded-[var(--radius-lg)] p-6 shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Ventes par Magasin</h2>
                {byStore.length === 0 ? (
                  <div className="text-center py-8 text-muted">Aucune donnée disponible</div>
                ) : (
                  <div className="space-y-3">
                    {byStore.map((item) => {
                      const maxRevenue = Math.max(...byStore.map(s => s.revenue));
                      const percentage = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                      return (
                        <div key={item.storeId} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{item.storeName}</span>
                            <span className="text-muted">{formatCurrency(item.revenue)}</span>
                          </div>
                          <div className="h-3 bg-surface-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-info rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted">{item.salesCount} ventes</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Liste des ventes */}
            <div className="bg-surface border rounded-[var(--radius-lg)] p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Liste des Ventes</h2>
                <button
                  onClick={() => setShowSalesList(!showSalesList)}
                  className="bg-primary text-white px-4 py-2 rounded hover:bg-primary-hover"
                >
                  {showSalesList ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              
              {showSalesList && (
                <div>
                  {/* Filtre de recherche de la liste */}
                  <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher une vente par référence ou client..."
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="">Tous les statuts</option>
                        <option value="PENDING">PENDING</option>
                        <option value="CONFIRMED">CONFIRMED</option>
                        <option value="PROCESSING">PROCESSING</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="CANCELLED">CANCELLED</option>
                        <option value="REFUNDED">REFUNDED</option>
                      </select>
                    </div>
                    <div>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="">Tous les paiements</option>
                        <option value="CASH">CASH</option>
                        <option value="CARD">CARD</option>
                        <option value="MOBILE_MONEY">MOBILE_MONEY</option>
                        <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                        <option value="CHECK">CHECK</option>
                        <option value="CREDIT">CREDIT</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleListSearch}
                        className="flex-1 bg-primary text-white px-3 py-2 rounded hover:bg-primary-hover"
                      >
                        Rechercher
                      </button>
                      <button
                        onClick={handleListReset}
                        className="flex-1 bg-surface-muted text-foreground px-3 py-2 rounded hover:bg-primary-hover"
                      >
                        Réinitialiser
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    {salesList.length === 0 ? (
                      <div className="text-center py-8 text-muted">Aucune vente trouvée pour ces critères</div>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Référence</th>
                            <th className="text-left py-2">Date</th>
                            <th className="text-left py-2">Magasin</th>
                            <th className="text-left py-2">Client</th>
                            <th className="text-right py-2">Sous-total</th>
                            <th className="text-right py-2">Remise</th>
                            <th className="text-right py-2">Taxe</th>
                            <th className="text-right py-2">Total</th>
                            <th className="text-left py-2">Statut</th>
                            <th className="text-left py-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesList.map((sale) => (
                            <tr key={sale.id} className="border-b hover:bg-background">
                              <td className="py-2 font-medium">{sale.orderNumber}</td>
                              <td className="py-2">{formatDate(sale.createdAt)}</td>
                              <td className="py-2">{sale.store.name} ({sale.store.code})</td>
                              <td className="py-2">{sale.customer?.name || 'N/A'}</td>
                              <td className="text-right py-2">{formatCurrency(sale.subtotal)}</td>
                              <td className="text-right py-2 text-danger">-{formatCurrency(sale.discount)}</td>
                              <td className="text-right py-2">{formatCurrency(sale.tax)}</td>
                              <td className="text-right py-2 font-medium">{formatCurrency(sale.total)}</td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  sale.status === 'COMPLETED' ? 'bg-success-soft text-success' :
                                  sale.status === 'CANCELLED' ? 'bg-danger-soft text-danger' :
                                  'bg-warning-soft text-warning'
                                }`}>
                                  {sale.status}
                                </span>
                              </td>
                              <td className="py-2">
                                <div className="flex flex-wrap gap-2">
                                  <Link
                                    href={`/reports/sales/${sale.id}`}
                                    className="text-primary hover:underline"
                                  >
                                    Voir
                                  </Link>
                                  {sale.status === 'COMPLETED' && (
                                    <Link
                                      href={`/sales/${sale.id}/receipt`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-success hover:text-success hover:underline font-medium"
                                    >
                                      🧾 Réimprimer
                                    </Link>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex justify-between items-center mt-4">
                      <div className="text-sm text-muted">
                        Page {page} sur {totalPages} ({total} résultats)
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPage(Math.max(1, page - 1))}
                          disabled={page === 1}
                          className="px-4 py-2 border rounded hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ← Précédent
                        </button>
                        <button
                          onClick={() => setPage(Math.min(totalPages, page + 1))}
                          disabled={page === totalPages}
                          className="px-4 py-2 border rounded hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Suivant →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
