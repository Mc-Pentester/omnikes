'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Logo } from '@omnikes/components/branding/Logo';
import { Sidebar } from '@omnikes/components/layout/Sidebar';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { EmptyState } from '@omnikes/components/ui/empty-state';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  creditLimit?: string | number | null;
};

export default function CustomersPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '', city: '', creditLimit: '' });
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [limitValue, setLimitValue] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);
  const [limitError, setLimitError] = useState('');

  const fetchCustomers = useCallback(async () => {
    try {
      setError(null);
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const response = await fetch(`/api/customers${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Impossible de charger les clients.');
      setCustomers(data.customers ?? data.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger les clients.');
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCustomers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchCustomers]);

  const closeCreateModal = () => {
    if (isCreating) return;
    setShowCreateModal(false);
    setCreateError(null);
  };

  const openCreateModal = () => {
    setCreateError(null);
    setNewCustomer({ name: '', phone: '', email: '', address: '', city: '', creditLimit: '' });
    setShowCreateModal(true);
  };

  const handleCreateCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newCustomer.name.trim()) {
      setCreateError('Le nom du client est obligatoire.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
          email: newCustomer.email.trim(),
          address: newCustomer.address.trim(),
          city: newCustomer.city.trim(),
          ...(user?.canManageCreditLimit && newCustomer.creditLimit.trim() ? { creditLimit: Number(newCustomer.creditLimit) } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || (response.status === 403
          ? 'Vous n’avez pas la permission de créer un client.'
          : 'Impossible de créer le client.'));
      }

      setCustomers((current) => [data, ...current.filter((customer) => customer.id !== data.id)]);
      setSearch('');
      setShowCreateModal(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '', city: '' });
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Erreur lors de la création du client.');
    } finally {
      setIsCreating(false);
    }
  };

  const saveCreditLimit = async (customer: Customer) => {
    setLimitSaving(true);
    setLimitError('');
    try {
      const response = await fetch('/api/customers/' + customer.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditLimit: limitValue.trim() ? Number(limitValue) : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier le plafond.');
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, creditLimit: data.creditLimit } : item));
      setEditingLimitId(null);
    } catch (cause) {
      setLimitError(cause instanceof Error ? cause.message : 'Impossible de modifier le plafond.');
    } finally {
      setLimitSaving(false);
    }
  };

  const activeCount = useMemo(() => customers.filter((customer) => customer.isActive).length, [customers]);
  const inactiveCount = customers.length - activeCount;
  const summaryLabel = search.trim() ? 'Résultat de la recherche' : 'Clients enregistrés';

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        compact={isSidebarCompact}
        onToggleCompact={() => setIsSidebarCompact((current) => !current)}
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <header className="bg-surface border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo size={40} />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Clients</h1>
              <p className="text-sm text-muted">Gérez vos clients et leur historique.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.canViewCredit && <a href="/credits" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted">Crédits clients</a>}
            <Button variant="outline" onClick={() => void fetchCustomers()}>Actualiser</Button>
            <Button onClick={openCreateModal}>Créer un client</Button>
          </div>
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
            onAction={openCreateModal}
            icon="store"
            tone="primary"
          />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="p-5"><p className="text-sm text-muted">Clients affichés</p><p className="mt-1 text-2xl font-bold text-foreground">{customers.length}</p><p className="mt-1 text-xs text-muted">{summaryLabel}</p></Card>
              <Card className="p-5"><p className="text-sm text-muted">Actifs</p><p className="mt-1 text-2xl font-bold text-success">{activeCount}</p><p className="mt-1 text-xs text-muted">Clients utilisables à la caisse</p></Card>
              <Card className="p-5"><p className="text-sm text-muted">Inactifs</p><p className="mt-1 text-2xl font-bold text-muted">{inactiveCount}</p><p className="mt-1 text-xs text-muted">Conservés pour l’historique</p></Card>
            </div>
            <Card className="p-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="flex-1"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom..." aria-label="Rechercher un client" /></div>
                <Button variant="outline" onClick={() => setSearch('')} disabled={!search}>Réinitialiser</Button>
              </div>
            </Card>
            <Card className="overflow-hidden">
              <div className="divide-y divide-border">
                {customers.map((customer) => (
                  <div key={customer.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{customer.name}</p>
                      <p className="text-sm text-muted">{customer.phone || customer.email || 'Aucune coordonnée'}</p>
                      <p className="text-xs text-muted">Plafond crédit : {customer.creditLimit === null || customer.creditLimit === undefined ? 'Sans plafond' : Number(customer.creditLimit).toFixed(2)}</p>
                      {user?.canManageCreditLimit && editingLimitId === customer.id && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Input type="number" min="0" step="0.01" value={limitValue} onChange={(event) => setLimitValue(event.target.value)} placeholder="Vide = sans plafond" />
                          <Button size="sm" disabled={limitSaving} onClick={() => void saveCreditLimit(customer)}>{limitSaving ? 'Enregistrement…' : 'Enregistrer'}</Button>
                          <Button size="sm" variant="outline" disabled={limitSaving} onClick={() => setEditingLimitId(null)}>Annuler</Button>
                        </div>
                      )}
                      {user?.canManageCreditLimit && editingLimitId !== customer.id && (
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => { setEditingLimitId(customer.id); setLimitValue(customer.creditLimit === null || customer.creditLimit === undefined ? '' : String(customer.creditLimit)); setLimitError(''); }}>Modifier le plafond</Button>
                      )}
                      {editingLimitId === customer.id && limitError && <p className="mt-1 text-xs text-danger">{limitError}</p>}
                    </div>
                    <span className="shrink-0 text-sm">{customer.isActive ? 'Actif' : 'Inactif'}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </main>
      </div>

      <Modal isOpen={showCreateModal} onClose={closeCreateModal} title="Créer un client" closeOnOverlayClick={!isCreating} closeOnEscape={!isCreating}>
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div>
            <label htmlFor="customer-name" className="mb-1 block text-sm font-medium text-foreground">Nom complet *</label>
            <Input id="customer-name" value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} required maxLength={200} autoFocus placeholder="Nom du client" />
          </div>
          <div>
            <label htmlFor="customer-phone" className="mb-1 block text-sm font-medium text-foreground">Téléphone</label>
            <Input id="customer-phone" type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} maxLength={50} placeholder="Numéro de téléphone" />
          </div>
          <div>
            <label htmlFor="customer-email" className="mb-1 block text-sm font-medium text-foreground">E-mail</label>
            <Input id="customer-email" type="email" value={newCustomer.email} onChange={(event) => setNewCustomer((current) => ({ ...current, email: event.target.value }))} maxLength={320} placeholder="adresse@exemple.com" />
          </div>
          <div>
            <label htmlFor="customer-address" className="mb-1 block text-sm font-medium text-foreground">Adresse</label>
            <Input id="customer-address" value={newCustomer.address} onChange={(event) => setNewCustomer((current) => ({ ...current, address: event.target.value }))} maxLength={500} placeholder="Adresse du client" />
          </div>
          <div>
            <label htmlFor="customer-city" className="mb-1 block text-sm font-medium text-foreground">Ville</label>
            <Input id="customer-city" value={newCustomer.city} onChange={(event) => setNewCustomer((current) => ({ ...current, city: event.target.value }))} maxLength={120} placeholder="Ville" />
          </div>
          {user?.canManageCreditLimit && (
            <div>
              <label htmlFor="customer-credit-limit" className="mb-1 block text-sm font-medium text-foreground">Plafond de crédit (facultatif)</label>
              <Input id="customer-credit-limit" type="number" min="0" step="0.01" value={newCustomer.creditLimit} onChange={(event) => setNewCustomer((current) => ({ ...current, creditLimit: event.target.value }))} placeholder="Sans plafond" />
            </div>
          )}
          {createError ? <p role="alert" className="text-sm text-danger">{createError}</p> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={closeCreateModal} disabled={isCreating}>Annuler</Button>
            <Button type="submit" disabled={isCreating}>{isCreating ? 'Création…' : 'Enregistrer le client'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
