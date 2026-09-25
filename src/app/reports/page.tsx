'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SummaryData {
  totalRevenue: number;
  salesCount: number;
  itemsSold: number;
  totalDiscount: number;
  totalTax: number;
  averageSale: number;
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

export default function SalesReportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [byPeriod, setByPeriod] = useState<PeriodData[]>([]);
  const [byPaymentMethod, setByPaymentMethod] = useState<PaymentMethodData[]>([]);
  const [byStore, setByStore] = useState<StoreData[]>([]);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [storeId, setStoreId] = useState<string>(''); // eslint-disable-line @typescript-eslint/no-unused-vars -- Store filter placeholder for future use
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-HT', {
      style: 'currency',
      currency: 'HTG',
    }).format(amount);
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, storeId, granularity]);

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
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Rapport des Ventes</h1>
          <div className="text-center py-12">
            <div className="text-lg">Chargement des ventes...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Rapport des Ventes</h1>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Rapport des Ventes</h1>

        {/* Filtres */}
        <div className="bg-white border rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Filtres</h2>
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
            <div>
              <label className="block text-sm font-medium mb-1">Période rapide</label>
              <div className="flex gap-2">
                <button
                  onClick={setToday}
                  className="flex-1 bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600"
                >
                  Aujourd&apos;hui
                </button>
                <button
                  onClick={setLast7Days}
                  className="flex-1 bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600"
                >
                  7 jours
                </button>
                <button
                  onClick={setLast30Days}
                  className="flex-1 bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600"
                >
                  30 jours
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* KPI */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white border rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-1">CA Total</div>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
            </div>
            <div className="bg-white border rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-1">Ventes</div>
              <div className="text-2xl font-bold">{summary.salesCount}</div>
            </div>
            <div className="bg-white border rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-1">Panier Moyen</div>
              <div className="text-2xl font-bold">{formatCurrency(summary.averageSale)}</div>
            </div>
            <div className="bg-white border rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-1">Taxes</div>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalTax)}</div>
            </div>
            <div className="bg-white border rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-1">Remises</div>
              <div className="text-2xl font-bold">{formatCurrency(summary.totalDiscount)}</div>
            </div>
          </div>
        )}

        {/* Évolution des ventes */}
        <div className="bg-white border rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Évolution des Ventes</h2>
          {byPeriod.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Aucune donnée disponible</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Période</th>
                    <th className="text-right py-2">Ventes</th>
                    <th className="text-right py-2">CA</th>
                    <th className="text-right py-2">Articles</th>
                    <th className="text-right py-2">Taxes</th>
                    <th className="text-right py-2">Remises</th>
                  </tr>
                </thead>
                <tbody>
                  {byPeriod.map((item) => (
                    <tr key={item.period} className="border-b">
                      <td className="py-2">{item.period}</td>
                      <td className="text-right py-2">{item.salesCount}</td>
                      <td className="text-right py-2">{formatCurrency(item.revenue)}</td>
                      <td className="text-right py-2">{item.itemsSold}</td>
                      <td className="text-right py-2">{formatCurrency(item.tax)}</td>
                      <td className="text-right py-2">{formatCurrency(item.discount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Répartition des paiements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Répartition des Paiements</h2>
            {byPaymentMethod.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Aucune donnée disponible</div>
            ) : (
              <div className="space-y-3">
                {byPaymentMethod.map((item) => (
                  <div key={item.paymentMethod} className="flex justify-between items-center">
                    <span className="font-medium">{item.paymentMethod}</span>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(item.amount)}</div>
                      <div className="text-sm text-gray-600">{item.transactionCount} transactions</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Ventes par Magasin</h2>
            {byStore.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Aucune donnée disponible</div>
            ) : (
              <div className="space-y-3">
                {byStore.map((item) => (
                  <div key={item.storeId} className="flex justify-between items-center">
                    <span className="font-medium">{item.storeName}</span>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(item.revenue)}</div>
                      <div className="text-sm text-gray-600">{item.salesCount} ventes</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8">
          <Link href="/" className="text-blue-500 hover:underline">
            ← Retour au POS
          </Link>
        </div>
      </div>
    </div>
  );
}
