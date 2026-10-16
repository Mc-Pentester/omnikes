'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Badge } from '@omnikes/components/ui/badge';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { EmptyState } from '@omnikes/components/ui/empty-state';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';

interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  country?: string | null;
  isActive: boolean;
}

interface CustomerForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  country: string;
}

const emptyForm: CustomerForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  country: '',
};

export default function CustomersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ take: '100' });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/customers?${params.toString()}`);
      if (!response.ok) {
        if (response.status === 403) throw new Error('Vous n’avez pas la permission de consulter les clients.');
        throw new Error('Impossible de charger les clients.');
      }
      const data = await response.json();
      setCustomers(data.customers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les clients.');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void fetchCustomers(), 200);
    return () => window.clearTimeout(timer);
  }, [user, fetchCustomers]);

  const activeCount = customers.filter((customer) => customer.isActive).length;
  const inactiveCount = customers.length - activeCount;

  const openCreate = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      country: customer.country ?? '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Le nom du client est obligatoire.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(
        editingCustomer ? `/api/customers/${editingCustomer.id}` : '/api/customers',
        {
          method: editingCustomer ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            country: form.country.trim().toUpperCase(),
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(data?.error ?? 'Erreur lors de l’enregistrement du client.');
        return;
      }
      setShowModal(false);
      await fetchCustomers();
    } catch {
      setFormError('Impossible de joindre le serveur.');
    } finally {
      setSubmitting(false);
    }
  };

  const deactivate = async (customer: Customer) => {
    if (!window.confirm(`Désactiver le client « ${customer.name} » ?`)) return;
    const response = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      window.alert(data?.error ?? 'Impossible de désactiver le client.');
      return;
    }
    await fetchCustomers();
  };

  const summaryLabel = useMemo(() => {
    if (!search.trim()) return `${customers.length} client${customers.length > 1 ? 's' : ''}`;
    return `${customers.length} résultat${customers.length > 1 ? 's' : ''}`;
  }, [customers.length, search]);

  if (authLoading || !user) {
    return <div className="min-h-screen bg-surface-muted flex items-center justify-center"><p className="text-muted">Chargement...</p></div>;
  }

  if (loading && customers.length === 0) {
    return <div className="min-h-screen bg-surface-muted flex items-center justify-center"><p className="text-muted">Chargement des clients...</p></div>;
  }

  return (
    <div className="min-h-screen bg-surface-muted flex">
      <Sidebar compact={sidebarCompact} onToggleCompact={() => setSidebarCompact(!sidebarCompact)} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-surface border-b border-border px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Logo size={40} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Organisation</p>
                <h1 className="mt-1 text-2xl font-bold text-foreground">Clients</h1>
                <p className="mt-1 text-sm text-muted">Gérez vos clients et retrouvez-les rapidement au point de vente.</p>
              </div>
            </div>
            <Button onClick={openCreate}>+ Nouveau client</Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {error ? (
            <Card className="p-6 text-center">
              <p className="text-danger mb-4">{error}</p>
              <Button variant="outline" onClick={() => void fetchCustomers()}>Réessayer</Button>
            </Card>
          ) : customers.length === 0 && !search.trim() ? (
            <EmptyState
              title="Aucun client pour le moment"
              description="Créez votre premier client pour l’associer aux ventes et au suivi du crédit."
              actionLabel="Créer un client"
              onAction={openCreate}
              icon="users"
              tone="primary"
            />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-5"><p className="text-sm text-muted">Clients affichés</p><p className="mt-1 text-2xl font-bold text-foreground">{customers.length}</p><p className="mt-1 text-xs text-muted">{summaryLabel}</p></Card>
                <Card className="p-5"><p className="text-sm text-muted">Actifs</p><p className="mt-1 text-2xl font-bold text-success">{activeCount}</p><p className="mt-1 text-xs text-muted">Clients utilisables à la caisse</p></Card>
                <Card className="p-5"><p className="text-sm text-muted">Inactifs</p><p className="mt-1 text-2xl font-bold text-muted">{inactiveCount}</p><p className="mt-1 text-xs text-muted">Conservés pour l’historique</p></Card>
              </div>

              <Card className="p-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom..." aria-label="Rechercher un client" /></div>
                  <Button variant="outline" onClick={() => setSearch('')} disabled={!search}>Réinitialiser</Button>
                </div>
              </Card>

              {customers.length === 0 ? (
                <EmptyState title="Aucun résultat" description="Aucun client ne correspond à votre recherche." actionLabel="Effacer la recherche" onAction={() => setSearch('')} icon="search" tone="neutral" />
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface-muted border-b border-border">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Client</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Téléphone</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Adresse</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Statut</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-surface divide-y divide-border">
                        {customers.map((customer) => (
                          <tr key={customer.id} className="hover:bg-surface-muted">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-foreground">{customer.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{customer.phone || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">{customer.email || '—'}</td>
                            <td className="px-6 py-4 text-sm text-muted max-w-xs truncate">{customer.address || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap"><Badge variant={customer.isActive ? 'success' : 'neutral'}>{customer.isActive ? 'Actif' : 'Inactif'}</Badge></td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => openEdit(customer)}>Modifier</Button>
                                {customer.isActive && <Button variant="outline" size="sm" onClick={() => void deactivate(customer)}>Désactiver</Button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => !submitting && setShowModal(false)}
        title={editingCustomer ? 'Modifier le client' : 'Nouveau client'}
        footer={<><Button variant="outline" onClick={() => setShowModal(false)} disabled={submitting}>Annuler</Button><Button type="submit" form="customer-form" disabled={submitting}>{submitting ? 'Enregistrement...' : 'Enregistrer'}</Button></>}
      >
        <form id="customer-form" onSubmit={submit} className="space-y-4">
          {formError && <div className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{formError}</div>}
          <div><label htmlFor="customer-name" className="mb-1 block text-sm font-medium text-foreground">Nom <span className="text-danger">*</span></label><Input id="customer-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus placeholder="Nom du client" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label htmlFor="customer-phone" className="mb-1 block text-sm font-medium text-foreground">Téléphone</label><Input id="customer-phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+509 ..." /></div>
            <div><label htmlFor="customer-email" className="mb-1 block text-sm font-medium text-foreground">Email</label><Input id="customer-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="client@example.com" /></div>
          </div>
          <div><label htmlFor="customer-address" className="mb-1 block text-sm font-medium text-foreground">Adresse</label><Input id="customer-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Adresse du client" /></div>
          <div><label htmlFor="customer-country" className="mb-1 block text-sm font-medium text-foreground">Pays</label><Input id="customer-country" maxLength={2} value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value.toUpperCase() })} placeholder="HT" /></div>
        </form>
      </Modal>
    </div>
  );
}
