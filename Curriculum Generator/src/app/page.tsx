"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Upload,
  Play,
  Pause,
  RotateCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Download,
  Settings,
  Terminal,
  Layers,
  BookOpen,
  Sliders,
  Trash2,
  Eye,
  Copy,
  Check,
  Zap,
  Gauge,
  FileCheck,
  Activity,
  X,
} from "lucide-react";
import {
  GradeLevel,
  KNOWN_STAGES,
  stageLabel,
  FileQueueItem,
  ProcessingLog,
  ProcessingSettings,
} from "@/lib/types";

export default function Dashboard() {
  const [mounted, setMounted] = useState<boolean>(false);
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel>("1_middle");
  const [subjectName, setSubjectName] = useState<string>("");
  const [outlineText, setOutlineText] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [logFilter, setLogFilter] = useState<"all" | "info" | "warn" | "error" | "success">("all");

  // Preview Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<FileQueueItem | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [previewOutline, setPreviewOutline] = useState<string>("");
  const [outlineStatus, setOutlineStatus] = useState<string>("");
  const [isSavingOutline, setIsSavingOutline] = useState<boolean>(false);

  const [settings, setSettings] = useState<ProcessingSettings>({
    deepSeekApiKey: "",
    batchSize: 8,
    maxConcurrentFiles: 2,
    maxRetries: 4,
    delayBetweenBatchesMs: 0,
    autoResumeOnStartup: true,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Poll status from server every 2 seconds
  useEffect(() => {
    if (!mounted) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [mounted]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs]);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/process");
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
        setLogs(data.logs || []);
        if (data.settings) {
          setSettings((prev) => ({
            ...prev,
            batchSize: data.settings.batchSize ?? prev.batchSize,
            maxConcurrentFiles: data.settings.maxConcurrentFiles ?? prev.maxConcurrentFiles,
            maxRetries: data.settings.maxRetries ?? prev.maxRetries,
            delayBetweenBatchesMs: data.settings.delayBetweenBatchesMs ?? prev.delayBetweenBatchesMs,
          }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch process status:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      formData.append("gradeLevel", selectedGrade);
      formData.append("subjectName", subjectName);
      formData.append("outlineText", outlineText);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        // Add files to queue
        await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add_files",
            files: uploadData.files,
            settings,
          }),
        });

        fetchStatus();
        setSubjectName("");
        setOutlineText("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAction = async (actionName: string, fileId?: string) => {
    try {
      await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionName,
          fileId,
          settings,
        }),
      });
      fetchStatus();
    } catch (error) {
      console.error(`Action ${actionName} error:`, error);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          settings,
        }),
      });
      setShowSettings(false);
      fetchStatus();
    } catch (error) {
      console.error("Save settings error:", error);
    }
  };

  const handleSaveOutline = async () => {
    if (!previewFile) return;
    setIsSavingOutline(true);
    setOutlineStatus("");
    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_outline", fileId: previewFile.id, outlineText: previewOutline }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.markdown) setPreviewMarkdown(data.markdown);
        setOutlineStatus(previewOutline.trim() ? `تم حفظ الفهرس (${data.lessons} درس) وإعادة تصدير المنهج.` : "تم حذف الفهرس المخصص.");
        fetchStatus();
      } else {
        setOutlineStatus(data.error || "تعذر حفظ الفهرس.");
      }
    } catch {
      setOutlineStatus("تعذر الاتصال بالخادم.");
    } finally {
      setIsSavingOutline(false);
    }
  };

  const handleOpenPreview = async (file: FileQueueItem) => {
    setPreviewFile(file);
    setPreviewModalOpen(true);
    setIsLoadingPreview(true);
    setCopied(false);
    setPreviewOutline(file.outlineText || "");
    setOutlineStatus("");

    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          fileId: file.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewMarkdown(data.markdown || "لا يوجد محتوى مستخرج بعد لهذا المنهج.");
      } else {
        setPreviewMarkdown("تعذر استرجاع المعاينة.");
      }
    } catch {
      setPreviewMarkdown("حدث خطأ أثناء تحميل المعاينة.");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(previewMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isProcessing = queue.some((f) => f.status === "processing");
  const activeWorkersCount = queue.filter((f) => f.status === "processing").length;
  const totalPagesInQueue = queue.reduce((sum, f) => sum + (f.totalPages || 0), 0);
  const processedPagesInQueue = queue.reduce((sum, f) => sum + (f.processedPages || 0), 0);
  const failedPagesInQueue = queue.reduce((sum, f) => sum + (f.failedPages || 0), 0);
  const progressPercent =
    totalPagesInQueue > 0 ? Math.round((processedPagesInQueue / totalPagesInQueue) * 100) : 0;

  const filteredLogs = logs.filter((log) => {
    if (logFilter === "all") return true;
    return log.level === logFilter;
  });

  if (!mounted) {
    return (
      <div suppressHydrationWarning style={{ minHeight: "100vh", backgroundColor: "var(--bg-main)" }} />
    );
  }

  return (
    <div suppressHydrationWarning style={{ padding: "24px", maxWidth: "1440px", margin: "0 auto" }}>
      {/* Header Bar */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--bg-surface)",
          padding: "20px 24px",
          borderRadius: "16px",
          border: "1px solid var(--border-color)",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              backgroundColor: "rgba(125, 161, 70, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--brand-primary)",
            }}
          >
            <BookOpen size={28} />
          </div>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-main)" }}>
              مُستخرج ومُنظّم المناهج الدراسية المتزامن (EGS AI Multi-Curriculum Engine)
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
              معالجة متوازية فائقة السرعة مدعومة بنموذج DeepSeek 4.1 متعدد الوسائط الموحد (رؤية بصرية وهيكلة تربوية مباشرة)
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "10px",
              backgroundColor: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#22C55E",
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            <CheckCircle2 size={16} />
            محرك DeepSeek 4.1 متعدد الوسائط مفعّل
          </span>

          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              backgroundColor: showSettings ? "var(--brand-primary)" : "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              color: showSettings ? "#000" : "var(--text-main)",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            <Settings size={18} />
            الإعدادات والتزامن
          </button>
        </div>
      </header>

      {/* Metrics Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#3B82F6",
            }}
          >
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>الكتب في القائمة</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--text-main)" }}>
              {queue.length}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              backgroundColor: "rgba(125, 161, 70, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--brand-primary)",
            }}
          >
            <Zap size={22} />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>المعالجة المتزامنة النشطة</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--brand-primary)" }}>
              {activeWorkersCount} من أصل {settings.maxConcurrentFiles} كتب
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#22C55E",
            }}
          >
            <FileCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>الصفحات المنجزة</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#22C55E" }}>
              {processedPagesInQueue} / {totalPagesInQueue} ({progressPercent}%)
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "16px 20px",
            borderRadius: "12px",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              backgroundColor: failedPagesInQueue > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(154, 160, 143, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: failedPagesInQueue > 0 ? "#EF4444" : "var(--text-muted)",
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>الصفحات المتعثرة</div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: "700",
                color: failedPagesInQueue > 0 ? "#EF4444" : "var(--text-muted)",
              }}
            >
              {failedPagesInQueue}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal / Drawer */}
      {showSettings && (
        <div
          style={{
            backgroundColor: "var(--bg-card)",
            padding: "24px",
            borderRadius: "16px",
            border: "1px solid var(--brand-primary)",
            marginBottom: "24px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Sliders size={20} color="var(--brand-primary)" />
              إعدادات محرك المعالجة ومفاتيح واجهات البرمجة (API Settings & Concurrency)
            </h3>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div>
              <label style={{ fontSize: "13px", color: "var(--text-main)", fontWeight: "600", display: "block", marginBottom: "6px" }}>
                مفتاح DeepSeek API Key (الأساسي والموصى به - نموذج DeepSeek 4.1 الموحد للرؤية والنصوص)
              </label>
              <input
                type="password"
                value={settings.deepSeekApiKey}
                onChange={(e) => setSettings({ ...settings, deepSeekApiKey: e.target.value })}
                placeholder="أدخل مفتاح DeepSeek (sk-...)"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  backgroundColor: "var(--bg-main)",
                  border: "1px solid var(--brand-primary)",
                  borderRadius: "8px",
                  color: "var(--text-main)",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "13px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                عدد الكتب المعالجة بالتوازي (Simultaneous Books): {settings.maxConcurrentFiles}
              </label>
              <input
                type="range"
                min="1"
                max="4"
                value={settings.maxConcurrentFiles}
                onChange={(e) => setSettings({ ...settings, maxConcurrentFiles: Number(e.target.value) })}
                style={{ width: "100%", accentColor: "var(--brand-primary)" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "13px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                حجم الدفعة لكل كتاب (Pages Batch Size): {settings.batchSize}
              </label>
              <input
                type="range"
                min="1"
                max="6"
                value={settings.batchSize}
                onChange={(e) => setSettings({ ...settings, batchSize: Number(e.target.value) })}
                style={{ width: "100%", accentColor: "var(--brand-primary)" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                padding: "8px 16px",
                backgroundColor: "transparent",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              إلغاء
            </button>
            <button
              onClick={handleSaveSettings}
              style={{
                padding: "8px 20px",
                backgroundColor: "var(--brand-primary)",
                border: "none",
                borderRadius: "8px",
                color: "#000",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              حفظ الإعدادات
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* Left Column: Upload & Queue */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Upload Card */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              padding: "24px",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
            }}
          >
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "700",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Upload size={20} color="var(--brand-primary)" />
              إضافة كتب ومناهج دراسية جديدة للقائمة
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
                marginBottom: "18px",
              }}
            >
              <div>
                <label style={{ fontSize: "13px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  المرحلة والصف الدراسي
                </label>
                <input
                  list="known-stages"
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value as GradeLevel)}
                  placeholder="معرف المرحلة كما في لوحة التحكم (مثال: 2_secondary_general)"
                  dir="ltr"
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    color: "var(--text-main)",
                    outline: "none",
                  }}
                />
                <datalist id="known-stages">
                  {Object.entries(KNOWN_STAGES).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </datalist>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                  {stageLabel(selectedGrade)}
                </span>
              </div>

              <div>
                <label style={{ fontSize: "13px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                  اسم المادة (اختياري عند رفع ملف مفرد)
                </label>
                <input
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="مثال: العلوم / اللغة العربية / الكيمياء"
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "10px",
                    color: "var(--text-main)",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ fontSize: "13px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                فهرس الكتاب (اختياري عند رفع ملف مفرد، ويُقرأ تلقائياً من صفحة الفهرس إن تُرك فارغاً)
              </label>
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                rows={4}
                placeholder={"الوحدة 1: ...\nالفصل 1: ...\nالدرس 1: ...\nمقدمة: ... (للأقسام التمهيدية قبل الوحدة الأولى)"}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  color: "var(--text-main)",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed var(--border-color)",
                borderRadius: "12px",
                padding: "28px",
                textAlign: "center",
                cursor: "pointer",
                backgroundColor: "var(--bg-card)",
                transition: "all 0.2s ease",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <FileText size={38} color="var(--brand-primary)" style={{ marginBottom: "10px" }} />
              <p style={{ fontSize: "15px", fontWeight: "600" }}>
                {isUploading ? "جاري فحص وتجهيز الملفات..." : "اضغط هنا أو اسحب ملفات الـ PDF لتسلسل المعالجة"}
              </p>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                يمكنك رفع عدة كتب دفعة واحدة ليتم تنفيذها بالتوازي تلقائياً
              </p>
            </div>
          </div>

          {/* Queue & Progress List */}
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              padding: "24px",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
            }}
          >
            {/* Queue Header & Global Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Layers size={20} color="var(--brand-primary)" />
                قائمة المناهج ({queue.length} كتب)
              </h2>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {!isProcessing ? (
                  <button
                    onClick={() => handleAction("start")}
                    disabled={queue.length === 0}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      backgroundColor: "var(--brand-primary)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#000",
                      fontWeight: "700",
                      fontSize: "13px",
                      cursor: queue.length === 0 ? "not-allowed" : "pointer",
                      opacity: queue.length === 0 ? 0.5 : 1,
                    }}
                  >
                    <Play size={16} />
                    بدء المعالجة المتزامنة
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction("pause")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      backgroundColor: "#EAB308",
                      border: "none",
                      borderRadius: "8px",
                      color: "#000",
                      fontWeight: "700",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    <Pause size={16} />
                    إيقاف مؤقت للكل
                  </button>
                )}

                {queue.some((f) => f.status === "paused") && (
                  <button
                    onClick={() => handleAction("resume")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    <RotateCw size={16} />
                    استئناف الكل
                  </button>
                )}

                {failedPagesInQueue > 0 && (
                  <button
                    onClick={() => handleAction("retry_failed")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      backgroundColor: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid #EF4444",
                      borderRadius: "8px",
                      color: "#EF4444",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    <RotateCcw size={16} />
                    إعادة محاولة المتعثرات
                  </button>
                )}

                {queue.some((f) => f.status === "completed") && (
                  <button
                    onClick={() => handleAction("clear_completed")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 12px",
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "var(--text-muted)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    مسح المكتمل
                  </button>
                )}
              </div>
            </div>

            {/* Queue Items */}
            {queue.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  backgroundColor: "var(--bg-card)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                }}
              >
                <Layers size={36} color="var(--border-color)" style={{ marginBottom: "12px" }} />
                <p style={{ fontSize: "15px", fontWeight: "600" }}>القائمة فارغة حالياً</p>
                <p style={{ fontSize: "13px", marginTop: "4px" }}>
                  قم برفع الكتب الدراسية بصيغة PDF للبدء في الهيكلة
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {queue.map((item) => {
                  const itemProgress =
                    item.totalPages > 0
                      ? Math.round((item.processedPages / item.totalPages) * 100)
                      : 0;

                  return (
                    <div
                      key={item.id}
                      style={{
                        backgroundColor: "var(--bg-card)",
                        padding: "18px 20px",
                        borderRadius: "12px",
                        border: `1px solid ${
                          item.status === "processing"
                            ? "var(--brand-primary)"
                            : item.status === "failed"
                            ? "#EF4444"
                            : "var(--border-color)"
                        }`,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {/* Top Row */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: "12px",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                              {item.subjectName}
                            </h3>
                            <span
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                backgroundColor: "rgba(125, 161, 70, 0.15)",
                                color: "var(--brand-primary)",
                                fontWeight: "600",
                              }}
                            >
                              {stageLabel(item.gradeLevel)}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--text-muted)",
                              marginTop: "4px",
                              display: "flex",
                              gap: "12px",
                            }}
                          >
                            <span>الملف: {item.filename}</span>
                            {item.speedPagesPerMin && item.status === "processing" && (
                              <span style={{ color: "var(--brand-primary)", fontWeight: "600" }}>
                                السرعة: {item.speedPagesPerMin} صفحة/دقيقة
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {item.status === "processing" && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                                padding: "4px 10px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(59, 130, 246, 0.15)",
                                color: "#3B82F6",
                                fontWeight: "600",
                              }}
                            >
                              <Activity size={14} className="animate-spin" />
                              قيد المعالجة بالتوازي
                            </span>
                          )}
                          {item.status === "completed" && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                                padding: "4px 10px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(34, 197, 94, 0.15)",
                                color: "#22C55E",
                                fontWeight: "600",
                              }}
                            >
                              <CheckCircle2 size={14} />
                              اكتمل المنهج
                            </span>
                          )}
                          {item.status === "pending" && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                                padding: "4px 10px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(234, 179, 8, 0.15)",
                                color: "#EAB308",
                                fontWeight: "600",
                              }}
                            >
                              <Clock size={14} />
                              في الانتظار
                            </span>
                          )}
                          {item.status === "paused" && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                                padding: "4px 10px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(154, 160, 143, 0.15)",
                                color: "var(--text-muted)",
                                fontWeight: "600",
                              }}
                            >
                              <Pause size={14} />
                              متوقف مؤقتاً
                            </span>
                          )}
                          {item.status === "failed" && (
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                                padding: "4px 10px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(239, 68, 68, 0.15)",
                                color: "#EF4444",
                                fontWeight: "600",
                              }}
                            >
                              <XCircle size={14} />
                              فشل
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ marginBottom: "12px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "12px",
                            color: "var(--text-muted)",
                            marginBottom: "6px",
                          }}
                        >
                          <span>
                            {item.currentOperation ||
                              (item.status === "completed"
                                ? "تم استخراج وحفظ كافة الصفحات بنجاح"
                                : "جاهز للبدء")}
                          </span>
                          <span style={{ fontWeight: "700", color: "var(--text-main)" }}>
                            {item.processedPages} / {item.totalPages || "?"} صفحة ({itemProgress}%)
                          </span>
                        </div>
                        <div
                          style={{
                            height: "6px",
                            backgroundColor: "var(--bg-main)",
                            borderRadius: "3px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${itemProgress}%`,
                              backgroundColor:
                                item.status === "failed"
                                  ? "#EF4444"
                                  : item.status === "completed"
                                  ? "#22C55E"
                                  : "var(--brand-primary)",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>

                      {/* Action Buttons Row */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {item.status === "processing" && (
                          <button
                            onClick={() => handleAction("pause_file", item.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              backgroundColor: "var(--bg-main)",
                              border: "1px solid var(--border-color)",
                              borderRadius: "6px",
                              color: "var(--text-main)",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            <Pause size={14} />
                            إيقاف
                          </button>
                        )}

                        {item.status === "paused" && (
                          <button
                            onClick={() => handleAction("resume_file", item.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              backgroundColor: "var(--brand-primary)",
                              border: "none",
                              borderRadius: "6px",
                              color: "#000",
                              fontWeight: "600",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            <Play size={14} />
                            استئناف
                          </button>
                        )}

                        {item.failedPages > 0 && (
                          <button
                            onClick={() => handleAction("retry_failed", item.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              backgroundColor: "rgba(239, 68, 68, 0.1)",
                              border: "1px solid #EF4444",
                              borderRadius: "6px",
                              color: "#EF4444",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            <RotateCcw size={14} />
                            إعادة محاولة ({item.failedPages})
                          </button>
                        )}

                        {item.processedPages > 0 && (
                          <button
                            onClick={() => handleOpenPreview(item)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              backgroundColor: "var(--bg-main)",
                              border: "1px solid var(--border-color)",
                              borderRadius: "6px",
                              color: "var(--brand-primary)",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            <Eye size={14} />
                            معاينة
                          </button>
                        )}

                        {item.outputFilePath && (
                          <a
                            href={`/api/download?fileId=${item.id}`}
                            download
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "6px 12px",
                              backgroundColor: "rgba(34, 197, 94, 0.15)",
                              border: "1px solid #22C55E",
                              borderRadius: "6px",
                              color: "#22C55E",
                              fontSize: "12px",
                              textDecoration: "none",
                              fontWeight: "600",
                            }}
                          >
                            <Download size={14} />
                            تحميل Markdown
                          </a>
                        )}

                        <button
                          onClick={() => handleAction("delete_file", item.id)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "6px",
                            backgroundColor: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                          }}
                          title="حذف من القائمة"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Terminal Activity Logs */}
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "20px",
            borderRadius: "16px",
            border: "1px solid var(--border-color)",
            position: "sticky",
            top: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <h2
              style={{
                fontSize: "15px",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Terminal size={18} color="var(--brand-primary)" />
              سجل العمليات المباشر (Live Logs)
            </h2>
          </div>

          {/* Filter Pills */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              marginBottom: "12px",
              overflowX: "auto",
              paddingBottom: "4px",
            }}
          >
            {(["all", "success", "info", "warn", "error"] as const).map((filter) => {
              const labels = {
                all: "الكل",
                success: "ناجح",
                info: "معلومات",
                warn: "تنبيه",
                error: "خطأ",
              };

              return (
                <button
                  key={filter}
                  onClick={() => setLogFilter(filter)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    borderRadius: "6px",
                    backgroundColor: logFilter === filter ? "var(--brand-primary)" : "var(--bg-card)",
                    color: logFilter === filter ? "#000" : "var(--text-muted)",
                    border: "1px solid var(--border-color)",
                    cursor: "pointer",
                    fontWeight: "600",
                  }}
                >
                  {labels[filter]}
                </button>
              );
            })}
          </div>

          {/* Log Window */}
          <div
            ref={logContainerRef}
            style={{
              backgroundColor: "var(--bg-main)",
              borderRadius: "10px",
              padding: "12px",
              height: "540px",
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              border: "1px solid var(--border-color)",
            }}
          >
            {filteredLogs.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  textAlign: "center",
                  marginTop: "40px",
                  fontSize: "13px",
                }}
              >
                لا توجد سجلات بعد
              </div>
            ) : (
              filteredLogs.map((log) => {
                const colorMap = {
                  info: "var(--text-main)",
                  success: "#22C55E",
                  warn: "#EAB308",
                  error: "#EF4444",
                };

                return (
                  <div
                    key={log.id}
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "flex-start",
                      lineHeight: "1.4",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)", flexShrink: 0, fontSize: "11px" }}>
                      [{log.timestamp}]
                    </span>
                    <span style={{ color: colorMap[log.level], wordBreak: "break-word" }}>
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Preview Markdown Modal */}
      {previewModalOpen && previewFile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
              width: "100%",
              maxWidth: "900px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 12px 48px rgba(0, 0, 0, 0.6)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)" }}>
                  معاينة المنهج المهيكل: {previewFile.subjectName}
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {stageLabel(previewFile.gradeLevel)} - تم استخراج {previewFile.processedPages} صفحة
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button
                  onClick={handleCopyMarkdown}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    color: "var(--text-main)",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  {copied ? <Check size={16} color="#22C55E" /> : <Copy size={16} />}
                  {copied ? "تم النسخ" : "نسخ المحتوى"}
                </button>

                {previewFile.outputFilePath && (
                  <a
                    href={`/api/download?fileId=${previewFile.id}`}
                    download
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      backgroundColor: "var(--brand-primary)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#000",
                      fontWeight: "700",
                      fontSize: "13px",
                      textDecoration: "none",
                    }}
                  >
                    <Download size={16} />
                    تحميل
                  </a>
                )}

                <button
                  onClick={() => setPreviewModalOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: "24px",
                overflowY: "auto",
                flex: 1,
                backgroundColor: "var(--bg-main)",
              }}
            >
              <details
                style={{
                  marginBottom: "16px",
                  border: "1px solid var(--border-color)",
                  borderRadius: "10px",
                  backgroundColor: "var(--bg-card)",
                  padding: "12px 14px",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Layers size={16} color="var(--brand-primary)" />
                  فهرس الكتاب المعتمد لضبط الوحدات والدروس
                </summary>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "10px 0" }}>
                  سطر لكل عنصر: &quot;الوحدة 1: ...&quot; أو &quot;الفصل 2: ...&quot; أو &quot;الدرس 1: ...&quot; أو &quot;مقدمة: ...&quot;. عند الحفظ يُعاد بناء المنهج فوراً دون أي استهلاك لواجهات الذكاء الاصطناعي.
                </p>
                <textarea
                  value={previewOutline}
                  onChange={(e) => setPreviewOutline(e.target.value)}
                  rows={8}
                  style={{
                    width: "100%",
                    padding: "10px",
                    backgroundColor: "var(--bg-main)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                    color: "var(--text-main)",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "10px" }}>
                  <button
                    onClick={handleSaveOutline}
                    disabled={isSavingOutline}
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "var(--brand-primary)",
                      color: "#0D1B2A",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: 700,
                      cursor: isSavingOutline ? "wait" : "pointer",
                    }}
                  >
                    {isSavingOutline ? "جاري الحفظ..." : "حفظ الفهرس وإعادة التصدير"}
                  </button>
                  {outlineStatus && <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{outlineStatus}</span>}
                </div>
              </details>
              {isLoadingPreview ? (
                <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  جاري تجهيز المعاينة...
                </div>
              ) : (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "inherit",
                    fontSize: "14px",
                    lineHeight: "1.7",
                    color: "var(--text-main)",
                  }}
                >
                  {previewMarkdown}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
