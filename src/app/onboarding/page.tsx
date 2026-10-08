'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';
import { Badge } from '@omnikes/components/ui/badge';

interface Store {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

interface Product {
  id: string;
}

type Step = 0 | 1 | 2 | 3;

const steps = [
  { title: 'Votre activité', description: 'Préparez votre espace OmniKès.' },
  { title: 'Votre magasin', description: 'Configurez votre premier point de vente.' },
  { title: 'Vos produits', description: 'Ajoutez les articles que vous vendez.' },
  { title: 'Votre première vente', description: 'Passez naturellement du réglage à l’action.' },
] as const;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [storeError, setStoreError] = useState<string | null>(null);
  const [isCreatingStore, setIsCreatingStore] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      const [storesResponse, productsResponse] = await Promise.all([
        fetch('/api/stores?isActive=true'),
        fetch('/api/products'),
      ]);

      const storesData = storesResponse.ok ? await storesResponse.json() : { stores: [] };
      const productsData = productsResponse.ok ? await productsResponse.json() : { products: [] };

      const activeStores: Store[] = Array.isArray(storesData.stores) ? storesData.stores : [];
      const productList: Product[] = Array.isArray(productsData.products) ? productsData.products : [];

      setStores(activeStores);
      setProducts(productList);
      setSelectedStoreId((current) => current || activeStores[0]?.id || '');
    } catch {
      setStores([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void fetchProgress();
  }, [user, fetchProgress]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const completed = useMemo(
    () => ({
      activity: !!user,
      store: stores.length > 0,
      products: products.length > 0,
    }),
    [user, stores.length, products.length],
  );

  const handleCreateStore = async (event: React.FormEvent) => {
    event.preventDefault();
    setStoreError(null);

    const name = storeName.trim();
    const code = storeCode.trim();

    if (!name || !code) {
      setStoreError('Le nom et le code du magasin sont obligatoires.');
      return;
    }

    setIsCreatingStore(true);
    try {
      const response = await fetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          code,
          address: '',
          city: '',
          country: '',
          phone: '',
          email: '',
        }),
      });

      if (response.status === 403) {
        setStoreError('Vous n’avez pas les droits nécessaires pour créer un magasin.');
        return;
      }

      if (response.status === 409) {
        setStoreError('Ce code magasin existe déjà dans votre organisation.');
        return;
      }

      if (!response.ok) {
        setStoreError('Impossible de créer le magasin pour le moment.');
        return;
      }

      const data = await response.json();
      setStoreName('');
      setStoreCode('');
      await fetchProgress();
      if (data?.store?.id) setSelectedStoreId(data.store.id);
      setStep(2);
    } catch {
      setStoreError('Impossible de créer le magasin pour le moment.');
    } finally {
      setIsCreatingStore(false);
    }
  };

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted">Préparation de votre espace...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 md:px-8 md:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">OmniKès</p>
              <p className="text-sm text-muted">Mise en route</p>
            </div>
          </div>
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>Passer à l’espace de travail</Button>
        </header>

        <div className="flex-1 py-10 md:py-14">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8">
              <div className="mb-4 flex items-center justify-between gap-4">
                <Badge variant="info">Étape {step + 1} sur {steps.length}</Badge>
                <span className="text-xs text-muted">{Math.round(((step + 1) / steps.length) * 100)} %</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-label={'Progression : ' + (step + 1) + ' sur ' + steps.length}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: ((step + 1) / steps.length) * 100 + '%' }} />
              </div>
            </div>

            <Card className="overflow-hidden shadow-[var(--shadow-md)]">
              <div className="border-b border-border bg-surface-muted/60 px-6 py-7 md:px-8">
                <p className="text-sm font-semibold text-primary">Bienvenue dans OmniKès</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{steps[step].title}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{steps[step].description}</p>
              </div>

              <div className="px-6 py-7 md:px-8">
                {step === 0 && (
                  <div className="space-y-6">
                    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
                      <p className="text-sm text-muted">Compte connecté</p>
                      <p className="mt-1 text-lg font-semibold text-foreground">{user.email}</p>
                      <p className="mt-2 text-sm text-muted">Votre compte est prêt. Nous allons maintenant configurer uniquement les éléments nécessaires pour commencer à vendre.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        ['Votre activité', completed.activity],
                        ['Votre magasin', completed.store],
                        ['Vos produits', completed.products],
                      ].map(([label, done]) => (
                        <div key={String(label)} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-4">
                          <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' + (done ? 'bg-success-soft text-success' : 'bg-surface-muted text-muted')}>
                            {done ? <CheckIcon /> : <span className="text-sm">•</span>}
                          </span>
                          <span className="text-sm font-medium text-foreground">{String(label)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted">Aucun exemple fictif n’est ajouté : les données créées pendant cette mise en route sont les vôtres.</p>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-6">
                    {stores.length > 0 ? (
                      <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success-soft p-5">
                        <p className="text-sm font-semibold text-success">Votre magasin est déjà configuré.</p>
                        <p className="mt-1 text-sm text-success/80">Vous pouvez continuer sans recréer de données.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {stores.map((store) => (
                            <button
                              key={store.id}
                              type="button"
                              onClick={() => setSelectedStoreId(store.id)}
                              className={'rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium transition-colors ' + (selectedStoreId === store.id ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-foreground hover:bg-surface-muted')}
                            >
                              {store.name} · {store.code}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleCreateStore} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="store-name" className="mb-2 block text-sm font-medium text-foreground">Nom du magasin</label>
                            <Input id="store-name" value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Ex. Boutique principale" required disabled={isCreatingStore} />
                          </div>
                          <div>
                            <label htmlFor="store-code" className="mb-2 block text-sm font-medium text-foreground">Code magasin</label>
                            <Input id="store-code" value={storeCode} onChange={(event) => setStoreCode(event.target.value)} placeholder="Ex. MAG-01" required disabled={isCreatingStore} />
                          </div>
                        </div>
                        {storeError && <p className="text-sm text-danger" role="alert">{storeError}</p>}
                        <Button type="submit" disabled={isCreatingStore}>{isCreatingStore ? 'Création...' : 'Créer mon magasin'}</Button>
                      </form>
                    )}
                    {stores.length > 0 && (
                      <p className="text-sm text-muted">Vous pourrez compléter l’adresse, le téléphone et les autres informations dans la gestion des magasins.</p>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div className={'rounded-[var(--radius-lg)] border p-5 ' + (products.length > 0 ? 'border-success/20 bg-success-soft' : 'border-border bg-surface')}>
                      <p className="text-sm font-semibold text-foreground">{products.length > 0 ? products.length + ' produit(s) déjà disponible(s)' : 'Votre catalogue est encore vide'}</p>
                      <p className="mt-1 text-sm text-muted">{products.length > 0 ? 'Vous pouvez utiliser votre catalogue existant pour passer à la première vente.' : 'Ajoutez au moins un produit réel avant de passer à la caisse.'}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => router.push('/products')}>Gérer les produits <ArrowIcon /></Button>
                      <Button variant="outline" onClick={() => setStep(3)} disabled={products.length === 0}>Continuer</Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="rounded-[var(--radius-lg)] border border-primary/20 bg-primary-soft p-6">
                      <p className="text-sm font-semibold text-primary">Tout est prêt.</p>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">Passez votre première vente réelle.</p>
                      <p className="mt-2 text-sm leading-6 text-muted">Votre magasin et votre catalogue sont en place. Ouvrez le POS pour rechercher un produit, constituer le panier et encaisser.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => router.push('/')}>Ouvrir le POS <ArrowIcon /></Button>
                      <Button variant="outline" onClick={() => router.push('/dashboard')}>Voir le tableau de bord</Button>
                    </div>
                  </div>
                )}
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/40 px-6 py-4 md:px-8">
                <Button variant="ghost" onClick={() => setStep((current) => Math.max(0, current - 1) as Step)} disabled={step === 0}>Retour</Button>
                {step < 3 && (
                  <Button
                    onClick={() => setStep((current) => Math.min(3, current + 1) as Step)}
                    disabled={(step === 1 && stores.length === 0) || (step === 2 && products.length === 0)}
                  >
                    Continuer <ArrowIcon />
                  </Button>
                )}
              </footer>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
