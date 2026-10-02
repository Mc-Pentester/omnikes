import type { BrowserPrinterAdapterOptions, PrinterAdapter } from './types';

/**
 * Local-first browser printer adapter.
 *
 * The browser delegates the final device selection to the operating system.
 * This requires no cloud service, driver bridge, or database configuration.
 * A future ESC/POS/local-bridge adapter can implement the same contract.
 */
export class BrowserPrinterAdapter implements PrinterAdapter {
  readonly profile: BrowserPrinterAdapterOptions['profile'];
  private readonly printUrl: string;

  constructor(options: BrowserPrinterAdapterOptions) {
    this.profile = options.profile;
    this.printUrl = options.printUrl;
  }

  async print(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Printing is only available in the browser');
    }

    const printWindow = window.open(this.printUrl, '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      throw new Error('La fenêtre d’impression a été bloquée par le navigateur');
    }

    printWindow.focus();
  }
}

export function createProformaPrinter(proformaId: string): PrinterAdapter {
  return new BrowserPrinterAdapter({
    profile: 'proforma',
    printUrl: `/proformas/${encodeURIComponent(proformaId)}/print`,
  });
}
