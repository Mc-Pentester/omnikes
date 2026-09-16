'use client';

import { useEffect } from 'react';
import { Button } from './button';

interface PageModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

export function PageModal({
  isOpen,
  onClose,
  title,
  children,
  closeOnOverlayClick = false,
  closeOnEscape = true,
}: PageModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, closeOnEscape]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-white"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-modal-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <h2 id="page-modal-title" className="text-xl font-semibold text-gray-900">
          {title}
        </h2>
        <Button onClick={onClose} variant="outline">
          ✕ Fermer
        </Button>
      </div>

      {/* Content */}
      <div className="h-[calc(100vh-73px)] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
