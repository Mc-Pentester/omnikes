export interface EscPosTransport {
  connect(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  disconnect(): Promise<void>;
}

const textEncoder = new TextEncoder();

export class EscPosBuilder {
  private readonly chunks: Uint8Array[] = [];

  initialize() { this.chunks.push(Uint8Array.from([27, 64])); return this; }
  align(mode: 'left'|'center'|'right') { const value = mode === 'left' ? 0 : mode === 'center' ? 1 : 2; this.chunks.push(Uint8Array.from([27, 97, value])); return this; }
  bold(enabled = true) { this.chunks.push(Uint8Array.from([27, 69, enabled ? 1 : 0])); return this; }
  text(value: string) { this.chunks.push(textEncoder.encode(value)); return this; }
  line(value = '') { return this.text(value + '\n'); }
  feed(lines = 1) { this.chunks.push(Uint8Array.from([27, 100, Math.max(0, Math.min(255, lines))])); return this; }
  cut() { this.chunks.push(Uint8Array.from([29, 86, 0])); return this; }
  build() { const size = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0); const output = new Uint8Array(size); let offset = 0; for (const chunk of this.chunks) { output.set(chunk, offset); offset += chunk.length; } return output; }
}

export class EscPosPrinter {
  constructor(private readonly transport: EscPosTransport) {}
  async printReceipt(lines: string[]) {
    const doc = new EscPosBuilder().initialize().align('center').bold().line('OMNIKÈS').bold(false).align('left');
    for (const line of lines) doc.line(line);
    doc.feed(3).cut();
    await this.transport.connect();
    try { await this.transport.write(doc.build()); } finally { await this.transport.disconnect(); }
  }
}
