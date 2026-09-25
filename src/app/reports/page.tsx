'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@omnikes/components/layout/Sidebar';

interface ReportCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  path: string;
  available: boolean;
}

const reports: ReportCard[] = [
  {
    id: 'sales',
    title: 'Rapport des ventes',
    description: "Analyse du chiffre d'affaires et des ventes",
    icon: '📊',
    path: '/reports/sales',
    available: true,
  },
  {
    id: 'inventory',
    title: "Rapport d'inventaire",
    description: 'Analyse des stocks et mouvements',
    icon: '📦',
    path: '#',
    available: false,
  },
  {
    id: 'products',
    title: 'Rapport des produits',
    description: 'Analyse des performances produits',
    icon: '🏷️',
    path: '#',
    available: false,
  },
  {
    id: 'fiscal',
    title: 'Rapport fiscal',
    description: 'Analyse des taxes et obligations fiscales',
    icon: '🧾',
    path: '#',
    available: false,
  },
];

export default function ReportsPage() {
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        compact={isSidebarCompact}
        onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-2">Rapports</h1>
            <p className="text-gray-600 mb-8">Analysez les données de votre organisation.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className={`bg-white border rounded-lg p-6 ${
                    report.available ? 'hover:shadow-lg transition-shadow cursor-pointer' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-4xl" aria-hidden="true">{report.icon}</span>
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold mb-2">{report.title}</h2>
                      <p className="text-gray-600 mb-4">{report.description}</p>
                      {report.available ? (
                        <Link
                          href={report.path}
                          className="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                        >
                          Ouvrir le rapport
                        </Link>
                      ) : (
                        <span className="inline-block bg-gray-200 text-gray-600 px-4 py-2 rounded">
                          Bientôt disponible
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
