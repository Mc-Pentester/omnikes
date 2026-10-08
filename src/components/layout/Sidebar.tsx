'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { useAuth } from '@omnikes/contexts/AuthContext';

type IconName =
  | 'dashboard' | 'pos' | 'products' | 'sales' | 'cash' | 'proformas' | 'reports'
  | 'inventory' | 'purchases' | 'suppliers' | 'stores' | 'customers' | 'settings' | 'admin' | 'logout';

interface MenuItem {
  id: string;
  label: string;
  icon: IconName;
  path: string;
  available: boolean;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/dashboard', available: true },
  { id: 'pos', label: 'Point de vente', icon: 'pos', path: '/', available: true },
  { id: 'products', label: 'Produits', icon: 'products', path: '/products', available: true },
  { id: 'sales', label: 'Ventes en attente', icon: 'sales', path: '/sales', available: true },
  { id: 'cash', label: 'Caisse', icon: 'cash', path: '/cash', available: true },
  { id: 'proformas', label: 'Proformas', icon: 'proformas', path: '/proformas', available: true },
  { id: 'reports', label: 'Rapports', icon: 'reports', path: '/reports', available: true },
  { id: 'inventory', label: 'Gestion des stocks', icon: 'inventory', path: '/inventory', available: true },
  { id: 'purchases', label: 'Achats', icon: 'purchases', path: '/purchases', available: true },
  { id: 'suppliers', label: 'Fournisseurs', icon: 'suppliers', path: '/suppliers', available: true },
  { id: 'stores', label: 'Magasins', icon: 'stores', path: '/stores', available: true },
  { id: 'customers', label: 'Clients', icon: 'customers', path: '/customers', available: false },
  { id: 'settings', label: 'Paramètres', icon: 'settings', path: '/settings', available: false },
  { id: 'administration', label: 'Administration', icon: 'admin', path: '/administration/users', available: false },
];

function MenuIcon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const common = { className, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };

  const paths: Record<IconName, React.ReactNode> = {
    pos: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></>,
    dashboard: <><path d="M4 13h6V4H4v9Z" /><path d="M14 20h6v-9h-6v9Z" /><path d="M14 8h6V4h-6v4Z" /><path d="M4 20h6v-3H4v3Z" /></>,
    products: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>,
    sales: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M15 3v4h4" /><path d="M9 12h6M9 16h4" /></>,
    cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M7 9h.01M17 15h.01" /></>,
    proformas: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    reports: <><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    inventory: <><path d="M4 7h16M5 7l1 13h12l1-13" /><path d="M9 7V4h6v3M9 11v5M15 11v5" /></>,
    purchases: <><path d="M3 5h2l2 10h10l3-7H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>,
    suppliers: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>,
    stores: <><path d="M4 10v10h16V10" /><path d="M3 10 5 4h14l2 6" /><path d="M8 20v-6h8v6M3 10c1.5 2 3.5 2 5 0 1.5 2 3.5 2 5 0 1.5 2 3.5 2 5 0 1.5 2 3.5 2 5 0" /></>,
    customers: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2 3 5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1A1.7 1.7 0 0 0 8 15a1.7 1.7 0 0 0-1.5-1H6v-2.6h.5A1.7 1.7 0 0 0 8 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    admin: <><path d="M12 3 20 6v5c0 5-3.3 8.4-8 10-4.7-1.6-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></>,
  };

  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

interface SidebarProps {
  compact?: boolean;
  onToggleCompact?: () => void;
}

export function Sidebar({ compact = false, onToggleCompact }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = useAuth();
  const [canAccessAdministration, setCanAccessAdministration] = useState(false);
  const [isCompact, setIsCompact] = useState(compact);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (mounted) setCanAccessAdministration(
          data?.user?.canAccessAdministration === true ||
          data?.user?.canManageStores === true ||
          data?.user?.canManageRoles === true,
        );
      })
      .catch(() => {
        if (mounted) setCanAccessAdministration(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleToggle = () => {
    setIsCompact(!isCompact);
    onToggleCompact?.();
  };

  const handleNavigate = (item: MenuItem) => {
    if (!item.available && !(item.id === 'administration' && canAccessAdministration)) return;
    router.push(item.path);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const availableItems = menuItems.filter(
    (item) => item.available || (item.id === 'administration' && canAccessAdministration),
  );

  const groupedItems = [
    { label: 'Accueil', items: availableItems.filter((item) => item.id === 'dashboard') },
    { label: 'Ventes', items: availableItems.filter((item) => ['pos', 'sales', 'proformas'].includes(item.id)) },
    { label: 'Catalogue', items: availableItems.filter((item) => item.id === 'products') },
    { label: 'Stock', items: availableItems.filter((item) => ['inventory', 'purchases', 'suppliers'].includes(item.id)) },
    { label: 'Finance', items: availableItems.filter((item) => ['cash', 'reports'].includes(item.id)) },
    { label: 'Organisation', items: availableItems.filter((item) => ['stores', 'customers'].includes(item.id)) },
    { label: 'Administration', items: availableItems.filter((item) => ['administration', 'settings'].includes(item.id)) },
  ].filter((group) => group.items.length > 0);

  return (
    <aside
      className={`bg-surface border-r border-border flex flex-col transition-all duration-200 ${isCompact ? 'w-16' : 'w-64'}`}
      role="navigation"
      aria-label="Menu principal"
    >
      <div className="p-4 border-b border-border">
        {isCompact ? (
          <button onClick={handleToggle} className="w-full h-10 flex items-center justify-center rounded-[var(--radius-md)] text-muted hover:bg-surface-muted hover:text-foreground transition-colors" aria-label="Développer le menu">
            <MenuIcon name="dashboard" className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Logo size={40} />
            <button onClick={handleToggle} className="p-2 rounded-[var(--radius-sm)] text-muted hover:bg-surface-muted hover:text-foreground transition-colors" aria-label="Réduire le menu">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3" aria-label="Navigation principale">
        {groupedItems.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {!isCompact && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                {group.label}
              </p>
            )}
            <ul className="space-y-1" role="menu">
              {group.items.map((item) => {
                const active = pathname === item.path || (item.path === '/reports' && pathname.startsWith('/reports'));
                return (
                  <li key={item.id} role="none">
                    <button
                      onClick={() => handleNavigate(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] transition-colors ${active ? 'bg-primary-soft text-primary font-semibold' : 'text-muted hover:bg-surface-muted hover:text-foreground'} ${!item.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                      role="menuitem"
                      aria-current={active ? 'page' : undefined}
                      disabled={!item.available && !(item.id === 'administration' && canAccessAdministration)}
                      title={!item.available && !(item.id === 'administration' && canAccessAdministration) ? 'Module non disponible' : item.label}
                    >
                      <MenuIcon name={item.icon} />
                      {!isCompact && <span className="text-sm">{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        {isCompact ? (
          <button onClick={handleToggle} className="w-full h-10 flex items-center justify-center rounded-[var(--radius-md)] text-muted hover:bg-surface-muted hover:text-foreground transition-colors" aria-label="Développer le menu">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        ) : (
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-muted hover:bg-danger-soft hover:text-danger transition-colors" aria-label="Déconnexion">
            <MenuIcon name="logout" />
            <span className="text-sm font-medium">Déconnexion</span>
          </button>
        )}
      </div>
    </aside>
  );
}
