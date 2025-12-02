import { Writable } from 'stream';

declare module 'pdfkit' {
  export interface PDFDocumentOptions {
    size?: string | number[];
    margin?: number;
  }

  export default class PDFDocument extends Writable {
    constructor(options?: PDFDocumentOptions);
    fontSize(size: number): this;
    text(
      text: string,
      options?: { continued?: boolean; width?: number; align?: string },
    ): this;
    moveDown(lines?: number): this;
    font(name: string): this;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    end(): this;
  }
}
