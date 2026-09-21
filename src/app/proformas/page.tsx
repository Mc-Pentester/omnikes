'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface Proforma {
  id: string;
  proformaNumber: string;
  customerId?: string;
  customer?: { id: string; name: string };
  storeId: string;
  store?: { id: string; name: string };
  status: string;
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  discount: number;
  applyTax: boolean;
  validUntil?: string;
  notes?: string;
  createdAt: string;
  items: Array<{
    id: string;
    variantId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    variant?: {
      product?: { id: string; name: string };
    };
  }>;
}

export default function ProformasPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchProformas = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/proformas');

      if (!response.ok) {
        throw new Error('Failed to fetch proformas');
      }

      const data = await response.json();
      setProformas(data.proformas || []);
    } catch (err) {
      console.error('Error fetching proformas:', err);
      setError('Impossible de charger les proformas');
      setProformas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProformas();
    }
  }, [user]);

  const handleAccept = async (proformaId: string) => {
    if (!confirm('Accepter cette proforma ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/proformas/${proformaId}/accept`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProformas();
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de l\'acceptation.');
      }
    } catch (err) {
      console.error('Error accepting proforma:', err);
      alert('Erreur lors de l\'acceptation.');
    }
  };

  const handleCancel = async (proformaId: string) => {
    if (!confirm('Annuler cette proforma ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/proformas/${proformaId}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProformas();
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de l\'annulation.');
      }
    } catch (err) {
      console.error('Error cancelling proforma:', err);
      alert('Erreur lors de l\'annulation.');
    }
  };

  const handleConvert = async (proformaId: string, proformaNumber: string, total: number) => {
    if (!confirm(`Convertir la proforma ${proformaNumber} en vente ?\n\nTotal: ${total}\n\nCette action créera une vente sans paiement automatique et sans sortie de stock.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/proformas/${proformaId}/convert`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProformas();
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la conversion.');
      }
    } catch (err) {
      console.error('Error converting proforma:', err);
      alert('Erreur lors de la conversion.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'SENT':
        return 'bg-blue-100 text-blue-800';
      case 'ACCEPTED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'EXPIRED':
        return 'bg-yellow-100 text-yellow-800';
      case 'CONVERTED':
        return 'bg-purple-100 text-purple-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'Brouillon';
      case 'SENT':
        return 'Envoyée';
      case 'ACCEPTED':
        return 'Acceptée';
      case 'REJECTED':
        return 'Refusée';
      case 'EXPIRED':
        return 'Expirée';
      case 'CONVERTED':
        return 'Convertie';
      case 'CANCELLED':
        return 'Annulée';
      default:
        return status;
    }
  };

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
        <p className="text-gray-600">Chargement des proformas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchProformas}>Réessayer</Button>
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
              <h1 className="text-2xl font-bold text-gray-900">Proformas</h1>
              <p className="text-sm text-gray-500">Gérez vos devis et proformas.</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {proformas.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Aucune proforma</h2>
              <p className="text-gray-600">Aucune proforma n'a encore été créée.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Numéro</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Magasin</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {proformas.map((proforma) => (
                      <tr key={proforma.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {proforma.proformaNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {proforma.customer?.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {proforma.store?.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(proforma.status)}`}>
                            {getStatusLabel(proforma.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {typeof proforma.total === 'number' ? proforma.total.toFixed(2) : Number(proforma.total).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(proforma.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex gap-2">
                            {proforma.status === 'SENT' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAccept(proforma.id)}
                              >
                                Accepter
                              </Button>
                            )}
                            {proforma.status === 'ACCEPTED' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConvert(proforma.id, proforma.proformaNumber, proforma.total)}
                              >
                                Convertir
                              </Button>
                            )}
                            {(proforma.status === 'DRAFT' || proforma.status === 'SENT' || proforma.status === 'ACCEPTED') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancel(proforma.id)}
                              >
                                Annuler
                              </Button>
                            )}
                            {proforma.status === 'CONVERTED' && (
                              <span className="text-xs text-gray-400">Convertie</span>
                            )}
                            {proforma.status === 'CANCELLED' && (
                              <span className="text-xs text-gray-400">Annulée</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
