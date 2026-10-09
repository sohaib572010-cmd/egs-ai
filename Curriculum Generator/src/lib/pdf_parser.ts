import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface PDFPageContent {
  pageNumber: number;
  extractedText: string;
  hasText: boolean;
  imageBuffer: Buffer | null;
  mimeType: string;
}

const MAX_WIDTH = 1400;
const MAX_HEIGHT = 2000;
const JPEG_QUALITY = 82;
const PAGE_TIMEOUT_MS = 60000;

function openDocument(data: Uint8Array) {
  return pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false,
  } as any).promise;
}

/** Text layer with line breaks kept; empty when the layer is missing or garbled (scanned books). */
function readableText(items: any[]): string {
  const text = items
    .map((it) => (it.str || "") + (it.hasEOL ? "\n" : " "))
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  const letters = (text.match(/\p{L}/gu) || []).length;
  const garbled = (text.match(/�/g) || []).length > 2;
  return letters >= 30 && !garbled ? text : "";
}

/**
 * Renders pages in-process with pdfjs and @napi-rs/canvas (no external tools) and caches the JPEGs
 * per document. Rendering is serialized because it is CPU-bound and pdfjs shares one document.
 */
export class PDFDocumentHandler {
  private pdfDoc: any = null;
  private filePath: string;
  private totalPages = 0;
  private cacheDir: string;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
    const fileHash = crypto.createHash("md5").update(path.resolve(filePath)).digest("hex").slice(0, 12);
    const baseName = path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_؀-ۿ]/g, "_");
    this.cacheDir = path.join(process.cwd(), "page_images_cache", `${baseName}_${fileHash}`);
  }

  public async init(): Promise<number> {
    if (!this.pdfDoc) {
      this.pdfDoc = await openDocument(new Uint8Array(fs.readFileSync(this.filePath)));
      this.totalPages = this.pdfDoc.numPages;
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    return this.totalPages;
  }

  public getNumPages(): number {
    return this.totalPages;
  }

  public extractPage(pageNumber: number): Promise<PDFPageContent> {
    const run = this.chain.then(() => this.withTimeout(this.extractPageInternal(pageNumber), pageNumber));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private withTimeout<T>(task: Promise<T>, pageNumber: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`انتهت مهلة قراءة الصفحة ${pageNumber} من ملف PDF`)), PAGE_TIMEOUT_MS);
    });
    return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
  }

  private async extractPageInternal(pageNumber: number): Promise<PDFPageContent> {
    await this.init();
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      throw new Error(`Page ${pageNumber} out of range (1-${this.totalPages})`);
    }
    const page = await this.pdfDoc.getPage(pageNumber);
    try {
      let text = "";
      try {
        text = readableText((await page.getTextContent()).items);
      } catch {}

      const cachedPath = path.join(this.cacheDir, `page_${pageNumber}.jpg`);
      let imageBuffer: Buffer | null = fs.existsSync(cachedPath) ? fs.readFileSync(cachedPath) : null;
      if (!imageBuffer?.length) {
        imageBuffer = await this.render(page);
        fs.writeFileSync(cachedPath, imageBuffer);
      }
      return { pageNumber, extractedText: text, hasText: !!text, imageBuffer, mimeType: "image/jpeg" };
    } finally {
      try {
        page.cleanup();
      } catch {}
    }
  }

  private async render(page: any): Promise<Buffer> {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_WIDTH / base.width, MAX_HEIGHT / base.height, 3);
    const viewport = page.getViewport({ scale });
    const factory = this.pdfDoc.canvasFactory;
    const target = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({ canvasContext: target.context, viewport }).promise;
      return Buffer.from(await target.canvas.encode("jpeg", JPEG_QUALITY));
    } finally {
      factory.destroy(target);
    }
  }

  public async destroy(): Promise<void> {
    try {
      await this.pdfDoc?.destroy();
    } catch {}
    this.pdfDoc = null;
  }
}

export async function getPDFTotalPages(filePathOrBuffer: string | Buffer): Promise<number> {
  const data = typeof filePathOrBuffer === "string" ? fs.readFileSync(filePathOrBuffer) : filePathOrBuffer;
  const doc = await openDocument(new Uint8Array(data));
  const count = doc.numPages;
  try {
    await doc.destroy();
  } catch {}
  return count;
}
