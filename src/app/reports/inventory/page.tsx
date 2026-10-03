'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

type Summary = {
  totalItems: number;
  totalQuantity: number;
  totalReserved: number;
  totalAvailable: number;
  lowStockCount: number;
  inventoryValue: number;
};

type StockRow = {
  inventoryId: string;
  storeName: string;
  storeCode: string;
  productName: string;
  sku: string;
  saleUnit: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitCost: number;
  stockValue: number;
  lowStock: boolean;
  updatedAt: string;
};

type MovementRow = {
  type: string;
  movementCount: number;
  quantity: number;
};

type Store = {
  id: string;
  name: string;
  code: string;
};

const movementLabels: Record<string, string> = {
  SALE: 'Ventes',
  PURCHASE: 'Achats',
  ADJUSTMENT: 'Ajustements',
  TRANSFER_IN: 'Transferts entrants',
  TRANSFER_OUT: 'Transferts sortants',
  RETURN: 'Retours',
};

export default function InventoryReportPage() {
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [storeId, setStoreId] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');

  const formatNumber = (value: number) =>
    new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 2 }).format(value);

  const formatDate = (value: string) =>
    new Date(value).toLocaleString('fr-HT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const loadStores = async () => {
    try {
      const response = await fetch('/api/stores');
      if (response.ok) {
        const data = await response.json();
        setStores(data.stores || []);
      }
    } catch {
      // The report itself remains authoritative; the store selector can stay empty.
    }
  };

  const loadReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (storeId) params.set('storeId', storeId);
      params.set('lowStockThreshold', lowStockThreshold || '5');

      const response = await fetch(`/api/reports/inventory?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Erreur lors du chargement du rapport d’inventaire');
      }

      const data = await response.json();
      setSummary(data.summary);
      setStock(data.stock || []);
      setMovements(data.movements || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    loadReport();
  }, [startDate, endDate, storeId, lowStockThreshold]);

  const setToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  };

  const setLast30Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar compact={compact} onToggleCompact={() => setCompact(!compact)} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <Link href="/reports" className="text-blue-500 hover:underline">
                ← Tous les rapports
              </Link>
            </div>

            <h1 className="text-3xl font-bold mb-2">Rapport d’inventaire</h1>
            <p className="text-gray-600 mb-8">
              État actuel des stocks et mouvements enregistrés sur la période sélectionnée.
            </p>

            <div className="bg-white border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Filtres</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date début</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date fin</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Magasin</label>
                  <select
                    value={storeId}
                    onChange={(event) => setStoreId(event.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Tous les magasins autorisés</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name} ({store.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Seuil stock faible</label>
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    value={lowStockThreshold}
                    onChange={(event) => setLowStockThreshold(event.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={setToday} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                  Aujourd’hui
                </button>
                <button onClick={setLast30Days} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                  30 jours
                </button>
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Réinitialiser
                </button>
              </div>
            </div>

            {loading ? (
              <div className="bg-white border rounded-lg p-12 text-center">Chargement du rapport...</div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                  {[
                    ['Références', summary?.totalItems ?? 0],
                    ['Quantité', summary?.totalQuantity ?? 0],
                    ['Réservé', summary?.totalReserved ?? 0],
                    ['Disponible', summary?.totalAvailable ?? 0],
                    ['Stock faible', summary?.lowStockCount ?? 0],
                    ['Valeur au coût', formatNumber(summary?.inventoryValue ?? 0)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="bg-white border rounded-lg p-5 shadow-sm">
                      <div className="text-sm text-gray-600 mb-1">{label}</div>
                      <div className="text-2xl font-bold">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-white border rounded-lg p-6 mb-8 shadow-sm">
                  <h2 className="text-lg font-semibold mb-4">Mouvements sur la période</h2>
                  {movements.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">Aucun mouvement sur la période sélectionnée.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Type</th>
                            <th className="text-right py-2">Nombre</th>
                            <th className="text-right py-2">Quantité nette</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movements.map((movement) => (
                            <tr key={movement.type} className="border-b">
                              <td className="py-2">{movementLabels[movement.type] || movement.type}</td>
                              <td className="text-right py-2">{movement.movementCount}</td>
                              <td className="text-right py-2">{formatNumber(movement.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h2 className="text-lg font-semibold">État des stocks</h2>
                      <p className="text-sm text-gray-500">Le stock affiché est l’état actuel; les dates filtrent les mouvements.</p>
                    </div>
                    <span className="text-sm text-gray-500">{stock.length} référence(s)</span>
                  </div>

                  {stock.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">Aucun stock trouvé pour les magasins autorisés.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Produit</th>
                            <th className="text-left py-2">SKU</th>
                            <th className="text-left py-2">Magasin</th>
                            <th className="text-right py-2">Stock</th>
                            <th className="text-right py-2">Réservé</th>
                            <th className="text-right py-2">Disponible</th>
                            <th className="text-right py-2">Coût unitaire</th>
                            <th className="text-right py-2">Valeur</th>
                            <th className="text-left py-2">État</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stock.map((row) => (
                            <tr key={row.inventoryId} className="border-b hover:bg-gray-50">
                              <td className="py-2 font-medium">{row.productName}</td>
                              <td className="py-2">{row.sku}</td>
                              <td className="py-2">{row.storeName} ({row.storeCode})</td>
                              <td className="text-right py-2">{row.quantity} {row.saleUnit}</td>
                              <td className="text-right py-2">{row.reservedQuantity}</td>
                              <td className="text-right py-2 font-medium">{row.availableQuantity}</td>
                              <td className="text-right py-2">{formatNumber(row.unitCost)}</td>
                              <td className="text-right py-2">{formatNumber(row.stockValue)}</td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded text-xs ${row.lowStock ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                                  {row.lowStock ? 'Stock faible' : 'Normal'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
