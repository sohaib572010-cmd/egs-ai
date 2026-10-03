import fs from "fs";
import path from "path";
import type { FileQueueItem, FileStatus, ProcessingSettings, PageExtractionResult, ProcessingLog, JobCheckpoint } from "./types";
import { PDFDocumentHandler } from "./pdf_parser";
import { detectTocPage, organizePageWithDeepSeek, type TocEntry } from "./deepseek_organizer";
import { buildCurriculumMarkdown } from "./curriculum_cleaner";
import { countOutlineLessons, outlineToPromptContext, outlineToText, parseOutlineText, type OutlineNode } from "./outline";
import {
  initCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
  savePageResult,
  saveQueueState,
  loadQueueState,
  deleteCheckpoint,
} from "./checkpoint_manager";

const OUTPUT_DIR = path.join(process.cwd(), "output");
const CHECKPOINTS_DIR = path.join(process.cwd(), "checkpoints");
const TOC_SCAN_PAGES = 10;
const PAGE_TIMEOUT_MS = 150000;

function outputPathFor(gradeLevel: string, subjectName: string): string {
  const stageDir = path.join(OUTPUT_DIR, gradeLevel.replace(/[\\/:*?"<>|]/g, "_") || "unassigned");
  if (!fs.existsSync(stageDir)) fs.mkdirSync(stageDir, { recursive: true });
  return path.join(stageDir, `${subjectName.replace(/[\\/:*?"<>|]/g, "_")}.md`);
}

function tocEntriesToText(entries: TocEntry[]): string {
  const labels = { unit: "الوحدة", chapter: "الفصل", lesson: "الدرس" } as const;
  return entries
    .map((e) => (e.kind === "intro" ? `مقدمة: ${e.title}` : `${labels[e.kind]}${e.number !== null ? ` ${e.number}` : ""}: ${e.title}`))
    .join("\n");
}

export class QueueProcessor {
  private queue: FileQueueItem[] = [];
  private settings: ProcessingSettings;
  private isProcessing = false;
  private isPaused = false;
  private logs: ProcessingLog[] = [];
  private activeWorkers = 0;
  private onLogCallback?: (log: ProcessingLog) => void;
  private onProgressCallback?: (queue: FileQueueItem[]) => void;

  constructor(defaultSettings: ProcessingSettings) {
    this.settings = { ...defaultSettings, deepSeekApiKey: defaultSettings.deepSeekApiKey || process.env.DEEPSEEK_API_KEY || "" };
    this.restoreSavedState();
  }

  private restoreSavedState() {
    const saved = loadQueueState();
    if (!saved) return;
    if (saved.settings) {
      this.settings = {
        ...this.settings,
        ...saved.settings,
        deepSeekApiKey: saved.settings.deepSeekApiKey || this.settings.deepSeekApiKey,
      };
    }
    if (Array.isArray(saved.queue) && saved.queue.length > 0) {
      this.queue = saved.queue.map((f) => {
        if (f.status === "processing") f.status = this.settings.autoResumeOnStartup ? "pending" : "paused";
        return f;
      });
      this.log("info", `تمت استعادة ${this.queue.length} كتب من سجل المحفوظات بنجاح.`);
      if (this.settings.autoResumeOnStartup && this.queue.some((f) => f.status === "pending")) {
        setTimeout(() => this.startProcessing(), 1500);
      }
    }
  }

  public persistState() {
    saveQueueState(this.queue, this.settings);
  }

  public updateSettings(newSettings: Partial<ProcessingSettings>) {
    this.settings = {
      ...this.settings,
      ...newSettings,
      deepSeekApiKey: newSettings.deepSeekApiKey || this.settings.deepSeekApiKey || process.env.DEEPSEEK_API_KEY || "",
    };
    this.persistState();
  }

  public getSettings(): ProcessingSettings {
    return { ...this.settings };
  }

  public setCallbacks(onLog?: (log: ProcessingLog) => void, onProgress?: (queue: FileQueueItem[]) => void) {
    this.onLogCallback = onLog;
    this.onProgressCallback = onProgress;
  }

  public addFiles(fileItems: FileQueueItem[]) {
    this.queue.push(...fileItems);
    this.log("info", `تمت إضافة ${fileItems.length} كتب دراسية إلى قائمة الانتظار.`);
    this.persistState();
    this.notifyProgress();
  }

  public deleteFile(fileId: string) {
    this.queue = this.queue.filter((f) => f.id !== fileId);
    deleteCheckpoint(fileId);
    this.persistState();
    this.notifyProgress();
    this.log("info", "تم حذف المنهج من القائمة.", fileId);
  }

  public clearCompleted() {
    this.queue = this.queue.filter((f) => f.status !== "completed");
    this.persistState();
    this.notifyProgress();
    this.log("info", "تم مسح المناهج المكتملة من القائمة.");
  }

  public getQueue(): FileQueueItem[] {
    return [...this.queue];
  }

  public getLogs(): ProcessingLog[] {
    return [...this.logs];
  }

  public pause() {
    this.isPaused = true;
    for (const item of this.queue) if (item.status === "processing") item.status = "paused";
    this.persistState();
    this.notifyProgress();
    this.log("warn", "تم إيقاف جميع عمليات المعالجة مؤقتاً.");
  }

  public pauseFile(fileId: string) {
    const item = this.queue.find((f) => f.id === fileId);
    if (item && item.status === "processing") {
      item.status = "paused";
      this.persistState();
      this.notifyProgress();
      this.log("warn", `تم إيقاف معالجة: ${item.subjectName} مؤقتاً.`, fileId);
    }
  }

  public resume() {
    this.isPaused = false;
    for (const item of this.queue) if (item.status === "paused") item.status = "pending";
    this.persistState();
    this.notifyProgress();
    this.log("info", "تم استئناف المعالجة المتزامنة.");
    this.startProcessing();
  }

  public resumeFile(fileId: string) {
    const item = this.queue.find((f) => f.id === fileId);
    if (item && (item.status === "paused" || item.status === "failed")) {
      item.status = "pending";
      item.errorMessage = null;
      this.persistState();
      this.notifyProgress();
      this.log("info", `تم تفعيل المنهج للاستئناف: ${item.subjectName}`, fileId);
      this.startProcessing();
    }
  }

  public retryFailed(fileId?: string) {
    const targets = fileId ? this.queue.filter((f) => f.id === fileId) : this.queue.filter((f) => f.status === "failed" || f.failedPages > 0);
    for (const item of targets) {
      item.status = "pending";
      item.errorMessage = null;
      item.failedPages = 0;
      const cp = loadCheckpoint(item.id);
      if (!cp) continue;
      let purged = 0;
      for (const [pNo, pRes] of Object.entries(cp.completedPages)) {
        if (pRes.status === "failed") {
          delete cp.completedPages[Number(pNo)];
          purged++;
        }
      }
      saveCheckpoint(cp);
      if (purged > 0) this.log("info", `تم تفريغ ${purged} صفحة متعثرة لإعادة استخراجها`, item.id);
    }
    this.persistState();
    this.notifyProgress();
    this.startProcessing();
  }

  /** Stores an operator-provided outline and re-exports the book with it (no API calls). */
  public setOutline(fileId: string, outlineText: string): { ok: boolean; lessons: number } {
    const item = this.queue.find((f) => f.id === fileId);
    if (!item) return { ok: false, lessons: 0 };
    item.outlineText = outlineText.trim();
    const cp = loadCheckpoint(fileId);
    if (cp) {
      const outline = item.outlineText ? parseOutlineText(item.outlineText) : null;
      cp.outline = outline;
      cp.outlineSource = outline ? "manual" : null;
      saveCheckpoint(cp);
      if (Object.keys(cp.completedPages).length > 0) this.exportCheckpoint(cp, item);
    }
    this.persistState();
    this.notifyProgress();
    return { ok: true, lessons: item.outlineText ? countOutlineLessons(parseOutlineText(item.outlineText)) : 0 };
  }

  public async startProcessing() {
    if (this.isProcessing) {
      this.fillWorkerSlots();
      return;
    }
    this.isProcessing = true;
    this.isPaused = false;
    this.log("info", "بدء تشغيل محرك المعالجة المتزامنة.");
    while (!this.isPaused) {
      this.fillWorkerSlots();
      if (this.activeWorkers === 0 && !this.queue.some((f) => f.status === "pending")) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    this.isProcessing = false;
    this.persistState();
    this.notifyProgress();
  }

  private fillWorkerSlots() {
    const maxFiles = Math.max(1, this.settings.maxConcurrentFiles || 2);
    while (this.activeWorkers < maxFiles && !this.isPaused) {
      const next = this.queue.find((f) => f.status === "pending");
      if (!next) break;
      this.activeWorkers++;
      this.processFile(next).finally(() => {
        this.activeWorkers--;
      });
    }
  }

  private async processFile(file: FileQueueItem) {
    file.status = "processing";
    file.startedAt = file.startedAt || new Date().toISOString();
    file.errorMessage = null;
    this.persistState();
    this.notifyProgress();
    this.log("info", `بدء معالجة: ${file.subjectName} (${file.filename})`, file.id);

    const doc = new PDFDocumentHandler(file.filepath);
    try {
      const pages = await doc.init();
      if (!file.totalPages || file.totalPages <= 0) file.totalPages = pages;
      const checkpoint = initCheckpoint(file);

      const outline = await this.resolveOutline(file, checkpoint, doc);
      const outlineContext = outline && outline.length > 0 ? outlineToPromptContext(outline) : undefined;

      const pending: number[] = [];
      for (let p = 1; p <= file.totalPages; p++) {
        if (checkpoint.completedPages[p]?.status !== "success") pending.push(p);
      }
      this.syncFileProgress(file);
      this.log("info", `المتبقي للمعالجة: ${pending.length} صفحة من ${file.totalPages}.`, file.id);

      const startTime = Date.now();
      let processed = 0;
      let cursor = 0;
      const active = new Set<number>();
      const worker = async () => {
        while (cursor < pending.length && !this.isPaused && (file.status as FileStatus) !== "paused") {
          const pNo = pending[cursor++];
          active.add(pNo);
          file.currentOperation = `معالجة الصفحات [${[...active].sort((a, b) => a - b).join(", ")}]`;
          this.notifyProgress();
          try {
            await this.processPageWithTimeout(file, doc, pNo, outlineContext);
          } finally {
            active.delete(pNo);
            processed++;
            this.syncFileProgress(file, startTime, processed);
          }
          if (this.settings.delayBetweenBatchesMs > 0) {
            await new Promise((res) => setTimeout(res, this.settings.delayBetweenBatchesMs));
          }
        }
      };
      const concurrency = Math.max(1, Math.min(this.settings.batchSize || 6, pending.length));
      await Promise.all(Array.from({ length: concurrency }, worker));

      if (this.isPaused || (file.status as FileStatus) === "paused") {
        file.status = "paused";
        return;
      }

      const finalCp = loadCheckpoint(file.id);
      if (!finalCp) throw new Error("تعذر تحميل نقطة الحفظ الخاصة بالملف");
      const failed: number[] = [];
      for (let p = 1; p <= file.totalPages; p++) {
        if (finalCp.completedPages[p]?.status !== "success") failed.push(p);
      }
      this.exportCheckpoint(finalCp, file);
      file.completedAt = new Date().toISOString();
      if (failed.length > 0) {
        file.status = "failed";
        file.failedPages = failed.length;
        file.errorMessage = `تعثر توليد ${failed.length} صفحة: [${failed.slice(0, 10).join(", ")}${failed.length > 10 ? "..." : ""}]`;
        this.log("warn", `تم تصدير المنهج مع صفحات غير مكتملة: ${file.errorMessage}`, file.id);
      } else {
        file.status = "completed";
        file.failedPages = 0;
        file.currentOperation = "اكتمل بنجاح";
      }
    } catch (error: any) {
      file.status = "failed";
      file.errorMessage = error.message || "حدث خطأ غير متوقع أثناء المعالجة";
      this.log("error", `فشلت معالجة المنهج: ${file.errorMessage}`, file.id);
    } finally {
      await doc.destroy();
      this.persistState();
      this.notifyProgress();
    }
  }

  /**
   * Book outline, in priority order: operator-provided text, the outline stored in the checkpoint,
   * or one read from the table-of-contents pages among the first pages of the book.
   */
  private async resolveOutline(file: FileQueueItem, cp: JobCheckpoint, doc: PDFDocumentHandler): Promise<OutlineNode[] | null> {
    if (file.outlineText?.trim()) {
      cp.outline = parseOutlineText(file.outlineText);
      cp.outlineSource = "manual";
      saveCheckpoint(cp);
      this.log("info", `تم اعتماد فهرس الكتاب المُدخل يدوياً (${cp.outline.length} عنصر رئيسي).`, file.id);
      return cp.outline;
    }
    if (cp.outline !== undefined) return cp.outline;
    if (!this.settings.deepSeekApiKey) return null;

    file.currentOperation = "قراءة فهرس الكتاب";
    this.notifyProgress();
    const scan = Array.from({ length: Math.min(TOC_SCAN_PAGES, file.totalPages) }, (_, i) => i + 1);
    const found = await Promise.all(
      scan.map(async (pNo) => {
        try {
          const page = await doc.extractPage(pNo);
          return { pNo, entries: await detectTocPage(page.imageBuffer, page.extractedText, { apiKey: this.settings.deepSeekApiKey }) };
        } catch {
          return { pNo, entries: null };
        }
      })
    );
    let tocPages = found.filter((f) => f.entries).map((f) => f.pNo);
    let entries = found.flatMap((f) => f.entries || []);
    if (entries.filter((e) => e.kind === "unit" || e.kind === "chapter").length < 2) {
      tocPages = [];
      entries = [];
    }
    cp.tocPages = tocPages;
    cp.outline = entries.length >= 2 ? parseOutlineText(tocEntriesToText(entries)) : null;
    cp.outlineSource = cp.outline ? "toc" : null;
    for (const pNo of tocPages) {
      cp.completedPages[pNo] = {
        pageNumber: pNo,
        rawVisionText: "",
        processedMarkdown: "",
        status: "success",
        attempts: 1,
        error: null,
        timestamp: new Date().toISOString(),
      };
    }
    saveCheckpoint(cp);
    if (cp.outline) {
      file.outlineText = tocEntriesToText(entries);
      this.log("success", `تم استخراج فهرس الكتاب من الصفحات [${tocPages.join(", ")}] واعتماده لضبط عناوين الوحدات والدروس.`, file.id);
    } else {
      this.log("warn", "لم يتم العثور على فهرس للكتاب؛ سيتم ضبط العناوين تلقائياً. يمكنك إدخال الفهرس يدوياً من نافذة المعاينة.", file.id);
    }
    return cp.outline;
  }

  private exportCheckpoint(cp: JobCheckpoint, file: FileQueueItem): string {
    const pages = Object.values(cp.completedPages)
      .filter((p) => p.status === "success")
      .map((p) => ({ pageNumber: p.pageNumber, markdown: p.processedMarkdown || "" }));
    const { markdown, report, droppedTocPages, outline } = buildCurriculumMarkdown(
      pages,
      file.subjectName,
      cp.outline ?? null,
      cp.tocPages ?? [],
      cp.outlineSource === "toc"
    );
    if (outline && cp.outlineSource === "toc") file.outlineText = outlineToText(outline);
    const outputPath = outputPathFor(file.gradeLevel, file.subjectName);
    fs.writeFileSync(outputPath, markdown, "utf-8");
    file.outputFilePath = outputPath;
    if (report) {
      this.log(
        report.missing.length > 0 ? "warn" : "success",
        report.missing.length > 0
          ? `تم ضبط ${report.matched} عنواناً وفق الفهرس، ولم يُعثر على بداية: ${report.missing.join("، ")}`
          : `تم ضبط جميع عناوين الوحدات والفصول والدروس (${report.matched}) وفق فهرس الكتاب.`,
        file.id
      );
    }
    if (droppedTocPages.length > 0) this.log("info", `تم استبعاد صفحات الفهرس [${droppedTocPages.join(", ")}] من المحتوى.`, file.id);
    this.log("success", `تم تصدير المنهج: ${outputPath}`, file.id);
    return markdown;
  }

  private syncFileProgress(file: FileQueueItem, startTime?: number, processedCount?: number) {
    const cp = loadCheckpoint(file.id);
    if (!cp) return;
    const results = Object.values(cp.completedPages);
    file.processedPages = results.filter((p) => p.status === "success").length;
    file.failedPages = results.filter((p) => p.status === "failed").length;
    if (startTime && processedCount) {
      const minutes = (Date.now() - startTime) / 60000;
      if (minutes > 0) file.speedPagesPerMin = Number((processedCount / minutes).toFixed(1));
    }
    this.persistState();
    this.notifyProgress();
  }

  private async processPageWithTimeout(file: FileQueueItem, doc: PDFDocumentHandler, pageNumber: number, outlineContext?: string) {
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.log("warn", `تجاوزت الصفحة ${pageNumber} مهلة المعالجة القصوى، سيتم الانتقال للصفحة التالية`, file.id, pageNumber);
        savePageResult(file.id, this.failedResult(pageNumber, 1, "Execution timeout"));
        resolve();
      }, PAGE_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.processPage(file, doc, pageNumber, outlineContext), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private failedResult(pageNumber: number, attempts: number, error: string): PageExtractionResult {
    return { pageNumber, rawVisionText: "", processedMarkdown: "", status: "failed", attempts, error, timestamp: new Date().toISOString() };
  }

  private async processPage(file: FileQueueItem, doc: PDFDocumentHandler, pageNumber: number, outlineContext?: string) {
    try {
      const page = await doc.extractPage(pageNumber);
      const markdown = await organizePageWithDeepSeek(page.imageBuffer, page.extractedText, {
        apiKey: this.settings.deepSeekApiKey,
        subjectName: file.subjectName,
        gradeLevel: file.gradeLevel,
        pageNumber,
        outlineContext,
        maxRetries: Math.max(1, this.settings.maxRetries || 4),
        onNetworkWait: (att, max) =>
          this.log("warn", `انتظار استجابة DeepSeek للصفحة ${pageNumber} (المحاولة ${att}/${max})`, file.id, pageNumber),
      });
      savePageResult(file.id, {
        pageNumber,
        rawVisionText: page.extractedText || "",
        processedMarkdown: markdown,
        status: "success",
        attempts: 1,
        error: null,
        timestamp: new Date().toISOString(),
      });
      this.log(
        markdown.trim() ? "success" : "info",
        markdown.trim() ? `تمت معالجة الصفحة ${pageNumber}` : `تم تخطي الصفحة ${pageNumber} (لا تحتوي على شرح)`,
        file.id,
        pageNumber
      );
    } catch (error: any) {
      this.log("error", `تعثرت معالجة الصفحة ${pageNumber}: ${error.message}`, file.id, pageNumber);
      savePageResult(file.id, this.failedResult(pageNumber, this.settings.maxRetries || 4, error.message));
    }
  }

  public getCurriculumMarkdown(fileId: string): string | null {
    const item = this.queue.find((f) => f.id === fileId);
    if (!item) return null;
    if (item.outputFilePath && fs.existsSync(item.outputFilePath)) return fs.readFileSync(item.outputFilePath, "utf-8");
    const cp = loadCheckpoint(fileId);
    if (!cp) return null;
    const pages = Object.values(cp.completedPages).map((p) => ({ pageNumber: p.pageNumber, markdown: p.processedMarkdown || "" }));
    return buildCurriculumMarkdown(pages, item.subjectName, cp.outline ?? null, cp.tocPages ?? [], cp.outlineSource === "toc").markdown;
  }

  public reexportAllFiles(): { count: number; files: string[] } {
    if (!fs.existsSync(CHECKPOINTS_DIR)) return { count: 0, files: [] };
    const files: string[] = [];
    for (const name of fs.readdirSync(CHECKPOINTS_DIR).filter((f) => f.startsWith("file_") && f.endsWith(".json"))) {
      const cp = loadCheckpoint(name.replace(/\.json$/, ""));
      if (!cp || Object.keys(cp.completedPages).length === 0) continue;
      const item =
        this.queue.find((f) => f.id === cp.fileId) ||
        ({ id: cp.fileId, gradeLevel: cp.gradeLevel, subjectName: cp.subjectName } as FileQueueItem);
      try {
        this.exportCheckpoint(cp, item);
        if (item.outputFilePath) files.push(item.outputFilePath);
      } catch (err: any) {
        this.log("error", `تعذر إعادة تصدير ${cp.subjectName}: ${err.message}`, cp.fileId);
      }
    }
    this.persistState();
    return { count: files.length, files };
  }

  private log(level: ProcessingLog["level"], message: string, fileId?: string, pageNumber?: number) {
    const logItem: ProcessingLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString("ar-EG"),
      level,
      message,
      fileId,
      pageNumber,
    };
    this.logs.unshift(logItem);
    if (this.logs.length > 600) this.logs.pop();
    this.onLogCallback?.(logItem);
  }

  private notifyProgress() {
    this.onProgressCallback?.(this.getQueue());
  }
}
