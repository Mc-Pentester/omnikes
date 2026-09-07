'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';

interface SalesSummary {
  totalRevenue: number;
  salesCount: number;
  itemsSold: number;
  totalDiscount: number;
  totalTax: number;
  averageSale: number;
}

interface RecentSale {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  createdAt: string;
}

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch sales summary for today
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

        const [summaryResponse, salesResponse, productsResponse] = await Promise.all([
          fetch(`/api/reports/sales/summary?startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}`),
          fetch(`/api/sales?skip=0&take=5`),
          fetch('/api/products'),
        ]);

        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          setSalesSummary(summaryData);
        }

        if (salesResponse.ok) {
          const salesData = await salesResponse.json();
          setRecentSales(salesData.sales || []);
        }

        if (productsResponse.ok) {
          const productsData = await productsResponse.json();
          setProductCount(productsData.products?.length || 0);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Impossible de charger les données');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  if (authLoading) {
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
          <Button onClick={() => window.location.reload()}>Réessayer</Button>
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
            <Logo size={60} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">OmniKès</h1>
              <p className="text-sm text-gray-500">{user.organizationName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user.email}</span>
            <Button onClick={() => router.push('/pos')}>
              💳 Ouvrir la Caisse
            </Button>
            <Button variant="outline" onClick={logout}>
              Déconnexion
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Tableau de bord</h2>
          <p className="text-gray-600">Vue d'ensemble de votre activité commerciale</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-2">Ventes aujourd'hui</div>
            <div className="text-3xl font-bold text-gray-900">
              {salesSummary?.salesCount || 0}
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-2">Chiffre d'affaires</div>
            <div className="text-3xl font-bold text-gray-900">
              {salesSummary ? `${salesSummary.totalRevenue.toFixed(2)} HTG` : '0.00 HTG'}
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-2">Articles vendus</div>
            <div className="text-3xl font-bold text-gray-900">
              {salesSummary?.itemsSold || 0}
            </div>
          </Card>

          <Card className="p-6">
            <div className="text-sm text-gray-600 mb-2">Produits actifs</div>
            <div className="text-3xl font-bold text-gray-900">
              {productCount}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Actions rapides</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={() => router.push('/pos')}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💳</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Caisse / POS</h3>
              </div>
              <p className="text-gray-600">Enregistrer une nouvelle vente</p>
            </Card>

            <Card className="p-6 opacity-50 cursor-not-allowed">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📦</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Inventaire</h3>
              </div>
              <p className="text-gray-600">Gestion des stocks (non disponible)</p>
            </Card>

            <Card className="p-6 opacity-50 cursor-not-allowed">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900">Rapports</h3>
              </div>
              <p className="text-gray-600">Analyse et rapports (non disponible)</p>
            </Card>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Activité récente</h3>
          <Card className="p-6">
            {recentSales.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucune vente récente</p>
            ) : (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{sale.orderNumber}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(sale.createdAt).toLocaleString('fr-HT')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{Number(sale.total).toFixed(2)} HTG</p>
                      <p className="text-sm text-gray-600">{sale.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
