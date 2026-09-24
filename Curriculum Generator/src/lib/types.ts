export type GradeLevel =
  | "1_middle"
  | "2_middle"
  | "3_middle"
  | "1_high"
  | "2_high"
  | "3_high";

export const GRADE_NAMES_AR: Record<GradeLevel, string> = {
  "1_middle": "الصف الأول الإعدادي",
  "2_middle": "الصف الثاني الإعدادي",
  "3_middle": "الصف الثالث الإعدادي",
  "1_high": "الصف الأول الثانوي",
  "2_high": "الصف الثاني الثانوي",
  "3_high": "الصف الثالث الثانوي",
};

export type FileStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "paused"
  | "waiting_network";

export interface FileQueueItem {
  id: string;
  filename: string;
  filepath: string;
  gradeLevel: GradeLevel;
  subjectName: string;
  totalPages: number;
  processedPages: number;
  failedPages: number;
  status: FileStatus;
  errorMessage: string | null;
  outputFilePath: string | null;
  startedAt: string | null;
  completedAt: string | null;
  currentOperation?: string;
  speedPagesPerMin?: number;
}

export interface PageExtractionResult {
  pageNumber: number;
  rawVisionText: string;
  processedMarkdown: string;
  detectedUnit?: string | null;
  detectedLesson?: string | null;
  status: "pending" | "success" | "failed";
  attempts: number;
  error: string | null;
  timestamp: string;
}

export interface JobCheckpoint {
  fileId: string;
  filename: string;
  gradeLevel: GradeLevel;
  subjectName: string;
  totalPages: number;
  completedPages: Record<number, PageExtractionResult>;
  lastUpdated: string;
}

export interface ProcessingSettings {
  /** Primary Multimodal Engine: DeepSeek-V4.1-Flash (deepseek-flash) for both page vision and curriculum structuring */
  deepSeekApiKey: string;
  /** Optional legacy fallback vision key */
  geminiApiKey?: string;
  /** Optional legacy fallback OCR/VQA key */
  edenAiApiKey?: string;
  batchSize: number;
  maxConcurrentFiles: number;
  maxRetries: number;
  delayBetweenBatchesMs: number;
  autoResumeOnStartup: boolean;
}

export interface ProcessingLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  fileId?: string;
  pageNumber?: number;
}

export interface QueueStateData {
  queue: FileQueueItem[];
  settings: ProcessingSettings;
  lastUpdated: string;
}
