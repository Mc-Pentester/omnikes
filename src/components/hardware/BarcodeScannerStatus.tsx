'use client';

import { useEffect, useRef, useState } from 'react';
import { BarcodeScanner } from '@omnikes/lib/hardware/barcode-scanner';

interface Props { onScan: (barcode: string) => void; }

export function BarcodeScannerStatus({ onScan }: Props) {
  const [active, setActive] = useState(false);
  const lastScan = useRef<string | null>(null);

  useEffect(() => {
    const scanner = new BarcodeScanner({
      onScan: (barcode) => {
        lastScan.current = barcode;
        onScan(barcode);
        setActive(true);
      },
    });
    scanner.start();
    setActive(true);
    return () => scanner.stop();
  }, [onScan]);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500" title="Scanner code-barres HID clavier">
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
      <span>Scanner HID prêt</span>
      {lastScan.current && <span className="sr-only">Dernier scan: {lastScan.current}</span>}
    </div>
  );
}
