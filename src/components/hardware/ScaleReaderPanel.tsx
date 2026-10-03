'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createLocalHardwareBridge,
  parseScaleReading,
  type ScalePortInfo,
  type ScaleSerialOptions,
} from '@omnikes/lib/hardware';

interface ScaleReaderPanelProps {
  compact?: boolean;
  onReading?: (reading: { weightGrams: number; weight: number; unit: string; stable: boolean }) => void;
}

export function ScaleReaderPanel({ compact = false, onReading }: ScaleReaderPanelProps) {
  const [ports, setPorts] = useState<ScalePortInfo[]>([]);
  const [scaleId, setScaleId] = useState('');
  const [baudRate, setBaudRate] = useState('9600');
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [reading, setReading] = useState<{
    weight: number;
    unit: string;
    weightGrams: number;
    stable: boolean;
  } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'reading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const bridge = useMemo(
    () => (bridgeToken ? createLocalHardwareBridge({ token: bridgeToken }) : null),
    [bridgeToken],
  );

  const loadBridgeToken = useCallback(async () => {
    const response = await fetch('/api/hardware/bridge-token', {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(
        response.status === 503
          ? 'Authentification du bridge matériel non configurée'
          : 'Authentification requise pour le bridge matériel',
      );
    }

    const body = (await response.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || body.token.length < 32) {
      throw new Error('Jeton du bridge matériel invalide');
    }

    setBridgeToken(body.token);
    return body.token;
  }, []);

  const discover = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const token = bridgeToken ?? (await loadBridgeToken());
      const client = bridge ?? createLocalHardwareBridge({ token });
      const result = await client.listScales();
      const scales = result.scales ?? [];
      setPorts(scales);

      const firstDeviceId = scales[0]?.DeviceID;
      if (firstDeviceId) {
        setScaleId((current) => current || firstDeviceId);
      }

      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : 'Bridge matériel indisponible',
      );
    }
  }, [bridge, bridgeToken, loadBridgeToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void discover();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [discover]);

  const read = async () => {
    if (!scaleId) {
      setError('Aucun port COM de balance sélectionné.');
      return;
    }

    setStatus('reading');
    setError(null);

    try {
      const client =
        bridge ??
        createLocalHardwareBridge({
          token: bridgeToken ?? (await loadBridgeToken()),
        });

      const options: ScaleSerialOptions = {
        scaleId,
        baudRate: Number(baudRate),
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        readTimeoutMs: 2500,
        settleMs: 300,
      };

      const response = await client.readScale(options);
      const parsed = parseScaleReading(response.raw);

      const nextReading = {
        weight: parsed.weight,
        unit: parsed.unit,
        weightGrams: parsed.weightGrams,
        stable: parsed.stable,
      };
      setReading(nextReading);
      onReading?.(nextReading);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setReading(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Lecture de balance impossible',
      );
    }
  };

  return (
    <div className={compact ? 'flex items-center gap-2' : 'rounded-lg border border-gray-200 bg-white p-3'}>
      {!compact && (
        <div className="mb-2">
          <p className="font-medium text-gray-900">Balance</p>
          <p className="text-xs text-gray-500">
            Lecture matérielle locale uniquement
          </p>
        </div>
      )}

      <div className={compact ? 'flex items-center gap-2' : 'flex flex-wrap items-center gap-2'}>
        <select
          value={scaleId}
          onChange={(e) => setScaleId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          aria-label="Port COM de la balance"
        >
          <option value="">Balance COM</option>
          {ports.map((port) => (
            <option key={port.DeviceID ?? port.Name} value={port.DeviceID ?? ''}>
              {port.DeviceID ?? port.Name}
            </option>
          ))}
        </select>

        <select
          value={baudRate}
          onChange={(e) => setBaudRate(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          aria-label="Vitesse de la balance"
        >
          {[2400, 4800, 9600, 19200, 38400, 57600, 115200].map((rate) => (
            <option key={rate} value={rate}>
              {rate}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void discover()}
          disabled={status === 'loading' || status === 'reading'}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Détecter
        </button>

        <button
          type="button"
          onClick={() => void read()}
          disabled={!scaleId || status === 'reading'}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {status === 'reading' ? 'Lecture...' : 'Lire poids'}
        </button>
      </div>

      {reading && (
        <div className="mt-2 flex items-center gap-3 text-sm">
          <strong>
            {reading.weight} {reading.unit}
          </strong>
          <span>{reading.weightGrams.toFixed(3)} g</span>
          <span className={reading.stable ? 'text-green-700' : 'text-amber-700'}>
            {reading.stable ? 'Stable' : 'Instable'}
          </span>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
