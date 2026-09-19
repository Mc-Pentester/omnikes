'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface DashboardStats {
  totalSales: number;
  totalRevenue: number;
  totalProducts: number;
  totalInventory: number;
  totalStores: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch real data from existing APIs
      const [productsResponse, inventoryResponse, storesResponse] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/inventory'),
        fetch('/api/stores'),
      ]);

      const productsData = productsResponse.ok ? await productsResponse.json() : { products: [] };
      const inventoryData = inventoryResponse.ok ? await inventoryResponse.json() : { inventory: [] };
      const storesData = storesResponse.ok ? await storesResponse.json() : { stores: [] };

      setStats({
        totalSales: 0, // Will be implemented when sales API is ready
        totalRevenue: 0, // Will be implemented when sales API is ready
        totalProducts: productsData.products?.length || 0,
        totalInventory: inventoryData.inventory?.length || 0,
        totalStores: storesData.stores?.length || 0,
      });
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError('Impossible de charger les statistiques');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

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
        <p className="text-gray-600">Chargement du Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchStats}>Réessayer</Button>
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
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500">Vue d'ensemble de votre activité</p>
            </div>
            <Button onClick={() => router.push('/')}>
              🛒 Ouvrir le POS
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Produits</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.totalProducts || 0}</p>
                </div>
                <div className="text-3xl">📦</div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Inventaire</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.totalInventory || 0}</p>
                </div>
                <div className="text-3xl">📊</div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Magasins</p>
                  <p className="text-2xl font-bold text-gray-900">{stats?.totalStores || 0}</p>
                </div>
                <div className="text-3xl">🏪</div>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Actions rapides</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Button 
                onClick={() => router.push('/')}
                className="h-20 text-lg"
              >
                🛒 Ouvrir le POS
              </Button>
              <Button 
                onClick={() => router.push('/products')}
                variant="outline"
                className="h-20 text-lg"
              >
                📦 Produits
              </Button>
              <Button 
                onClick={() => router.push('/inventory')}
                variant="outline"
                className="h-20 text-lg"
              >
                📊 Inventaire
              </Button>
              <Button 
                onClick={() => router.push('/stores')}
                variant="outline"
                className="h-20 text-lg"
              >
                🏪 Magasins
              </Button>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}
