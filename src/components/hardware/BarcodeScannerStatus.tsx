'use client';

import { useEffect, useState } from 'react';
import { BarcodeScanner } from '@omnikes/lib/hardware/barcode-scanner';

interface Props { onScan: (barcode: string) => void; }

export function BarcodeScannerStatus({ onScan }: Props) {
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new BarcodeScanner({
      onScan: (barcode) => {
        setLastScan(barcode);
        onScan(barcode);
      },
    });
    scanner.start();
    return () => scanner.stop();
  }, [onScan]);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500" title="Scanner code-barres HID clavier">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      <span>Scanner HID prêt</span>
      {lastScan && <span className="sr-only">Dernier scan: {lastScan}</span>}
    </div>
  );
}
