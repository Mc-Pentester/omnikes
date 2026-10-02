export type HardwareDeviceType =
  | 'barcode-scanner'
  | 'printer'
  | 'scale'
  | 'cash-drawer';

export type PrinterProfile = 'proforma' | 'receipt' | 'label';

export interface PrinterAdapter {
  readonly profile: PrinterProfile;
  print(): Promise<void>;
}

export interface BrowserPrinterAdapterOptions {
  profile: PrinterProfile;
  printUrl: string;
}
