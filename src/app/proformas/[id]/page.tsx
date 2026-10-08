'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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

export default function ProformaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proforma, setProforma] = useState<Proforma | null>(null);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchProforma = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/proformas/${params.id}`);

      if (!response.ok) {
        throw new Error('Failed to fetch proforma');
      }

      const data = await response.json();
      setProforma(data);
    } catch (err) {
      console.error('Error fetching proforma:', err);
      setError('Impossible de charger la proforma');
      setProforma(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (user && params.id) void fetchProforma();
    }, 0);
    return () => window.clearTimeout(timer);
    // fetchProforma intentionally captures the current route id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  const handleValidate = async () => {
    if (!confirm('Valider et envoyer cette proforma ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/proformas/${proforma?.id}/validate`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProforma();
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
      } else {
        const data = await response.json();
        alert(data.error || 'Erreur lors de la validation.');
      }
    } catch (err) {
      console.error('Error validating proforma:', err);
      alert('Erreur lors de la validation.');
    }
  };

  const handleAccept = async () => {
    if (!confirm('Accepter cette proforma ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/proformas/${proforma?.id}/accept`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProforma();
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

  const handleCancel = async () => {
    if (!confirm('Annuler cette proforma ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/proformas/${proforma?.id}/cancel`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProforma();
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

  const handleConvert = async () => {
    if (!confirm(`Convertir la proforma ${proforma?.proformaNumber} en vente ?\n\nTotal: ${typeof proforma?.total === 'number' ? proforma.total.toFixed(2) : Number(proforma?.total).toFixed(2)}\n\nCette action créera une vente sans paiement automatique et sans sortie de stock.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/proformas/${proforma?.id}/convert`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchProforma();
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
        return 'bg-surface-muted text-foreground';
      case 'SENT':
        return 'bg-info-soft text-info';
      case 'ACCEPTED':
        return 'bg-success-soft text-success';
      case 'REJECTED':
        return 'bg-danger-soft text-danger';
      case 'EXPIRED':
        return 'bg-warning-soft text-warning';
      case 'CONVERTED':
        return 'bg-primary-soft text-primary';
      case 'CANCELLED':
        return 'bg-surface-muted text-muted';
      default:
        return 'bg-surface-muted text-foreground';
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Chargement de la proforma...</p>
      </div>
    );
  }

  if (error || !proforma) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-danger mb-4">{error || 'Proforma non trouvée'}</p>
          <Button onClick={() => router.push('/proformas')}>Retour</Button>
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
        <header className="bg-surface border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={() => router.push('/proformas')}>
                ← Retour
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Proforma {proforma.proformaNumber}</h1>
                <p className="text-sm text-muted">Détails de la proforma</p>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={`/proformas/${encodeURIComponent(proforma.id)}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 py-2 font-medium transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                Imprimer
              </a>
              {proforma.status === 'DRAFT' && (
                <Button onClick={handleValidate}>
                  Valider
                </Button>
              )}
              {proforma.status === 'SENT' && (
                <Button onClick={handleAccept}>
                  Accepter
                </Button>
              )}
              {proforma.status === 'ACCEPTED' && (
                <Button onClick={handleConvert}>
                  Convertir
                </Button>
              )}
              {(proforma.status === 'DRAFT' || proforma.status === 'SENT' || proforma.status === 'ACCEPTED') && (
                <Button variant="outline" onClick={handleCancel}>
                  Annuler
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Informations générales</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted">Numéro</p>
                    <p className="font-medium">{proforma.proformaNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted">Statut</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(proforma.status)}`}>
                      {getStatusLabel(proforma.status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted">Client</p>
                    <p className="font-medium">{proforma.customer?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted">Magasin</p>
                    <p className="font-medium">{proforma.store?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted">Date de création</p>
                    <p className="font-medium">{new Date(proforma.createdAt).toLocaleDateString('fr-FR')}</p>
                  </div>
                  {proforma.validUntil && (
                    <div>
                      <p className="text-sm text-muted">Valide jusqu&apos;au</p>
                      <p className="font-medium">{new Date(proforma.validUntil).toLocaleDateString('fr-FR')}</p>
                    </div>
                  )}
                </div>
                {proforma.notes && (
                  <div className="mt-4">
                    <p className="text-sm text-muted">Notes</p>
                    <p className="font-medium">{proforma.notes}</p>
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Articles</h2>
                {proforma.items.length === 0 ? (
                  <p className="text-muted">Aucun article</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-background border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Produit</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Quantité</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Prix unitaire</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {proforma.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-sm">
                              {item.variant?.product?.name || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : Number(item.unitPrice).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {typeof item.totalPrice === 'number' ? item.totalPrice.toFixed(2) : Number(item.totalPrice).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Totaux</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted">Sous-total</span>
                    <span className="font-medium">
                      {typeof proforma.subtotal === 'number' ? proforma.subtotal.toFixed(2) : Number(proforma.subtotal).toFixed(2)}
                    </span>
                  </div>
                  {proforma.discount > 0 && (
                    <div className="flex justify-between text-danger">
                      <span>Remise</span>
                      <span className="font-medium">
                        -{typeof proforma.discount === 'number' ? proforma.discount.toFixed(2) : Number(proforma.discount).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {proforma.applyTax && (
                    <div className="flex justify-between">
                      <span className="text-muted">Taxe ({(Number(proforma.taxRate) * 100).toFixed(0)}%)</span>
                      <span className="font-medium">
                        {typeof proforma.tax === 'number' ? proforma.tax.toFixed(2) : Number(proforma.tax).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="border-t pt-3 flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>
                      {typeof proforma.total === 'number' ? proforma.total.toFixed(2) : Number(proforma.total).toFixed(2)}
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Informations fiscales</h2>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted">Appliquer taxe</span>
                    <span className="font-medium">{proforma.applyTax ? 'Oui' : 'Non'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Taux de taxe</span>
                    <span className="font-medium">{(Number(proforma.taxRate) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
