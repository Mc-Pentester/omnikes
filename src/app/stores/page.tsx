'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { Modal } from '@omnikes/components/ui/modal';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface Store {
  id: string;
  name: string;
  code: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

interface StoreFormData {
  name: string;
  code: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
}

export default function StoresPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [formData, setFormData] = useState<StoreFormData>({
    name: '',
    code: '',
    address: '',
    city: '',
    country: '',
    phone: '',
    email: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const fetchStores = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/stores');
      
      if (!response.ok) {
        throw new Error('Failed to fetch stores');
      }
      
      const data = await response.json();
      setStores(data.stores || []);
    } catch (err) {
      console.error('Error fetching stores:', err);
      setError('Impossible de charger les magasins');
      setStores([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStores();
    }
  }, [user]);

  const handleCreate = () => {
    setModalMode('create');
    setFormData({
      name: '',
      code: '',
      address: '',
      city: '',
      country: '',
      phone: '',
      email: '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleEdit = (store: Store) => {
    setModalMode('edit');
    setSelectedStore(store);
    setFormData({
      name: store.name,
      code: store.code,
      address: store.address || '',
      city: store.city || '',
      country: store.country || '',
      phone: store.phone || '',
      email: store.email || '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleActivate = async (storeId: string) => {
    try {
      const response = await fetch(`/api/stores/${storeId}/activate`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchStores();
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
      } else {
        alert('Erreur lors de l\'activation du magasin.');
      }
    } catch (err) {
      console.error('Error activating store:', err);
      alert('Erreur lors de l\'activation du magasin.');
    }
  };

  const handleDeactivate = async (storeId: string) => {
    if (!confirm('Voulez-vous vraiment désactiver ce magasin ?')) {
      return;
    }

    try {
      const response = await fetch(`/api/stores/${storeId}/deactivate`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchStores();
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
      } else {
        alert('Erreur lors de la désactivation du magasin.');
      }
    } catch (err) {
      console.error('Error deactivating store:', err);
      alert('Erreur lors de la désactivation du magasin.');
    }
  };

  const handleDelete = async (storeId: string) => {
    if (!confirm('Voulez-vous vraiment SUPPRIMER définitivement ce magasin ? Cette action est irréversible et supprimera toutes les données associées.')) {
      return;
    }

    try {
      const response = await fetch(`/api/stores/${storeId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchStores();
      } else if (response.status === 403) {
        alert('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
      } else {
        alert('Erreur lors de la suppression du magasin.');
      }
    } catch (err) {
      console.error('Error deleting store:', err);
      alert('Erreur lors de la suppression du magasin.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    // Basic validation
    if (!formData.name.trim()) {
      setFormError('Le nom du magasin est obligatoire.');
      setIsSubmitting(false);
      return;
    }

    if (!formData.code.trim()) {
      setFormError('Le code magasin est obligatoire.');
      setIsSubmitting(false);
      return;
    }

    if (formData.email && !formData.email.includes('@')) {
      setFormError('L\'email doit être valide.');
      setIsSubmitting(false);
      return;
    }

    try {
      const url = modalMode === 'create' 
        ? '/api/stores'
        : `/api/stores/${selectedStore?.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PATCH';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.status === 409) {
        setFormError('Ce code magasin existe déjà dans votre organisation.');
        setIsSubmitting(false);
        return;
      }

      if (response.status === 403) {
        setFormError('Vous n\'avez pas les droits nécessaires pour effectuer cette action.');
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        setFormError('Erreur lors de l\'enregistrement du magasin.');
        setIsSubmitting(false);
        return;
      }

      setShowModal(false);
      await fetchStores();
    } catch (err) {
      console.error('Error saving store:', err);
      setFormError('Erreur lors de l\'enregistrement du magasin.');
    } finally {
      setIsSubmitting(false);
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
        <p className="text-gray-600">Chargement des magasins...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchStores}>Réessayer</Button>
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
            <div className="flex items-center gap-4">
              <Logo size={40} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Magasins</h1>
                <p className="text-sm text-gray-500">Gérez les magasins de votre organisation.</p>
              </div>
            </div>
            <Button onClick={handleCreate}>+ Nouveau magasin</Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {stores.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Aucun magasin</h2>
              <p className="text-gray-600 mb-6">Aucun magasin n'est encore configuré pour votre organisation.</p>
              <Button onClick={handleCreate}>+ Créer un magasin</Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nom</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ville</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stores.map((store) => (
                      <tr key={store.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{store.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{store.code}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{store.city || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{store.phone || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            store.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {store.isActive ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(store)}
                            >
                              Modifier
                            </Button>
                            {store.isActive ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeactivate(store.id)}
                              >
                                Désactiver
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleActivate(store.id)}
                              >
                                Activer
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(store.id)}
                            >
                              Supprimer
                            </Button>
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

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalMode === 'create' ? 'Créer un magasin' : 'Modifier le magasin'}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              form="store-form"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Enregistrement...' : modalMode === 'create' ? 'Créer' : 'Enregistrer'}
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {formError}
          </div>
        )}

        <form id="store-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nom du magasin *
            </label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nom du magasin"
              required
            />
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
              Code magasin *
            </label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="CODE"
              required
            />
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
              Adresse
            </label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Adresse"
            />
          </div>

          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
              Ville
            </label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Ville"
            />
          </div>

          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
              Pays
            </label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="Pays"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Téléphone
            </label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+509 XXXX XXXX"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@exemple.com"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
