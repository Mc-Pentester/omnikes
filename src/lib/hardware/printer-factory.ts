import { BrowserPrinterAdapter } from './browser-printer';
import { EscPosPrinter, type EscPosTransport } from './escpos';
import type { PrinterAdapter } from './types';

export function createProformaPrinterAdapter(proformaId: string): PrinterAdapter {
  return new BrowserPrinterAdapter({ profile: 'proforma', printUrl: `/proformas/${encodeURIComponent(proformaId)}/print` });
}

export function createEscPosPrinter(transport: EscPosTransport) {
  return new EscPosPrinter(transport);
}
