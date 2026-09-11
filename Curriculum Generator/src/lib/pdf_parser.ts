import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

export interface PDFPageContent {
  pageNumber: number;
  extractedText: string;
  hasText: boolean;
  imageBuffer: Buffer | null;
  mimeType: string;
}

export class PDFDocumentHandler {
  private pdfDoc: any = null;
  private filePath: string;
  private totalPages: number = 0;
  private cacheDir: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const fileHash = crypto.createHash("md5").update(filePath).digest("hex").slice(0, 12);
    const baseName = path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, "_");
    this.cacheDir = path.join(process.cwd(), "page_images_cache", `${baseName}_${fileHash}`);
  }

  public async init(): Promise<number> {
    try {
      const fileBuffer = fs.readFileSync(this.filePath);
      const data = new Uint8Array(fileBuffer);
      const loadingTask = pdfjsLib.getDocument({
        data,
        useSystemFonts: true,
        disableFontFace: true,
        disableWorker: true,
        isEvalSupported: false,
      } as any);

      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
    } catch (error: any) {
      console.warn(`Fallback page count for ${this.filePath}:`, error.message);
      try {
        const fileBuffer = fs.readFileSync(this.filePath);
        const pdfString = fileBuffer.toString("binary");
        const matches = pdfString.match(/\/Type\s*\/Page\b/g);
        this.totalPages = matches && matches.length > 0 ? matches.length : 1;
      } catch {
        this.totalPages = 1;
      }
    }

    // High-Speed Batch Render all pages to cache if not already rendered
    this.preRenderAllPagesBatch();

    return this.totalPages;
  }

  /**
   * Pre-renders all PDF pages to high-resolution JPEG images in one batch using PyMuPDF (fitz)
   * Runs in ~1-2 seconds for an entire 100-page book.
   */
  private preRenderAllPagesBatch(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      // Check if all pages are already rendered
      let allCached = true;
      for (let p = 1; p <= this.totalPages; p++) {
        if (!fs.existsSync(path.join(this.cacheDir, `page_${p}.jpg`))) {
          allCached = false;
          break;
        }
      }

      if (allCached) return;

      const pyScript = `
import fitz
import os
import json

pdf_path = json.loads(${JSON.stringify(JSON.stringify(this.filePath))})
out_dir = json.loads(${JSON.stringify(JSON.stringify(this.cacheDir))})
os.makedirs(out_dir, exist_ok=True)

try:
    doc = fitz.open(pdf_path)
    for i, page in enumerate(doc):
        page_path = os.path.join(out_dir, f'page_{i+1}.jpg')
        if not os.path.exists(page_path):
            pix = page.get_pixmap(dpi=180)
            pix.save(page_path)
except Exception as e:
    print('Batch render error:', e)
`;

      execSync("python", {
        input: pyScript,
        encoding: "utf-8",
        timeout: 180000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e: any) {
      console.warn("Batch pre-render notice (will render on-demand):", e.message);
    }
  }

  public getNumPages(): number {
    return this.totalPages;
  }

  public async extractPage(pageNumber: number): Promise<PDFPageContent> {
    return await this.extractPageInternalWithTimeout(pageNumber);
  }

  private async extractPageInternalWithTimeout(pageNumber: number): Promise<PDFPageContent> {
    return Promise.race([
      this.extractPageInternal(pageNumber),
      new Promise<PDFPageContent>((_, reject) =>
        setTimeout(() => reject(new Error(`Extraction timeout on page ${pageNumber}`)), 20000)
      ),
    ]).catch((err) => {
      console.warn(`Fallback for page ${pageNumber}: ${err.message}`);
      return {
        pageNumber,
        extractedText: "",
        hasText: false,
        imageBuffer: null,
        mimeType: "image/jpeg",
      };
    });
  }

  private async extractPageInternal(pageNumber: number): Promise<PDFPageContent> {
    if (!this.pdfDoc) {
      await this.init();
    }

    if (pageNumber < 1 || (this.totalPages > 0 && pageNumber > this.totalPages)) {
      throw new Error(`Page ${pageNumber} out of range (1-${this.totalPages})`);
    }

    let pageText = "";
    if (this.pdfDoc) {
      let page: any = null;
      try {
        page = await this.pdfDoc.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map((item: any) => item.str || "");
        pageText = textItems.join(" ").trim();
      } catch (textErr: any) {
        console.warn(`Text extraction warning on page ${pageNumber}:`, textErr.message);
      } finally {
        if (page && typeof page.cleanup === "function") {
          try {
            page.cleanup();
          } catch {}
        }
      }
    }

    // Check text validity: if digital text contains replacement characters or high noise, treat as unreliable
    const hasReplacementChars = (pageText.match(/\ufffd/g) || []).length > 2;
    const isTextReadable = pageText.length > 30 && !hasReplacementChars;

    // Load full-page rendered image from cache or on-demand
    let imageBuffer: Buffer | null = null;
    const cachedImgPath = path.join(this.cacheDir, `page_${pageNumber}.jpg`);

    if (fs.existsSync(cachedImgPath)) {
      imageBuffer = fs.readFileSync(cachedImgPath);
    } else {
      try {
        if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
        const pySingleScript = `
import fitz
import os
import json

pdf_path = json.loads(${JSON.stringify(JSON.stringify(this.filePath))})
out_path = json.loads(${JSON.stringify(JSON.stringify(cachedImgPath))})
os.makedirs(os.path.dirname(out_path), exist_ok=True)

try:
    doc = fitz.open(pdf_path)
    if ${pageNumber - 1} < len(doc):
        pix = doc[${pageNumber - 1}].get_pixmap(dpi=180)
        pix.save(out_path)
except Exception as e:
    print('Single page render error:', e)
`;
        execSync("python", {
          input: pySingleScript,
          encoding: "utf-8",
          timeout: 20000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        if (fs.existsSync(cachedImgPath)) {
          imageBuffer = fs.readFileSync(cachedImgPath);
        }
      } catch (imgErr: any) {
        console.warn(`On-demand render warning on page ${pageNumber}:`, imgErr.message);
      }
    }

    return {
      pageNumber,
      extractedText: isTextReadable ? pageText : "",
      hasText: isTextReadable,
      imageBuffer,
      mimeType: "image/jpeg",
    };
  }

  public async destroy(): Promise<void> {
    if (this.pdfDoc && typeof this.pdfDoc.destroy === "function") {
      try {
        await this.pdfDoc.destroy();
      } catch {}
    }
    this.pdfDoc = null;
  }
}

export async function getPDFTotalPages(filePathOrBuffer: string | Buffer): Promise<number> {
  try {
    const data =
      typeof filePathOrBuffer === "string"
        ? new Uint8Array(fs.readFileSync(filePathOrBuffer))
        : new Uint8Array(filePathOrBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      disableWorker: true,
      isEvalSupported: false,
    } as any);

    const pdfDoc = await loadingTask.promise;
    const count = pdfDoc.numPages;
    try {
      await pdfDoc.destroy();
    } catch {}
    return count;
  } catch (error: any) {
    console.warn("getPDFTotalPages fallback count:", error.message);
    try {
      const buffer =
        typeof filePathOrBuffer === "string"
          ? fs.readFileSync(filePathOrBuffer)
          : filePathOrBuffer;
      const pdfString = buffer.toString("binary");
      const matches = pdfString.match(/\/Type\s*\/Page\b/g);
      return matches && matches.length > 0 ? matches.length : 1;
    } catch {
      return 1;
    }
  }
}
