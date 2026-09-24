import fs from "fs";
import path from "path";
import {
  FileQueueItem,
  FileStatus,
  ProcessingSettings,
  PageExtractionResult,
  ProcessingLog,
  GradeLevel,
} from "./types";
import { PDFDocumentHandler, getPDFTotalPages } from "./pdf_parser";
import { extractWithEdenAI } from "./eden_vision";
import { organizePageWithDeepSeek, organizeTextWithDeepSeek } from "./deepseek_organizer";
import { cleanAndDeduplicateCurriculumMarkdown } from "./curriculum_cleaner";
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

function ensureOutputDir(gradeLevel: GradeLevel): string {
  const stageDir = path.join(OUTPUT_DIR, gradeLevel);
  if (!fs.existsSync(stageDir)) {
    fs.mkdirSync(stageDir, { recursive: true });
  }
  return stageDir;
}

const DEFAULT_EDENAI_KEY = process.env.EDENAI_API_KEY || "";
const DEFAULT_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || "";

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
    this.settings = {
      ...defaultSettings,
      geminiApiKey:
        defaultSettings.geminiApiKey || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY,
      edenAiApiKey:
        defaultSettings.edenAiApiKey || process.env.EDENAI_API_KEY || DEFAULT_EDENAI_KEY,
      deepSeekApiKey:
        defaultSettings.deepSeekApiKey || process.env.DEEPSEEK_API_KEY || DEFAULT_DEEPSEEK_KEY,
    };
    this.restoreSavedState();
  }

  private restoreSavedState() {
    try {
      const saved = loadQueueState();
      if (saved) {
        if (saved.settings) {
          this.settings = {
            ...this.settings,
            ...saved.settings,
            geminiApiKey:
              saved.settings.geminiApiKey ||
              this.settings.geminiApiKey ||
              process.env.GEMINI_API_KEY ||
              DEFAULT_GEMINI_KEY,
            edenAiApiKey:
              saved.settings.edenAiApiKey ||
              this.settings.edenAiApiKey ||
              process.env.EDENAI_API_KEY ||
              DEFAULT_EDENAI_KEY,
            deepSeekApiKey:
              saved.settings.deepSeekApiKey ||
              this.settings.deepSeekApiKey ||
              process.env.DEEPSEEK_API_KEY ||
              DEFAULT_DEEPSEEK_KEY,
          };
        }
        if (Array.isArray(saved.queue) && saved.queue.length > 0) {
          // Normalize status of restored queue items
          this.queue = saved.queue.map((f) => {
            if (f.status === "processing") {
              f.status = this.settings.autoResumeOnStartup ? "pending" : "paused";
            }
            return f;
          });
          this.log(
            "info",
            `تمت استعادة ${this.queue.length} كتب من سجل المحفوظات بنجاح.`
          );
          if (this.settings.autoResumeOnStartup && this.queue.some((f) => f.status === "pending")) {
            setTimeout(() => this.startProcessing(), 1500);
          }
        }
      }
    } catch (err: any) {
      console.warn("Failed to restore saved queue state:", err.message);
    }
  }

  public persistState() {
    saveQueueState(this.queue, this.settings);
  }

  public updateSettings(newSettings: Partial<ProcessingSettings>) {
    this.settings = {
      ...this.settings,
      ...newSettings,
      geminiApiKey:
        newSettings.geminiApiKey !== undefined
          ? newSettings.geminiApiKey
          : this.settings.geminiApiKey || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY,
      edenAiApiKey:
        newSettings.edenAiApiKey ||
        this.settings.edenAiApiKey ||
        process.env.EDENAI_API_KEY ||
        DEFAULT_EDENAI_KEY,
      deepSeekApiKey:
        newSettings.deepSeekApiKey ||
        this.settings.deepSeekApiKey ||
        process.env.DEEPSEEK_API_KEY ||
        DEFAULT_DEEPSEEK_KEY,
    };
    this.persistState();
  }

  public getSettings(): ProcessingSettings {
    return { ...this.settings };
  }

  public setCallbacks(
    onLog?: (log: ProcessingLog) => void,
    onProgress?: (queue: FileQueueItem[]) => void
  ) {
    this.onLogCallback = onLog;
    this.onProgressCallback = onProgress;
  }

  public addFile(fileItem: FileQueueItem) {
    this.queue.push(fileItem);
    this.log("info", `تمت إضافة المنهج إلى القائمة: ${fileItem.subjectName} (${fileItem.filename})`, fileItem.id);
    this.persistState();
    this.notifyProgress();
  }

  public addFiles(fileItems: FileQueueItem[]) {
    for (const f of fileItems) {
      this.queue.push(f);
    }
    this.log("info", `تمت إضافة ${fileItems.length} كتب دراسية إلى قائمة الانتظار.`);
    this.persistState();
    this.notifyProgress();
  }

  public deleteFile(fileId: string) {
    const item = this.queue.find((f) => f.id === fileId);
    if (item && item.status === "processing") {
      item.status = "paused";
    }
    this.queue = this.queue.filter((f) => f.id !== fileId);
    deleteCheckpoint(fileId);
    this.persistState();
    this.notifyProgress();
    this.log("info", `تم حذف المنهج من القائمة.`, fileId);
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
    for (const item of this.queue) {
      if (item.status === "processing") {
        item.status = "paused";
      }
    }
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
    for (const item of this.queue) {
      if (item.status === "paused") {
        item.status = "pending";
      }
    }
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
    if (fileId) {
      const item = this.queue.find((f) => f.id === fileId);
      if (item) {
        item.status = "pending";
        item.errorMessage = null;
        item.failedPages = 0;
        // Clean failed and false-empty pages in checkpoint
        const cp = loadCheckpoint(fileId);
        if (cp) {
          let purgedCount = 0;
          for (const [pNo, pRes] of Object.entries(cp.completedPages)) {
            const isEmptyMarkdown = !pRes.processedMarkdown || pRes.processedMarkdown.trim().length === 0;
            if (pRes.status === "failed" || isEmptyMarkdown) {
              delete cp.completedPages[Number(pNo)];
              purgedCount++;
            }
          }
          saveCheckpoint(cp);
          if (purgedCount > 0) {
            this.log("info", `تم تفريغ ${purgedCount} صفحة متعثرة أو فارغة لإعادة استخراجها`, fileId);
          }
        }
        this.log("info", `إعادة محاولة الصفحات المعلقة لـ: ${item.subjectName}`, fileId);
      }
    } else {
      for (const item of this.queue) {
        if (item.status === "failed" || item.failedPages > 0) {
          item.status = "pending";
          item.errorMessage = null;
          item.failedPages = 0;
          const cp = loadCheckpoint(item.id);
          if (cp) {
            let purgedCount = 0;
            for (const [pNo, pRes] of Object.entries(cp.completedPages)) {
              const isEmptyMarkdown = !pRes.processedMarkdown || pRes.processedMarkdown.trim().length === 0;
              if (pRes.status === "failed" || isEmptyMarkdown) {
                delete cp.completedPages[Number(pNo)];
                purgedCount++;
              }
            }
            saveCheckpoint(cp);
          }
        }
      }
      this.log("info", "إعادة محاولة جميع المناهج والصفحات المتعثرة.");
    }
    this.persistState();
    this.notifyProgress();
    this.startProcessing();
  }

  public async startProcessing() {
    if (this.isProcessing) {
      this.checkAndFillWorkerSlots();
      return;
    }

    this.isProcessing = true;
    this.isPaused = false;
    this.log("info", "بدء تشغيل محرك المعالجة المتزامنة.");

    await this.runMultiWorkerLoop();

    this.isProcessing = false;
    this.persistState();
    this.notifyProgress();
  }

  private async runMultiWorkerLoop() {
    const maxFiles = Math.max(1, this.settings.maxConcurrentFiles || 2);

    while (!this.isPaused) {
      const pendingFiles = this.queue.filter(
        (f) => f.status === "pending"
      );

      if (pendingFiles.length === 0 && this.activeWorkers === 0) {
        break;
      }

      while (this.activeWorkers < maxFiles && !this.isPaused) {
        const nextFile = this.queue.find((f) => f.status === "pending");
        if (!nextFile) break;

        this.activeWorkers++;
        this.processFileAsync(nextFile).finally(() => {
          this.activeWorkers--;
        });
      }

      await new Promise((res) => setTimeout(res, 500));
    }
  }

  private checkAndFillWorkerSlots() {
    const maxFiles = Math.max(1, this.settings.maxConcurrentFiles || 2);
    while (this.activeWorkers < maxFiles && !this.isPaused) {
      const nextFile = this.queue.find((f) => f.status === "pending");
      if (!nextFile) break;

      this.activeWorkers++;
      this.processFileAsync(nextFile).finally(() => {
        this.activeWorkers--;
      });
    }
  }

  private async processFileAsync(file: FileQueueItem) {
    file.status = "processing";
    file.startedAt = file.startedAt || new Date().toISOString();
    file.errorMessage = null;
    this.persistState();
    this.notifyProgress();

    this.log("info", `بدء معالجة: ${file.subjectName} (${file.filename})`, file.id);

    const docHandler = new PDFDocumentHandler(file.filepath);

    try {
      // 1. Initialize Document & Total Pages
      if (!file.totalPages || file.totalPages <= 0) {
        file.totalPages = await docHandler.init();
        this.log("info", `إجمالي الصفحات المكتشفة: ${file.totalPages}`, file.id);
      } else {
        await docHandler.init();
      }

      // 2. Initialize Checkpoint
      const checkpoint = initCheckpoint(file);

      // 3. Find remaining pages to process
      const pagesToProcess: number[] = [];
      for (let p = 1; p <= file.totalPages; p++) {
        const existing = checkpoint.completedPages[p];
        if (!existing || existing.status !== "success") {
          pagesToProcess.push(p);
        }
      }

      const completedCount = Object.values(checkpoint.completedPages).filter(
        (p) => p.status === "success"
      ).length;
      const failedCount = Object.values(checkpoint.completedPages).filter(
        (p) => p.status === "failed"
      ).length;

      file.processedPages = completedCount;
      file.failedPages = failedCount;
      this.persistState();
      this.notifyProgress();

      this.log(
        "info",
        `تم استعادة ${completedCount} صفحة مكتملة. المتبقي للمعالجة: ${pagesToProcess.length} صفحة.`,
        file.id
      );

      const concurrency = Math.max(1, this.settings.batchSize || 3);
      const startTime = Date.now();
      let processedInThisRun = 0;

      // 4. Continuous Sliding-Window Dynamic Concurrency Pool
      let queueIndex = 0;
      const activePages = new Set<number>();

      const worker = async () => {
        while (queueIndex < pagesToProcess.length) {
          const currentStatus = file.status as FileStatus;
          if (this.isPaused || currentStatus === "paused") {
            break;
          }

          const pNo = pagesToProcess[queueIndex++];
          activePages.add(pNo);
          file.currentOperation = `معالجة الصفحات [${Array.from(activePages).sort((a, b) => a - b).join(", ")}]`;
          this.notifyProgress();

          try {
            await this.processSinglePageWithSafetyTimeout(file, docHandler, pNo, startTime);
          } finally {
            activePages.delete(pNo);
            processedInThisRun++;
            this.syncFileProgress(file, startTime, processedInThisRun);
          }

          if (this.settings.delayBetweenBatchesMs > 0) {
            await new Promise((res) => setTimeout(res, this.settings.delayBetweenBatchesMs));
          }
        }
      };

      const numWorkers = Math.min(concurrency, pagesToProcess.length);
      const workers: Promise<void>[] = [];
      for (let w = 0; w < numWorkers; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if (this.isPaused || (file.status as FileStatus) === "paused") {
        file.status = "paused";
        this.persistState();
        this.notifyProgress();
        await docHandler.destroy();
        return;
      }

      // 5. Final Assembly & Markdown Export
      const finalCheckpoint = loadCheckpoint(file.id);
      if (finalCheckpoint) {
        const stageDir = ensureOutputDir(file.gradeLevel);
        const safeSubjectName = file.subjectName.replace(/[\\/:*?"<>|]/g, "_");
        const outputPath = path.join(stageDir, `${safeSubjectName}.md`);

        const totalPages = file.totalPages || Object.keys(finalCheckpoint.completedPages).length;
        const missingPages: number[] = [];
        const failedPagesList: number[] = [];

        let fullMarkdown = `# منهج ${file.subjectName}\n\n`;

        for (let pNo = 1; pNo <= totalPages; pNo++) {
          const pageRes = finalCheckpoint.completedPages[pNo];
          if (!pageRes) {
            missingPages.push(pNo);
            fullMarkdown += `\n\n<!-- بداية الصفحة ${pNo} -->\n<!-- لم يتم استخراج الصفحة ${pNo} -->\n`;
          } else if (pageRes.status === "failed") {
            failedPagesList.push(pNo);
            fullMarkdown += `\n\n<!-- بداية الصفحة ${pNo} -->\n` + (pageRes.processedMarkdown || `<!-- تعثر استخراج الصفحة ${pNo} -->\n`);
          } else if (pageRes.processedMarkdown && pageRes.processedMarkdown.trim().length > 0) {
            fullMarkdown += `\n\n<!-- بداية الصفحة ${pNo} -->\n` + pageRes.processedMarkdown;
          }
        }

        const sanitizedMarkdown = cleanAndDeduplicateCurriculumMarkdown(fullMarkdown);
        fs.writeFileSync(outputPath, sanitizedMarkdown, "utf-8");

        const ungeneratedCount = missingPages.length + failedPagesList.length;
        if (ungeneratedCount > 0) {
          file.status = "failed";
          file.failedPages = ungeneratedCount;
          file.errorMessage = `تعثر توليد ${ungeneratedCount} صفحة: [${[...missingPages, ...failedPagesList].slice(0, 10).join(", ")}${ungeneratedCount > 10 ? "..." : ""}]`;
          this.log("warn", `تم تصدير المنهج مع وجود ${ungeneratedCount} صفحة غير مكتملة: ${file.errorMessage}`, file.id);
        } else {
          file.status = "completed";
          file.failedPages = 0;
          file.currentOperation = "اكتمل بنجاح";
          this.log("success", `اكتمل استخراج وتنظيم المنهج بالكامل (${totalPages} صفحة): ${outputPath}`, file.id);
        }

        file.outputFilePath = outputPath;
        file.completedAt = new Date().toISOString();
      }
    } catch (error: any) {
      console.error(`Error processing file ${file.filename}:`, error);
      file.status = "failed";
      file.errorMessage = error.message || "حدث خطأ غير متوقع أثناء المعالجة";
      this.log("error", `فشلت معالجة المنهج: ${file.errorMessage}`, file.id);
    } finally {
      await docHandler.destroy();
      this.persistState();
      this.notifyProgress();
    }
  }

  private syncFileProgress(
    file: FileQueueItem,
    startTime?: number,
    processedCount?: number
  ) {
    const cp = loadCheckpoint(file.id);
    if (cp) {
      const successCount = Object.values(cp.completedPages).filter(
        (p) => p.status === "success"
      ).length;
      const fails = Object.values(cp.completedPages).filter(
        (p) => p.status === "failed"
      ).length;

      file.processedPages = successCount;
      file.failedPages = fails;

      if (startTime) {
        const count = processedCount !== undefined ? processedCount : (successCount + fails);
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        if (elapsedMinutes > 0 && count > 0) {
          file.speedPagesPerMin = Number((count / elapsedMinutes).toFixed(1));
        }
      }

      this.persistState();
      this.notifyProgress();
    }
  }

  private async processSinglePageWithSafetyTimeout(
    file: FileQueueItem,
    docHandler: PDFDocumentHandler,
    pageNumber: number,
    startTime?: number
  ): Promise<PageExtractionResult> {
    const pageTimeoutMs = 120000;
    let timer: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<PageExtractionResult>((resolve) => {
      timer = setTimeout(() => {
        this.log(
          "warn",
          `تجاوزت الصفحة ${pageNumber} مهلة المعالجة القصوى (120 ثانية)، سيتم الانتقال للصفحة التالية`,
          file.id,
          pageNumber
        );
        const timeoutResult: PageExtractionResult = {
          pageNumber,
          rawVisionText: "",
          processedMarkdown: `<!-- تجاوزت الصفحة ${pageNumber} مهلة الاستخراج -->\n`,
          status: "failed",
          attempts: 1,
          error: "Execution timeout",
          timestamp: new Date().toISOString(),
        };
        savePageResult(file.id, timeoutResult);
        this.syncFileProgress(file, startTime);
        resolve(timeoutResult);
      }, pageTimeoutMs);
    });

    try {
      return await Promise.race([
        this.processSinglePage(file, docHandler, pageNumber, startTime),
        timeoutPromise,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async processSinglePage(
    file: FileQueueItem,
    docHandler: PDFDocumentHandler,
    pageNumber: number,
    startTime?: number
  ): Promise<PageExtractionResult> {
    let attempts = 0;
    const maxRetries = Math.max(1, this.settings.maxRetries || 3);

    while (attempts < maxRetries) {
      attempts++;
      try {
        // Step 1: Extract Text & Image
        const pageContent = await docHandler.extractPage(pageNumber);

        // Step 2: Multimodal Processing via DeepSeek 4.1 (deepseek-flash)
        let processedMarkdown = "";
        let rawVisionText = pageContent.extractedText || "";

        const hasDeepSeek = !!(this.settings.deepSeekApiKey || process.env.DEEPSEEK_API_KEY);

        if (hasDeepSeek) {
          processedMarkdown = await organizePageWithDeepSeek(
            pageContent.imageBuffer,
            pageContent.extractedText,
            {
              apiKey: this.settings.deepSeekApiKey,
              subjectName: file.subjectName,
              gradeLevel: file.gradeLevel,
              pageNumber,
              maxRetries: 3,
              onNetworkWait: (att, max, delay) => {
                this.log(
                  "warn",
                  `انتظار استجابة نموذج DeepSeek 4.1 للصفحة ${pageNumber} (المحاولة ${att}/${max})`,
                  file.id,
                  pageNumber
                );
              },
            }
          );
        } else {
          // Legacy fallback path if only EdenAI/Gemini key is present without DeepSeek key
          rawVisionText = await extractWithEdenAI(
            pageContent.extractedText,
            pageContent.imageBuffer,
            {
              geminiApiKey: this.settings.geminiApiKey,
              edenAiApiKey: this.settings.edenAiApiKey,
              maxRetries: 3,
              onNetworkWait: (att, max, delay) => {
                this.log(
                  "warn",
                  `انتظار استقرار الاتصال بالإنترنت للصفحة ${pageNumber} (المحاولة ${att}/${max})`,
                  file.id,
                  pageNumber
                );
              },
            }
          );
          if (rawVisionText && rawVisionText.trim().length > 0) {
            processedMarkdown = await organizeTextWithDeepSeek(rawVisionText, {
              apiKey: this.settings.deepSeekApiKey,
              subjectName: file.subjectName,
              gradeLevel: file.gradeLevel,
              maxRetries: 3,
            });
          }
        }

        const isBlank =
          (!processedMarkdown || processedMarkdown.trim().length === 0) &&
          (!rawVisionText || rawVisionText.trim().length === 0);

        const pageResult: PageExtractionResult = {
          pageNumber,
          rawVisionText,
          processedMarkdown,
          status: "success",
          attempts,
          error: null,
          timestamp: new Date().toISOString(),
        };

        savePageResult(file.id, pageResult);
        this.syncFileProgress(file, startTime);

        if (isBlank) {
          this.log("info", `تم تخطي الصفحة ${pageNumber} (صفحة فارغة أو بدون نصوص شرح)`, file.id, pageNumber);
        } else {
          this.log(
            "success",
            hasDeepSeek
              ? `تمت معالجة وهيكلة الصفحة ${pageNumber} عبر DeepSeek 4.1 بنجاح`
              : `تمت معالجة وهيكلة الصفحة ${pageNumber} بنجاح`,
            file.id,
            pageNumber
          );
        }
        return pageResult;
      } catch (error: any) {
        const isAuthOrBillingError =
          error.message?.includes("402") ||
          error.message?.includes("No more credits") ||
          error.message?.includes("401") ||
          error.message?.includes("لم يتم إدخال مفتاح");

        this.log(
          isAuthOrBillingError ? "error" : "warn",
          `تعثرت معالجة الصفحة ${pageNumber} (المحاولة ${attempts}/${maxRetries}): ${error.message}`,
          file.id,
          pageNumber
        );

        if (isAuthOrBillingError || attempts >= maxRetries) {
          const failedResult: PageExtractionResult = {
            pageNumber,
            rawVisionText: "",
            processedMarkdown: `<!-- فشل استخراج الصفحة ${pageNumber} -->\n`,
            status: "failed",
            attempts,
            error: error.message,
            timestamp: new Date().toISOString(),
          };
          savePageResult(file.id, failedResult);
          this.syncFileProgress(file, startTime);
          return failedResult;
        }

        const waitMs = Math.min(1000 * Math.pow(1.5, attempts - 1), 5000);
        await new Promise((res) => setTimeout(res, waitMs));
      }
    }

    const exhaustedResult: PageExtractionResult = {
      pageNumber,
      rawVisionText: "",
      processedMarkdown: "",
      status: "failed",
      attempts,
      error: "Exceeded max retries",
      timestamp: new Date().toISOString(),
    };
    savePageResult(file.id, exhaustedResult);
    this.syncFileProgress(file, startTime);
    return exhaustedResult;
  }

  public getCurriculumMarkdown(fileId: string): string | null {
    const item = this.queue.find((f) => f.id === fileId);
    if (!item) return null;

    if (item.outputFilePath && fs.existsSync(item.outputFilePath)) {
      return fs.readFileSync(item.outputFilePath, "utf-8");
    }

    const cp = loadCheckpoint(fileId);
    if (!cp) return null;

    const sortedPageNumbers = Object.keys(cp.completedPages)
      .map(Number)
      .sort((a, b) => a - b);

    let md = `# منهج ${item.subjectName}\n\n`;
    for (const pNo of sortedPageNumbers) {
      const pageRes = cp.completedPages[pNo];
      if (pageRes && pageRes.processedMarkdown) {
        md += `\n\n<!-- بداية الصفحة ${pNo} -->\n` + pageRes.processedMarkdown;
      }
    }
    return cleanAndDeduplicateCurriculumMarkdown(md);
  }

  public reexportAllFiles(): { count: number; files: string[] } {
    const checkpointsDir = path.join(process.cwd(), "checkpoints");
    if (!fs.existsSync(checkpointsDir)) return { count: 0, files: [] };

    const checkpointFiles = fs
      .readdirSync(checkpointsDir)
      .filter((f) => f.startsWith("file_") && f.endsWith(".json"));

    const exportedFiles: string[] = [];

    for (const cpFile of checkpointFiles) {
      try {
        const fullPath = path.join(checkpointsDir, cpFile);
        const cp = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        if (!cp || !cp.completedPages || Object.keys(cp.completedPages).length === 0) continue;

        const stageDir = ensureOutputDir(cp.gradeLevel || "1_middle");
        const safeSubjectName = (cp.subjectName || "مادة").replace(/[\\/:*?"<>|]/g, "_");
        const outputPath = path.join(stageDir, `${safeSubjectName}.md`);

        const sortedPageNumbers = Object.keys(cp.completedPages)
          .map(Number)
          .sort((a, b) => a - b);

        let fullMarkdown = `# منهج ${cp.subjectName}\n\n`;
        for (const pNo of sortedPageNumbers) {
          const pageRes = cp.completedPages[pNo];
          if (pageRes && pageRes.processedMarkdown && pageRes.processedMarkdown.trim().length > 0) {
            fullMarkdown += `\n\n<!-- بداية الصفحة ${pNo} -->\n` + pageRes.processedMarkdown;
          }
        }

        const sanitizedMarkdown = cleanAndDeduplicateCurriculumMarkdown(fullMarkdown);
        fs.writeFileSync(outputPath, sanitizedMarkdown, "utf-8");
        exportedFiles.push(outputPath);
      } catch (err) {
        console.error(`Error re-exporting checkpoint ${cpFile}:`, err);
      }
    }

    return { count: exportedFiles.length, files: exportedFiles };
  }

  private log(
    level: "info" | "warn" | "error" | "success",
    message: string,
    fileId?: string,
    pageNumber?: number
  ) {
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
    if (this.onLogCallback) {
      this.onLogCallback(logItem);
    }
  }

  private notifyProgress() {
    if (this.onProgressCallback) {
      this.onProgressCallback(this.getQueue());
    }
  }
}
