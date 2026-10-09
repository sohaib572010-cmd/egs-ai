import type { OutlineNode } from "./outline";

/** Stage ids are managed in the EGS AI admin panel; these are suggestions for the upload form. */
export type GradeLevel = string;

export const KNOWN_STAGES: Record<string, string> = {
  "1_middle": "الصف الأول الإعدادي",
  "2_middle": "الصف الثاني الإعدادي",
  "3_middle": "الصف الثالث الإعدادي",
  "1_high": "الصف الأول الثانوي (بكالوريا)",
  "2_high": "السنة الثانية بكالوريا",
  "2_secondary_general": "الصف الثاني الثانوي العام",
  "2_secondary_azhar": "الصف الثاني الثانوي الأزهري",
};

export function stageLabel(id: string): string {
  return KNOWN_STAGES[id] || id;
}

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
  outlineText?: string;
}

export interface PageExtractionResult {
  pageNumber: number;
  rawVisionText: string;
  processedMarkdown: string;
  /** Page class from the extraction request (content, toc, front_matter, exercises, answer_key, blank). */
  pageType?: string;
  /** Outline lines read from a table-of-contents page. */
  tocText?: string;
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
  outline?: OutlineNode[] | null;
  outlineSource?: "manual" | "toc" | null;
  tocPages?: number[];
  lastUpdated: string;
}

export interface ProcessingSettings {
  /** DeepSeek-V4.1-Flash (deepseek-flash): one request per page reads, classifies and organizes it */
  deepSeekApiKey: string;
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
