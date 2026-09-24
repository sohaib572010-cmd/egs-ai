import { NextResponse } from "next/server";
import { QueueProcessor } from "@/lib/queue_processor";
import { FileQueueItem, ProcessingSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

declare global {
  var globalQueueProcessor: QueueProcessor | undefined;
}

const DEFAULT_EDENAI_KEY = process.env.EDENAI_API_KEY || "";
const DEFAULT_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || "";

function getProcessor(settings?: ProcessingSettings): QueueProcessor {
  if (!globalThis.globalQueueProcessor) {
    const defaultSettings: ProcessingSettings = {
      geminiApiKey: process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY,
      edenAiApiKey: process.env.EDENAI_API_KEY || DEFAULT_EDENAI_KEY,
      deepSeekApiKey: process.env.DEEPSEEK_API_KEY || DEFAULT_DEEPSEEK_KEY,
      batchSize: 3,
      maxConcurrentFiles: 2,
      maxRetries: 3,
      delayBetweenBatchesMs: 50,
      autoResumeOnStartup: true,
    };
    globalThis.globalQueueProcessor = new QueueProcessor(defaultSettings);
  } else if (settings) {
    globalThis.globalQueueProcessor.updateSettings(settings);
  }
  return globalThis.globalQueueProcessor;
}

export async function GET() {
  const processor = getProcessor();
  const currentSettings = processor.getSettings();

  return NextResponse.json({
    queue: processor.getQueue(),
    logs: processor.getLogs(),
    settings: {
      ...currentSettings,
      geminiApiKey: currentSettings.geminiApiKey ? "••••••••" : "",
      edenAiApiKey: currentSettings.edenAiApiKey ? "••••••••" : "",
      deepSeekApiKey: currentSettings.deepSeekApiKey ? "••••••••" : "",
      hasGeminiKey: !!currentSettings.geminiApiKey || !!process.env.GEMINI_API_KEY,
      hasEdenKey: !!currentSettings.edenAiApiKey || !!process.env.EDENAI_API_KEY,
      hasDeepSeekKey: !!currentSettings.deepSeekApiKey || !!process.env.DEEPSEEK_API_KEY,
      modelName: "DeepSeek-V4.1-Flash (deepseek-flash)",
      isMultimodal: true,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, fileId, files, settings } = body;

    const processor = getProcessor(settings);

    if (action === "add_files" && Array.isArray(files)) {
      processor.addFiles(files as FileQueueItem[]);
      return NextResponse.json({ success: true, queue: processor.getQueue() });
    }

    if (action === "start") {
      processor.startProcessing(); // non-blocking background queue execution
      return NextResponse.json({ success: true, message: "تم بدء المعالجة المتزامنة" });
    }

    if (action === "pause") {
      processor.pause();
      return NextResponse.json({ success: true, message: "تم إيقاف المعالجة مؤقتًا" });
    }

    if (action === "pause_file" && fileId) {
      processor.pauseFile(fileId);
      return NextResponse.json({ success: true, message: "تم إيقاف معالجة الملف مؤقتًا" });
    }

    if (action === "resume") {
      processor.resume();
      return NextResponse.json({ success: true, message: "تم استئناف المعالجة" });
    }

    if (action === "resume_file" && fileId) {
      processor.resumeFile(fileId);
      return NextResponse.json({ success: true, message: "تم استئناف معالجة الملف" });
    }

    if (action === "retry_failed") {
      processor.retryFailed(fileId);
      return NextResponse.json({ success: true, message: "جاري إعادة محاولة الصفحات المتعثرة" });
    }

    if (action === "delete_file" && fileId) {
      processor.deleteFile(fileId);
      return NextResponse.json({ success: true, message: "تم حذف الملف من القائمة" });
    }

    if (action === "clear_completed") {
      processor.clearCompleted();
      return NextResponse.json({ success: true, message: "تم مسح المناهج المكتملة" });
    }

    if (action === "preview" && fileId) {
      const markdown = processor.getCurriculumMarkdown(fileId);
      return NextResponse.json({ success: true, markdown });
    }

    if (action === "reexport_all") {
      const result = processor.reexportAllFiles();
      return NextResponse.json({ success: true, count: result.count, files: result.files });
    }

    if (action === "update_settings" && settings) {
      processor.updateSettings(settings);
      return NextResponse.json({ success: true, message: "تم تحديث الإعدادات" });
    }

    return NextResponse.json({ error: "الإجراء غير معروف" }, { status: 400 });
  } catch (error: any) {
    console.error("Process API error:", error);
    return NextResponse.json(
      { error: error.message || "حدث خطأ في خدمة المعالجة" },
      { status: 500 }
    );
  }
}
