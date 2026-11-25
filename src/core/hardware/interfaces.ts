// Hardware Abstraction Layer Interfaces

export interface PrinterAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  printReceipt(content: string): Promise<void>;
  getStatus(): Promise<'connected' | 'disconnected' | 'error'>;
}

export interface CashDrawerAdapter {
  open(): Promise<void>;
  getStatus(): Promise<'open' | 'closed' | 'error'>;
}

export interface ScannerAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onScan(callback: (barcode: string) => void): void;
  getStatus(): Promise<'connected' | 'disconnected' | 'error'>;
}

export interface ScaleAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getWeight(): Promise<number>;
  getStatus(): Promise<'connected' | 'disconnected' | 'error'>;
}

export interface PaymentTerminalAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  processPayment(amount: number, paymentMethod: string): Promise<{ success: boolean; transactionId?: string; error?: string }>;
  getStatus(): Promise<'connected' | 'disconnected' | 'error'>;
}

export interface HardwareService {
  printers: Map<string, PrinterAdapter>;
  cashDrawers: Map<string, CashDrawerAdapter>;
  scanners: Map<string, ScannerAdapter>;
  scales: Map<string, ScaleAdapter>;
  paymentTerminals: Map<string, PaymentTerminalAdapter>;
}
