"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, EmptyState, Input } from "@/components/ui";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = async () => {
    try {
      setError(null);
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
      const response = await fetch(`/api/customers${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Impossible de charger les clients.");
      setCustomers(data.customers ?? data.data ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les clients.");
    }
  };

  useEffect(() => { void fetchCustomers(); }, [search]);

  const activeCount = useMemo(() => customers.filter((customer) => customer.isActive).length, [customers]);
  const inactiveCount = customers.length - activeCount;
  const summaryLabel = search.trim() ? "Résultat de la recherche" : "Clients enregistrés";

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-foreground">Clients</h1><p className="text-sm text-muted">Gérez vos clients et leur historique.</p></div>
          <Button onClick={() => void fetchCustomers()}>Actualiser</Button>
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
            onAction={() => undefined}
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
            <Card className="p-4"><div className="flex flex-col gap-3 md:flex-row"><div className="flex-1"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom..." aria-label="Rechercher un client" /></div><Button variant="outline" onClick={() => setSearch("")} disabled={!search}>Réinitialiser</Button></div></Card>
            <Card className="overflow-hidden"><div className="divide-y divide-border">{customers.map((customer) => <div key={customer.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-medium text-foreground">{customer.name}</p><p className="text-sm text-muted">{customer.phone || customer.email || "Aucune coordonnée"}</p></div><span className="text-sm">{customer.isActive ? "Actif" : "Inactif"}</span></div>)}</div></Card>
          </div>
        )}
      </main>
    </div>
  );
}
