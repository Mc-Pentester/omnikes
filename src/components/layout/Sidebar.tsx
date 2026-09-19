'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@omnikes/components/ui/button';
import { Logo } from '@omnikes/components/branding/Logo';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  available: boolean;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '�', path: '/dashboard', available: true },
  { id: 'products', label: 'Produits', icon: '📦', path: '/products', available: true },
  { id: 'sales', label: 'Ventes', icon: '🧾', path: '/sales', available: false },
  { id: 'proformas', label: 'Proformas', icon: '📄', path: '/proformas', available: false },
  { id: 'reports', label: 'Rapports', icon: '📊', path: '/reports', available: false },
  { id: 'inventory', label: 'Inventaire', icon: '📦', path: '/inventory', available: true },
  { id: 'stores', label: 'Magasins', icon: '🏪', path: '/stores', available: true },
  { id: 'customers', label: 'Clients', icon: '👥', path: '/customers', available: false },
  { id: 'settings', label: 'Paramètres', icon: '⚙', path: '/settings', available: false },
];

interface SidebarProps {
  compact?: boolean;
  onToggleCompact?: () => void;
}

export function Sidebar({ compact = false, onToggleCompact }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCompact, setIsCompact] = useState(compact);

  const handleToggle = () => {
    setIsCompact(!isCompact);
    onToggleCompact?.();
  };

  const handleNavigate = (item: MenuItem) => {
    if (!item.available) return;
    
    // Navigate to the page
    router.push(item.path);
  };

  const availableItems = menuItems.filter(item => item.available);

  return (
    <aside 
      className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-200 ${
        isCompact ? 'w-16' : 'w-64'
      }`}
      role="navigation"
      aria-label="Menu principal"
    >
      {/* Logo / Toggle */}
      <div className="p-4 border-b border-gray-200">
        {isCompact ? (
          <button
            onClick={handleToggle}
            className="w-full h-12 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            aria-label="Développer le menu"
          >
            <span className="text-xl">☰</span>
          </button>
        ) : (
          <div className="flex items-center justify-between">
            <Logo size={40} />
            <button
              onClick={handleToggle}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Réduire le menu"
            >
              <span className="text-xl">◀</span>
            </button>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1" role="menu">
          {availableItems.map((item) => (
            <li key={item.id} role="none">
              <button
                onClick={() => handleNavigate(item)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  pathname === item.path
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                } ${!item.available ? 'opacity-50 cursor-not-allowed' : ''}`}
                role="menuitem"
                aria-current={pathname === item.path ? 'page' : undefined}
                disabled={!item.available}
                title={!item.available ? 'Module non disponible' : item.label}
              >
                <span className="text-2xl" aria-hidden="true">{item.icon}</span>
                {!isCompact && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer - Toggle button in compact mode */}
      {isCompact && (
        <div className="p-2 border-t border-gray-200">
          <button
            onClick={handleToggle}
            className="w-full h-12 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            aria-label="Développer le menu"
          >
            <span className="text-xl">▶</span>
          </button>
        </div>
      )}
    </aside>
  );
}
