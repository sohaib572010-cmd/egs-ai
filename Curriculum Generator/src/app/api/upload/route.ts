import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { GradeLevel, FileQueueItem } from "@/lib/types";
import { getPDFTotalPages } from "@/lib/pdf_parser";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export async function POST(req: Request) {
  try {
    ensureUploadsDir();

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const gradeLevel: GradeLevel = String(formData.get("gradeLevel") || "").trim().replace(/[^\w-]/g, "_").slice(0, 60) || "unassigned";
    const customSubjectName = (formData.get("subjectName") as string) || "";
    const outlineText = String(formData.get("outlineText") || "").slice(0, 20000).trim();

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "لم يتم تحديد أي ملفات مرفقة" },
        { status: 400 }
      );
    }

    const uploadedFiles: FileQueueItem[] = [];

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        continue;
      }

      const fileId = "file_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const safeFilename = file.name.replace(/[^\w\d_.-]/g, "_");
      const filePath = path.join(UPLOADS_DIR, `${fileId}_${safeFilename}`);

      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      // Pre-calculate total pages
      let totalPages = 0;
      try {
        totalPages = await getPDFTotalPages(buffer);
      } catch (cntErr) {
        console.warn(`Failed to count pages for ${file.name}:`, cntErr);
        totalPages = 1;
      }

      // Determine subject name: if custom is supplied and 1 file, use it; otherwise use file name
      let subjectName = customSubjectName.trim();
      if (!subjectName || files.length > 1) {
        subjectName = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
      }

      uploadedFiles.push({
        id: fileId,
        filename: file.name,
        filepath: filePath,
        gradeLevel,
        subjectName,
        totalPages,
        processedPages: 0,
        failedPages: 0,
        status: "pending",
        errorMessage: null,
        outputFilePath: null,
        startedAt: null,
        completedAt: null,
        currentOperation: "في قائمة الانتظار",
        outlineText: files.length === 1 && outlineText ? outlineText : undefined,
      });
    }

    return NextResponse.json({
      success: true,
      message: `تم رفع ${uploadedFiles.length} ملف بنجاح`,
      files: uploadedFiles,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "فشل رفع الملفات" },
      { status: 500 }
    );
  }
}
