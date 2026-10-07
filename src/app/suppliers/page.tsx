'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface Supplier {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
}

interface FormData {
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

export default function SuppliersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormData>({ code: '', name: '', email: '', phone: '', address: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState<Record<string, number>>({});
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ take: '100', includeInactive: String(includeInactive) });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch('/api/suppliers?' + params.toString());
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les fournisseurs');
      setSuppliers(data.suppliers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les fournisseurs');
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, [includeInactive, search]);

  useEffect(() => {
    if (user) {
      const timer = window.setTimeout(() => void load(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [user, load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', email: '', phone: '', address: '' });
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setForm({
      code: supplier.code,
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Le code et le nom sont obligatoires.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(editing ? '/api/suppliers/' + editing.id : '/api/suppliers', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Erreur lors de l’enregistrement');
      setShowModal(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (supplier: Supplier) => {
    if (supplier.isActive) {
      if (!confirm('Désactiver ce fournisseur ?')) return;
      await fetch('/api/suppliers/' + supplier.id, { method: 'DELETE' });
    } else {
      await fetch('/api/suppliers/' + supplier.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
    }
    await load();
  };

  const loadBalance = async (supplierId: string) => {
    const response = await fetch('/api/suppliers/' + supplierId + '/balance');
    const data = await response.json().catch(() => ({}));
    if (response.ok) setBalance((current) => ({ ...current, [supplierId]: Number(data.balance || 0) }));
  };

  useEffect(() => {
    if (user && suppliers.length) suppliers.forEach((supplier) => void loadBalance(supplier.id));
  }, [suppliers, user]);

  if (authLoading || !user) return authLoading ? <div className="min-h-screen flex items-center justify-center">Chargement...</div> : null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar compact={compact} onToggleCompact={() => setCompact(!compact)} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4"><Logo size={40}/><div><h1 className="text-2xl font-bold">Fournisseurs</h1><p className="text-sm text-gray-500">Gérez vos fournisseurs et leurs soldes.</p></div></div>
          <Button onClick={openCreate}>+ Nouveau fournisseur</Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6 space-y-4">
          <Card className="p-4 flex flex-col md:flex-row gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }} placeholder="Rechercher par code, nom, email ou téléphone" />
            <Button variant="outline" onClick={() => void load()}>Rechercher</Button>
            <label className="flex items-center gap-2 text-sm whitespace-nowrap"><input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Inclure inactifs</label>
          </Card>
          {error && <Card className="p-4 text-red-600">{error}<Button className="ml-3" variant="outline" onClick={() => void load()}>Réessayer</Button></Card>}
          {loading ? <Card className="p-12 text-center">Chargement des fournisseurs...</Card> : suppliers.length === 0 ? <Card className="p-12 text-center"><h2 className="text-xl font-bold mb-2">Aucun fournisseur</h2><p className="text-gray-600 mb-5">Créez votre premier fournisseur pour commencer les achats.</p><Button onClick={openCreate}>+ Nouveau fournisseur</Button></Card> : (
            <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-gray-50 border-b"><tr>
              {['Code','Fournisseur','Contact','Solde dû','Statut','Actions'].map((h) => <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
            </tr></thead><tbody className="divide-y">
              {suppliers.map((supplier) => <tr key={supplier.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 text-sm font-medium">{supplier.code}</td>
                <td className="px-5 py-4"><div className="font-medium">{supplier.name}</div><div className="text-xs text-gray-500">{supplier.address || '-'}</div></td>
                <td className="px-5 py-4 text-sm"><div>{supplier.phone || '-'}</div><div className="text-xs text-gray-500">{supplier.email || '-'}</div></td>
                <td className="px-5 py-4 text-sm font-semibold">{balance[supplier.id] === undefined ? '—' : balance[supplier.id].toFixed(2) + ' HTG'}</td>
                <td className="px-5 py-4"><span className={'px-2 py-1 rounded-full text-xs font-semibold ' + (supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700')}>{supplier.isActive ? 'Actif' : 'Inactif'}</span></td>
                <td className="px-5 py-4"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(supplier)}>Modifier</Button><Button size="sm" variant="outline" onClick={() => void toggleActive(supplier)}>{supplier.isActive ? 'Désactiver' : 'Activer'}</Button></div></td>
              </tr>)}
            </tbody></table></div></Card>
          )}
        </main>
      </div>
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}>
        <form onSubmit={save} className="space-y-4">
          {formError && <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{formError}</div>}
          <Input placeholder="Code fournisseur *" value={form.code} onChange={(e) => setForm({...form, code:e.target.value})} disabled={!!editing} />
          <Input placeholder="Nom *" value={form.name} onChange={(e) => setForm({...form, name:e.target.value})} />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({...form, email:e.target.value})} />
          <Input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({...form, phone:e.target.value})} />
          <Input placeholder="Adresse" value={form.address} onChange={(e) => setForm({...form, address:e.target.value})} />
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowModal(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
