'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Skeleton } from '@omnikes/components/ui/skeleton';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface DashboardStats {
  totalProducts: number;
  totalInventory: number;
  totalStores: number;
}

interface SalesSummary {
  salesCount: number;
  totalRevenue: number;
  averageSale: number;
  currency: string;
}

interface SalesPeriod {
  period: string;
  salesCount: number;
  revenue: number;
}

const statCards = [
  { key: 'totalProducts', label: 'Produits', description: 'Catalogue actif', accent: 'bg-primary-soft text-primary' },
  { key: 'totalInventory', label: 'Stocks', description: 'Références suivies', accent: 'bg-info-soft text-info' },
  { key: 'totalStores', label: 'Magasins', description: 'Points de vente', accent: 'bg-warning-soft text-warning' },
] as const;

function StatGlyph({ type }: { type: typeof statCards[number]['key'] }) {
  if (type === 'totalProducts') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></svg>;
  }
  if (type === 'totalInventory') {
    return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 7h16M5 7l1 13h12l1-13M9 7V4h6v3M9 11v5M15 11v5" /></svg>;
  }
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 10v10h16V10M3 10 5 4h14l2 6M8 20v-6h8v6" /></svg>;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency || 'HTG',
    maximumFractionDigits: 2,
  }).format(value);
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setSalesLoading(true);
      setError(null);

      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 6);

      const todayDate = localDateString(today);
      const periodStartDate = localDateString(startDate);

      const [productsResponse, inventoryResponse, storesResponse, summaryResponse, periodResponse] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/inventory'),
        fetch('/api/stores'),
        fetch(`/api/reports/sales/summary?startDate=${todayDate}&endDate=${todayDate}`),
        fetch(`/api/reports/sales/by-period?startDate=${periodStartDate}&endDate=${todayDate}&granularity=day`),
      ]);

      const productsData = productsResponse.ok ? await productsResponse.json() : { products: [] };
      const inventoryData = inventoryResponse.ok ? await inventoryResponse.json() : { inventory: [] };
      const storesData = storesResponse.ok ? await storesResponse.json() : { stores: [] };

      setStats({
        totalProducts: productsData.products?.length || 0,
        totalInventory: inventoryData.inventory?.length || 0,
        totalStores: storesData.stores?.length || 0,
      });

      if (summaryResponse.ok) {
        setSalesSummary(await summaryResponse.json());
      } else {
        setSalesSummary(null);
      }

      if (periodResponse.ok) {
        setSalesPeriod(await periodResponse.json());
      } else {
        setSalesPeriod([]);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError('Impossible de charger les statistiques');
      setSalesSummary(null);
      setSalesPeriod([]);
    } finally {
      setLoading(false);
      setSalesLoading(false);
    }
  };

  const loadDashboardStats = useEffectEvent(() => {
    if (user) void fetchStats();
  });

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const timeoutId = window.setTimeout(() => loadDashboardStats(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted">Chargement...</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...salesPeriod.map((item) => item.revenue), 0);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar compact={isSidebarCompact} onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)} />

      <div className="flex-1 flex min-w-0 flex-col h-screen overflow-hidden">
        <header className="bg-surface border-b border-border px-5 py-4 md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">OmniKès</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Votre activité</h1>
              <p className="mt-1 text-sm text-muted">Un aperçu simple de votre commerce.</p>
            </div>
            <Button onClick={() => router.push('/')} className="shrink-0">
              Ouvrir le POS
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 md:p-7">
          <div className="mx-auto max-w-7xl space-y-6">
            {error ? (
              <Card className="border-danger/30 bg-danger-soft p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-danger">{error}</p>
                    <p className="mt-1 text-sm text-danger/80">Les données n&apos;ont pas pu être actualisées.</p>
                  </div>
                  <Button variant="outline" onClick={fetchStats}>Réessayer</Button>
                </div>
              </Card>
            ) : null}

            <section aria-labelledby="commercial-title">
              <div className="mb-3">
                <h2 id="commercial-title" className="text-base font-semibold text-foreground">Aujourd&apos;hui</h2>
                <p className="text-sm text-muted">Les indicateurs commerciaux proviennent des ventes réellement finalisées.</p>
              </div>

              {salesLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((item) => (
                    <Card key={item} className="p-5"><Skeleton className="h-20 w-full" /></Card>
                  ))}
                </div>
              ) : salesSummary ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Card className="p-5 shadow-[var(--shadow-sm)]">
                    <p className="text-sm font-medium text-muted">Chiffre d&apos;affaires</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                      {formatMoney(salesSummary.totalRevenue, salesSummary.currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted">Ventes complétées aujourd&apos;hui</p>
                  </Card>
                  <Card className="p-5 shadow-[var(--shadow-sm)]">
                    <p className="text-sm font-medium text-muted">Transactions</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                      {salesSummary.salesCount.toLocaleString('fr-FR')}
                    </p>
                    <p className="mt-1 text-xs text-muted">Ventes complétées aujourd&apos;hui</p>
                  </Card>
                  <Card className="p-5 shadow-[var(--shadow-sm)]">
                    <p className="text-sm font-medium text-muted">Panier moyen</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                      {formatMoney(salesSummary.averageSale, salesSummary.currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted">Montant moyen par transaction</p>
                  </Card>
                </div>
              ) : null}
            </section>

            {salesPeriod.length > 0 ? (
              <section aria-labelledby="trend-title">
                <Card className="p-5 md:p-6">
                  <div className="mb-5">
                    <h2 id="trend-title" className="text-base font-semibold text-foreground">Tendance des ventes</h2>
                    <p className="mt-1 text-sm text-muted">Évolution du chiffre d&apos;affaires sur les 7 derniers jours.</p>
                  </div>
                  <div className="flex h-44 items-end gap-2 sm:gap-3">
                    {salesPeriod.map((item) => {
                      const height = maxRevenue > 0 ? Math.max((item.revenue / maxRevenue) * 100, 4) : 4;
                      const label = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${item.period}T12:00:00`));
                      return (
                        <div key={item.period} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div className="flex h-32 w-full items-end">
                            <div
                              className="w-full rounded-t-[var(--radius-sm)] bg-primary transition-[height] duration-300"
                              style={{ height: `${height}%` }}
                              title={formatMoney(item.revenue, salesSummary?.currency || 'HTG')}
                            />
                          </div>
                          <span className="text-[11px] text-muted">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </section>
            ) : null}

            <section aria-labelledby="overview-title">
              <div className="mb-3">
                <h2 id="overview-title" className="text-base font-semibold text-foreground">Vue d&apos;ensemble</h2>
                <p className="text-sm text-muted">Les chiffres proviennent directement de vos données.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {statCards.map((card) => (
                  <Card key={card.key} className="p-5 shadow-[var(--shadow-sm)]">
                    {loading || !stats ? (
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted">{card.label}</p>
                          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                            {stats[card.key].toLocaleString('fr-FR')}
                          </p>
                          <p className="mt-1 text-xs text-muted">{card.description}</p>
                        </div>
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${card.accent}`}>
                          <StatGlyph type={card.key} />
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>

            <section aria-labelledby="actions-title">
              <Card className="p-5 md:p-6">
                <div className="mb-5">
                  <h2 id="actions-title" className="text-base font-semibold text-foreground">Actions rapides</h2>
                  <p className="mt-1 text-sm text-muted">Accédez directement aux tâches les plus fréquentes.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Button onClick={() => router.push('/')} className="h-14 justify-start px-4">
                    Ouvrir le POS
                  </Button>
                  <Button onClick={() => router.push('/products')} variant="outline" className="h-14 justify-start px-4">
                    Gérer les produits
                  </Button>
                  <Button onClick={() => router.push('/inventory')} variant="outline" className="h-14 justify-start px-4">
                    Consulter les stocks
                  </Button>
                  <Button onClick={() => router.push('/cash')} variant="outline" className="h-14 justify-start px-4">
                    Ouvrir la caisse
                  </Button>
                </div>
              </Card>
            </section>

            <Card className="overflow-hidden border-primary/10 bg-primary-soft/50 p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">Prêt à vendre ?</p>
                  <h2 className="mt-1 text-lg font-bold text-foreground">Passez à l&apos;action en quelques secondes.</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted">Le POS reste au centre de votre journée : recherchez un produit, composez le panier et encaissez.</p>
                </div>
                <Button onClick={() => router.push('/')} className="shrink-0">Commencer une vente</Button>
              </div>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
