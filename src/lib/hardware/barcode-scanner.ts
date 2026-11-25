export interface BarcodeScannerOptions {
  minLength?: number;
  maxLength?: number;
  interKeyDelayMs?: number;
  suffixKeys?: string[];
  onScan: (barcode: string) => void;
}

export class BarcodeScanner {
  private readonly options: Required<Omit<BarcodeScannerOptions, 'onScan'>> & Pick<BarcodeScannerOptions, 'onScan'>;
  private buffer = '';
  private lastKeyAt = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(options: BarcodeScannerOptions) {
    this.options = {
      minLength: options.minLength ?? 3,
      maxLength: options.maxLength ?? 128,
      interKeyDelayMs: options.interKeyDelayMs ?? 80,
      suffixKeys: options.suffixKeys ?? ['Enter', 'Tab'],
      onScan: options.onScan,
    };
  }

  start() {
    if (this.active || typeof window === 'undefined') return;
    this.active = true;
    window.addEventListener('keydown', this.handleKeyDown, true);
  }

  stop() {
    if (!this.active || typeof window === 'undefined') return;
    this.active = false;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.reset();
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const target = event.target as HTMLElement | null;
    const editable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
    if (editable) return;

    const now = performance.now();
    if (this.buffer && now - this.lastKeyAt > this.options.interKeyDelayMs) this.buffer = '';
    this.lastKeyAt = now;

    if (this.options.suffixKeys.includes(event.key)) {
      const barcode = this.buffer.trim();
      this.reset();
      if (barcode.length >= this.options.minLength && barcode.length <= this.options.maxLength) {
        this.options.onScan(barcode);
      }
      return;
    }

    if (event.key.length !== 1 || this.buffer.length >= this.options.maxLength) return;
    this.buffer += event.key;
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.reset(), this.options.interKeyDelayMs * 3);
  };

  private reset() {
    this.buffer = '';
    this.lastKeyAt = 0;
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }
}
