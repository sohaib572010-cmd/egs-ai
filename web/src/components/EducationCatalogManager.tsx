'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  GraduationCap,
  Layers,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Route,
  Save,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import {
  EducationCatalog,
  EducationStage,
  EducationSystem,
  EducationTrack,
  StageLevel,
  curriculumStageIds,
  findStage,
  findTrack,
  sortedSystems,
  stageName,
  stagesOfSystem,
  tracksOfStage,
} from '@/lib/education_catalog';

export interface ManagedCurriculum {
  id: string;
  grade_level: string;
  subject_name: string;
  track_id?: string | null;
  is_elective?: boolean;
  is_placeholder?: boolean;
}

interface Usage {
  studentsByStage: Record<string, number>;
  studentsByTrack: Record<string, number>;
  curriculaByStage: Record<string, number>;
  curriculaByTrack: Record<string, number>;
}

interface Props {
  token: string | null;
  curricula: ManagedCurriculum[];
  onCatalogSaved: (catalog: EducationCatalog) => void;
  onCurriculaChanged: () => void;
}

const LEVELS: { value: StageLevel; label: string }[] = [
  { value: 'primary', label: 'ابتدائي' },
  { value: 'preparatory', label: 'إعدادي' },
  { value: 'secondary', label: 'ثانوي' },
  { value: 'other', label: 'أخرى' },
];

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function moveItem<T extends { order: number }>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, i) => ({ ...item, order: i + 1 }));
}

export default function EducationCatalogManager({ token, curricula, onCatalogSaved, onCurriculaChanged }: Props) {
  const [saved, setSaved] = useState<EducationCatalog | null>(null);
  const [draft, setDraft] = useState<EducationCatalog | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Expand / Collapse states
  const [expandedSystems, setExpandedSystems] = useState<Record<string, boolean>>({});
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});

  // Active section inside expanded stage: 'subjects' | 'tracks' | 'settings'
  const [stageActiveSection, setStageActiveSection] = useState<Record<string, 'subjects' | 'tracks' | 'settings'>>({});

  // Manage sharing popover for a subject: curriculumId -> boolean
  const [sharingSubjectId, setSharingSubjectId] = useState<string | null>(null);

  // Status editing for a specific subject row (e.g. optional vs standard, placeholder vs complete, track)
  const [editingStatusSubjectId, setEditingStatusSubjectId] = useState<string | null>(null);
  const [updatingSubjectId, setUpdatingSubjectId] = useState<string | null>(null);
  const [editTrackId, setEditTrackId] = useState<string>('');
  const [editIsElective, setEditIsElective] = useState<boolean>(false);
  const [editIsPlaceholder, setEditIsPlaceholder] = useState<boolean>(false);

  // Add Subject inline drawer/modal: stageId -> boolean
  const [stageAddSubjectOpen, setStageAddSubjectOpen] = useState<string | null>(null);
  const [addSubjectTab, setAddSubjectTab] = useState<'new' | 'existing'>('new');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjTrackId, setNewSubjTrackId] = useState('');
  const [newSubjIsElective, setNewSubjIsElective] = useState(false);
  const [newSubjMode, setNewSubjMode] = useState<'placeholder' | 'file'>('placeholder');
  const [newSubjFile, setNewSubjFile] = useState<File | null>(null);
  const [newSubjShareStages, setNewSubjShareStages] = useState<string[]>([]);
  const [existingSubjId, setExistingSubjId] = useState('');
  const [submittingSubject, setSubmittingSubject] = useState(false);

  // New system input
  const [newSystemName, setNewSystemName] = useState('');
  const [showAddSystem, setShowAddSystem] = useState(false);

  // Global shared subjects accordion
  const [globalSharingOpen, setGlobalSharingOpen] = useState(false);
  const [globalSubjectExpanded, setGlobalSubjectExpanded] = useState<string | null>(null);

  const authHeaders = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/admin/education', { headers: authHeaders, cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر تحميل الأنظمة التعليمية.');
        if (cancelled) return;
        setSaved(data.catalog);
        setDraft(data.catalog);
        setUsage(data.usage);

        // Expand the first system by default if present
        if (data.catalog?.systems?.length > 0) {
          const firstSysId = sortedSystems(data.catalog)[0]?.id;
          if (firstSysId) {
            setExpandedSystems({ [firstSysId]: true });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setMessage({ text: err instanceof Error ? err.message : 'تعذر تحميل الأنظمة التعليمية.', type: 'danger' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, authHeaders]);

  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);

  const update = (fn: (c: EducationCatalog) => EducationCatalog) => {
    setDraft((prev) => (prev ? fn(structuredClone(prev)) : prev));
    setMessage(null);
  };

  const patchSystem = (id: string, changes: Partial<EducationSystem>) =>
    update((c) => ({ ...c, systems: c.systems.map((s) => (s.id === id ? { ...s, ...changes } : s)) }));
  const patchStage = (id: string, changes: Partial<EducationStage>) =>
    update((c) => ({ ...c, stages: c.stages.map((s) => (s.id === id ? { ...s, ...changes } : s)) }));
  const patchTrack = (id: string, changes: Partial<EducationTrack>) =>
    update((c) => ({ ...c, tracks: c.tracks.map((t) => (t.id === id ? { ...t, ...changes } : t)) }));

  const stageInUse = (id: string) =>
    (usage?.studentsByStage[id] || 0) + (usage?.curriculaByStage[id] || 0) > 0 ||
    curricula.some((c) => c.grade_level === id || (draft && curriculumStageIds(draft, c).includes(id)));

  const trackInUse = (id: string) =>
    (usage?.studentsByTrack[id] || 0) + (usage?.curriculaByTrack[id] || 0) > 0 ||
    curricula.some((c) => c.track_id === id);

  const toggleSystemExpand = (sysId: string) => {
    setExpandedSystems((prev) => ({ ...prev, [sysId]: !prev[sysId] }));
  };

  const toggleStageExpand = (stageId: string) => {
    setExpandedStages((prev) => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  const expandAll = () => {
    if (!draft) return;
    const sysMap: Record<string, boolean> = {};
    const stageMap: Record<string, boolean> = {};
    draft.systems.forEach((s) => { sysMap[s.id] = true; });
    draft.stages.forEach((st) => { stageMap[st.id] = true; });
    setExpandedSystems(sysMap);
    setExpandedStages(stageMap);
  };

  const collapseAll = () => {
    setExpandedSystems({});
    setExpandedStages({});
    setSharingSubjectId(null);
    setEditingStatusSubjectId(null);
    setStageAddSubjectOpen(null);
  };

  const addSystem = () => {
    const name = newSystemName.trim();
    if (!name) return;
    const newSysId = newId('sys');
    update((c) => ({
      ...c,
      systems: [...c.systems, { id: newSysId, name, description: '', order: c.systems.length + 1, active: true }],
    }));
    setNewSystemName('');
    setShowAddSystem(false);
    setExpandedSystems((prev) => ({ ...prev, [newSysId]: true }));
    setMessage({ text: `تمت إضافة نظام "${name}" بنجاح. أضف الصفوف الدراسية التابعة له أدناه.`, type: 'success' });
  };

  const addStage = (systemId: string) => {
    const stageId = newId('stage');
    update((c) => ({
      ...c,
      stages: [
        ...c.stages,
        {
          id: stageId,
          systemId,
          name: 'صف دراسي جديد',
          level: 'secondary',
          order: stagesOfSystem(c, systemId).length + 1,
          active: true,
          electivesEnabled: false,
        },
      ],
    }));
    setExpandedStages((prev) => ({ ...prev, [stageId]: true }));
    setStageActiveSection((prev) => ({ ...prev, [stageId]: 'settings' }));
  };

  const addTrack = (stageId: string) =>
    update((c) => ({
      ...c,
      tracks: [
        ...c.tracks,
        {
          id: newId('track'),
          stageId,
          name: 'مسار جديد',
          description: '',
          order: tracksOfStage(c, stageId).length + 1,
          active: true,
        },
      ],
    }));

  const moveStage = (systemId: string, index: number, delta: number) =>
    update((c) => {
      const moved = moveItem(stagesOfSystem(c, systemId), index, delta);
      return { ...c, stages: [...c.stages.filter((s) => s.systemId !== systemId), ...moved] };
    });

  const moveSystem = (index: number, delta: number) =>
    update((c) => ({ ...c, systems: moveItem(sortedSystems(c), index, delta) }));

  const toggleLink = (curriculumId: string, key: 'stageIds' | 'trackIds', value: string) =>
    update((c) => {
      const link = c.subjectLinks[curriculumId] || { stageIds: [], trackIds: [] };
      const list = link[key].includes(value) ? link[key].filter((x) => x !== value) : [...link[key], value];
      const next = { ...link, [key]: list };
      const subjectLinks = { ...c.subjectLinks };
      if (next.stageIds.length || next.trackIds.length) subjectLinks[curriculumId] = next;
      else delete subjectLinks[curriculumId];
      return { ...c, subjectLinks };
    });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/education', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ catalog: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر الحفظ.');
      setSaved(data.catalog);
      setDraft(data.catalog);
      setUsage(data.usage);
      onCatalogSaved(data.catalog);
      setMessage({ text: 'تم حفظ الأنظمة والمراحل والمواد المشتركة بنجاح، وستظهر للطلاب فوراً.', type: 'success' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'تعذر الحفظ.', type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  // Modify subject status in a specific row (e.g. optional to standard, placeholder to complete, or track)
  const updateSubjectStatus = async (
    curr: ManagedCurriculum,
    changes: { is_elective?: boolean; is_placeholder?: boolean; track_id?: string | null }
  ) => {
    setUpdatingSubjectId(curr.id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/curriculum', {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          id: curr.id,
          ...changes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تعديل حالة المادة.');

      onCurriculaChanged();
      setEditingStatusSubjectId(null);

      let changeDesc = 'تم تحديث حالة وبيانات المادة بنجاح';
      if (changes.is_elective !== undefined) {
        changeDesc = changes.is_elective
          ? 'تم تغيير نوع المادة إلى: "مادة اختيارية (Optional)"'
          : 'تم تغيير نوع المادة إلى: "مادة أساسية (Standard)"';
      } else if (changes.is_placeholder !== undefined) {
        changeDesc = changes.is_placeholder
          ? 'تم تغيير حالة المادة إلى: "قيد الإعداد (Placeholder)"'
          : 'تم تفعيل المادة كـ: "منهج مكتمل (Complete)"';
      } else if (changes.track_id !== undefined) {
        changeDesc = changes.track_id
          ? `تم ربط المادة بالمسار: "${findTrack(draft!, changes.track_id)?.name || changes.track_id}"`
          : 'أصبحت المادة مشتركة لكافة المسارات';
      }

      setMessage({
        text: `تم تحديث مادة "${curr.subject_name}": ${changeDesc}.`,
        type: 'success',
      });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'تعذر تعديل حالة المادة.',
        type: 'danger',
      });
    } finally {
      setUpdatingSubjectId(null);
    }
  };

  // Add a new subject to a specific stage
  const handleCreateNewSubject = async (stageId: string) => {
    const cleanName = newSubjName.trim();
    if (!cleanName) {
      setMessage({ text: 'يرجى كتابة اسم المادة الدراسية.', type: 'danger' });
      return;
    }
    setSubmittingSubject(true);
    setMessage(null);
    try {
      let createdCurriculumId: string | null = null;

      if (newSubjMode === 'placeholder') {
        const res = await fetch('/api/admin/curriculum', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            grade_level: stageId,
            subject_name: cleanName,
            track_id: newSubjTrackId || null,
            is_elective: newSubjIsElective,
            is_placeholder: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشلت إضافة المادة.');
        createdCurriculumId = data.curriculum?.id;
      } else {
        if (!newSubjFile) {
          throw new Error('يرجى اختيار ملف المنهج بصيغة Markdown (.md).');
        }
        const formData = new FormData();
        formData.append('grade_level', stageId);
        formData.append('subject_name', cleanName);
        if (newSubjTrackId) formData.append('track_id', newSubjTrackId);
        if (newSubjIsElective) formData.append('is_elective', 'true');
        formData.append('file', newSubjFile);

        const res = await fetch('/api/admin/curriculum', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل رفع وتجهيز ملف المنهج.');
        createdCurriculumId = data.curriculum?.id;
      }

      // If user selected extra stages to share this newly created subject with:
      if (createdCurriculumId && newSubjShareStages.length > 0) {
        update((c) => {
          const next = { ...c.subjectLinks };
          next[createdCurriculumId!] = {
            stageIds: newSubjShareStages,
            trackIds: [],
          };
          return { ...c, subjectLinks: next };
        });
      }

      onCurriculaChanged();
      setStageAddSubjectOpen(null);
      setNewSubjName('');
      setNewSubjTrackId('');
      setNewSubjIsElective(false);
      setNewSubjFile(null);
      setNewSubjShareStages([]);
      setMessage({
        text: `تمت إضافة مادة "${cleanName}" بنجاح لهذا الصف${newSubjShareStages.length > 0 ? '، وتمت مشاركتها مع الصفوف المحددة' : ''}.`,
        type: 'success',
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'حدث خطأ أثناء إضافة المادة.', type: 'danger' });
    } finally {
      setSubmittingSubject(false);
    }
  };

  // Link an existing subject from another stage to this stage
  const handleLinkExistingSubject = (stageId: string, curriculumId: string) => {
    if (!curriculumId) return;
    const curr = curricula.find((c) => c.id === curriculumId);
    if (!curr) return;

    toggleLink(curriculumId, 'stageIds', stageId);
    setStageAddSubjectOpen(null);
    setExistingSubjId('');
    setMessage({
      text: `تمت مشاركة مادة "${curr.subject_name}" مع هذا الصف بنجاح. اضغط "حفظ كافة التغييرات" لتثبيت الرابط للطلاب.`,
      type: 'success',
    });
  };

  // Delete or unlink a subject for a specific grade level
  const handleRemoveSubjectFromStage = async (stageId: string, curr: ManagedCurriculum) => {
    // Case 1: Subject is shared into this stage (not the native home)
    if (curr.grade_level !== stageId) {
      const confirmed = window.confirm(
        `هل أنت متأكد من إلغاء مشاركة مادة "${curr.subject_name}" من هذا الصف؟\n(ملاحظة: لن تتأثر المادة في صفها الأصلي وسيستمر طلاب الصف الأصلي في استخدامها بشكل طبيعي)`
      );
      if (!confirmed) return;
      toggleLink(curr.id, 'stageIds', stageId);
      setMessage({
        text: `تم إلغاء مشاركة مادة "${curr.subject_name}" من هذا الصف. يرجى الضغط على زر "حفظ كافة التغييرات" باللون الأزرق بالأعلى لاعتماد الحذف.`,
        type: 'success',
      });
      return;
    }

    // Case 2: Subject is primary to this stage
    const otherStages = draft?.subjectLinks[curr.id]?.stageIds || [];
    if (otherStages.length > 0) {
      const names = otherStages.map((id) => stageName(draft!, id)).join('، ');
      const confirmed = window.confirm(
        `تنبيه هام:\nهذا الصف هو المالك الأساسي لمادة "${curr.subject_name}".\nهذه المادة مشتركة حالياً مع صفوف أخرى: (${names}).\nحذفها الآن سيؤدي لحذف المنهج وبياناته بالكامل من جميع الصفوف.\nهل تريد المتابعة وحذف المادة نهائياً؟`
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(`هل أنت متأكد من حذف مادة "${curr.subject_name}" نهائياً من هذا الصف؟`);
      if (!confirmed) return;
    }

    try {
      const res = await fetch('/api/admin/curriculum', {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({ id: curr.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حذف المنهج.');

      // Clean up link from draft if present
      update((c) => {
        const next = { ...c.subjectLinks };
        delete next[curr.id];
        return { ...c, subjectLinks: next };
      });

      onCurriculaChanged();
      setMessage({ text: `تم حذف مادة "${curr.subject_name}" بنجاح.`, type: 'success' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'فشل حذف المنهج.', type: 'danger' });
    }
  };

  if (loading || !draft) {
    return (
      <div className="glass catalog-panel catalog-loading">
        <Loader2 size={18} className="animate-spin" /> جاري تحميل الأنظمة والمراحل التعليمية...
      </div>
    );
  }

  const allSystems = sortedSystems(draft);

  // Filter systems and stages based on search query
  const q = searchQuery.trim().toLowerCase();
  const filteredSystems = allSystems.filter((sys) => {
    if (!q) return true;
    if (sys.name.toLowerCase().includes(q)) return true;
    const stages = stagesOfSystem(draft, sys.id);
    return stages.some((st) => {
      if (st.name.toLowerCase().includes(q)) return true;
      const stageCurrs = curricula.filter((c) => curriculumStageIds(draft, c).includes(st.id));
      return stageCurrs.some((c) => c.subject_name.toLowerCase().includes(q));
    });
  });

  const totalStagesCount = draft.stages.length;
  const totalCurriculaCount = curricula.length;

  return (
    <div className="catalog-manager">
      {/* Top Header Panel */}
      <div className="glass catalog-panel">
        <div className="catalog-header">
          <div>
            <h3>
              <Layers size={20} /> هيكل الأنظمة والمراحل والمواد الدراسية
            </h3>
            <p>
              لوحة متطورة وبسيطة لإدارة الأنظمة التعليمية، الصفوف، والشعب، مع إمكانية إضافة وحذف وتعديل حالة المواد لكل صف دراسي (أساسية/اختيارية، مكتملة/قيد الإعداد) ومشاركة المناهج عبر عدة صفوف بدون تكرار الرفع.
            </p>
          </div>
          <div className="catalog-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={!dirty || saving}
              onClick={() => {
                setDraft(saved);
                setMessage(null);
              }}
            >
              <RotateCcw size={15} /> تراجع
            </button>
            <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={save}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} حفظ كافة التغييرات
            </button>
          </div>
        </div>

        {message && (
          <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
            {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Quick Toolbar: Stats, Search, Expand/Collapse, and Add System */}
        <div className="catalog-toolbar">
          <div className="catalog-stats-pills">
            <span className="catalog-stat-pill">
              <strong>{allSystems.length}</strong> أنظمة
            </span>
            <span className="catalog-stat-pill">
              <strong>{totalStagesCount}</strong> صفوف دراسية
            </span>
            <span className="catalog-stat-pill">
              <strong>{totalCurriculaCount}</strong> مادة مفهرسة
            </span>
          </div>

          <div className="catalog-search-box">
            <Search size={15} className="catalog-search-icon" />
            <input
              type="text"
              className="form-input catalog-search-input"
              placeholder="ابحث عن نظام، صف، أو مادة دراسية..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="catalog-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="مسح البحث"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="catalog-toolbar-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={expandAll}>
              <ChevronDown size={14} /> توسيع الكل
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={collapseAll}>
              <ChevronUp size={14} /> طي الكل
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setShowAddSystem(!showAddSystem)}
            >
              <Plus size={14} /> إضافة نظام تعليمي جديد
            </button>
          </div>
        </div>

        {/* Inline Add New System Drawer */}
        {showAddSystem && (
          <div className="catalog-new-system-box">
            <div className="catalog-new-system-head">
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>إضافة نظام تعليمي جديد</span>
              <button
                type="button"
                className="catalog-icon-btn"
                onClick={() => setShowAddSystem(false)}
                aria-label="إغلاق"
              >
                <X size={14} />
              </button>
            </div>
            <div className="catalog-row">
              <input
                className="form-input catalog-name"
                value={newSystemName}
                maxLength={80}
                placeholder="اسم النظام الجديد (مثال: التعليم الأزهري، الدبلومة الأمريكية، مدارس النيل...)"
                onChange={(e) => setNewSystemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSystem();
                }}
                autoFocus
              />
              <button
                type="button"
                className="btn-primary"
                onClick={addSystem}
                disabled={!newSystemName.trim()}
              >
                <Plus size={15} /> إنشاء النظام
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Systems List */}
        <div className="catalog-systems-accordion">
          {filteredSystems.map((sys, sysIndex) => {
            const isSysExpanded = q ? true : !!expandedSystems[sys.id];
            const stages = stagesOfSystem(draft, sys.id).filter((st) => {
              if (!q) return true;
              if (st.name.toLowerCase().includes(q)) return true;
              const stageCurrs = curricula.filter((c) => curriculumStageIds(draft, c).includes(st.id));
              return stageCurrs.some((c) => c.subject_name.toLowerCase().includes(q));
            });
            const allSysStages = stagesOfSystem(draft, sys.id);
            const sysCurriculaCount = curricula.filter((c) =>
              allSysStages.some((st) => curriculumStageIds(draft, c).includes(st.id))
            ).length;

            return (
              <div key={sys.id} className={`catalog-system-card${sys.active ? '' : ' inactive'}`}>
                {/* System Header (Clickable to Expand/Collapse) */}
                <div
                  className="catalog-system-header"
                  onClick={() => toggleSystemExpand(sys.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isSysExpanded}
                >
                  <button
                    type="button"
                    className="catalog-collapse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSystemExpand(sys.id);
                    }}
                    aria-label={isSysExpanded ? 'طي النظام' : 'توسيع النظام'}
                  >
                    {isSysExpanded ? <ChevronDown size={18} /> : <ChevronLeft size={18} />}
                  </button>

                  <div className="catalog-system-title-wrap">
                    <Layers size={18} className="catalog-system-icon" />
                    <span className="catalog-system-name">{sys.name}</span>
                    <span className={`catalog-badge ${sys.active ? 'badge-active' : 'badge-inactive'}`}>
                      {sys.active ? 'مفعل للطلاب' : 'معطل مؤقتاً'}
                    </span>
                    <span className="catalog-badge badge-meta">
                      {allSysStages.length} صفوف · {sysCurriculaCount} مادة
                    </span>
                  </div>

                  {/* System Header Controls */}
                  <div
                    className="catalog-system-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className="catalog-toggle" title="تفعيل أو تعطيل ظهور هذا النظام للطلاب الجدد">
                      <input
                        type="checkbox"
                        checked={sys.active}
                        onChange={(e) => patchSystem(sys.id, { active: e.target.checked })}
                      />
                      <span>مفعل</span>
                    </label>

                    <div className="catalog-icon-group">
                      <button
                        type="button"
                        className="catalog-icon-btn"
                        disabled={sysIndex === 0}
                        onClick={() => moveSystem(sysIndex, -1)}
                        title="تحريك النظام لأعلى"
                        aria-label="تحريك لأعلى"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="catalog-icon-btn"
                        disabled={sysIndex === allSystems.length - 1}
                        onClick={() => moveSystem(sysIndex, 1)}
                        title="تحريك النظام لأسفل"
                        aria-label="تحريك لأسفل"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="catalog-icon-btn danger"
                        disabled={allSysStages.length > 0}
                        title={allSysStages.length > 0 ? 'احذف أو انقل صفوف هذا النظام أولاً لتتمكن من حذفه' : 'حذف النظام'}
                        onClick={() =>
                          update((c) => ({
                            ...c,
                            systems: c.systems.filter((s) => s.id !== sys.id),
                          }))
                        }
                        aria-label="حذف النظام"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* System Body (Only Rendered When Expanded) */}
                {isSysExpanded && (
                  <div className="catalog-system-body">
                    {/* System Quick Settings Row */}
                    <div className="catalog-system-details-row">
                      <div style={{ flex: '1 1 240px' }}>
                        <label className="catalog-field-label">اسم النظام التعليمي:</label>
                        <input
                          className="form-input"
                          value={sys.name}
                          maxLength={80}
                          onChange={(e) => patchSystem(sys.id, { name: e.target.value })}
                        />
                      </div>
                      <div style={{ flex: '2 1 320px' }}>
                        <label className="catalog-field-label">وصف توضيحي للطلاب (اختياري):</label>
                        <input
                          className="form-input"
                          value={sys.description}
                          maxLength={200}
                          placeholder="مثال: يتبع المنهج الأزهري بمواده الشرعية والعربية..."
                          onChange={(e) => patchSystem(sys.id, { description: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Stages of this System */}
                    <div className="catalog-stages-header-bar">
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                        الصفوف الدراسية التابعة لنظام "{sys.name}" ({stages.length})
                      </span>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => addStage(sys.id)}
                      >
                        <Plus size={14} /> إضافة صف دراسي جديد
                      </button>
                    </div>

                    {stages.length === 0 ? (
                      <div className="catalog-empty-notice">
                        لا يوجد صفوف مضافة في هذا النظام بعد. انقر على "إضافة صف دراسي جديد" لبدء إضافة الصفوف والمناهج.
                      </div>
                    ) : (
                      <div className="catalog-stages-list">
                        {stages.map((stage, stageIndex) => {
                          const isStageExpanded = q ? true : !!expandedStages[stage.id];
                          const tracks = tracksOfStage(draft, stage.id);
                          const stageUsage = usage?.studentsByStage[stage.id] || 0;
                          const inUse = stageInUse(stage.id);

                          // All curricula associated with this stage:
                          const stageCurricula = curricula.filter((c) =>
                            curriculumStageIds(draft, c).includes(stage.id)
                          );
                          const activeSection = stageActiveSection[stage.id] || 'subjects';
                          const isAddingSubjectHere = stageAddSubjectOpen === stage.id;

                          return (
                            <div
                              key={stage.id}
                              className={`catalog-stage-card${stage.active ? '' : ' inactive'}`}
                            >
                              {/* Stage Header (Clickable) */}
                              <div
                                className="catalog-stage-header"
                                onClick={() => toggleStageExpand(stage.id)}
                                role="button"
                                tabIndex={0}
                                aria-expanded={isStageExpanded}
                              >
                                <button
                                  type="button"
                                  className="catalog-collapse-btn sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleStageExpand(stage.id);
                                  }}
                                  aria-label={isStageExpanded ? 'طي الصف' : 'توسيع الصف'}
                                >
                                  {isStageExpanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
                                </button>

                                <div className="catalog-stage-title-wrap">
                                  <GraduationCap size={16} className="catalog-stage-icon" />
                                  <span className="catalog-stage-name">{stage.name}</span>
                                  <span className="catalog-badge badge-level">
                                    {LEVELS.find((l) => l.value === stage.level)?.label || stage.level}
                                  </span>
                                  <span className={`catalog-badge ${stage.active ? 'badge-active' : 'badge-inactive'}`}>
                                    {stage.active ? 'مفعل' : 'معطل'}
                                  </span>
                                  <span className="catalog-badge badge-meta">
                                    {stageCurricula.length} مواد · {tracks.length} مسارات · {stageUsage} طالب
                                  </span>
                                </div>

                                <div
                                  className="catalog-stage-actions"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <label className="catalog-toggle">
                                    <input
                                      type="checkbox"
                                      checked={stage.active}
                                      onChange={(e) => patchStage(stage.id, { active: e.target.checked })}
                                    />
                                    <span>مفعل</span>
                                  </label>

                                  <div className="catalog-icon-group">
                                    <button
                                      type="button"
                                      className="catalog-icon-btn"
                                      disabled={stageIndex === 0}
                                      onClick={() => moveStage(sys.id, stageIndex, -1)}
                                      title="تحريك لأعلى"
                                      aria-label="تحريك لأعلى"
                                    >
                                      <ArrowUp size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="catalog-icon-btn"
                                      disabled={stageIndex === stages.length - 1}
                                      onClick={() => moveStage(sys.id, stageIndex, 1)}
                                      title="تحريك لأسفل"
                                      aria-label="تحريك لأسفل"
                                    >
                                      <ArrowDown size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      className="catalog-icon-btn danger"
                                      disabled={inUse}
                                      title={
                                        inUse
                                          ? 'لا يمكن حذف هذا الصف لوجود طلاب أو مناهج مرتبطة به؛ يمكنك إيقاف تفعيله بدلاً من ذلك'
                                          : 'حذف الصف'
                                      }
                                      onClick={() =>
                                        update((c) => ({
                                          ...c,
                                          stages: c.stages.filter((s) => s.id !== stage.id),
                                          tracks: c.tracks.filter((t) => t.stageId !== stage.id),
                                        }))
                                      }
                                      aria-label="حذف الصف"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Stage Expanded Body */}
                              {isStageExpanded && (
                                <div className="catalog-stage-body">
                                  {/* Sub-tabs inside Stage: Subjects / Tracks / Settings */}
                                  <div className="catalog-stage-subtabs">
                                    <button
                                      type="button"
                                      className={`catalog-subtab-btn ${activeSection === 'subjects' ? 'active' : ''}`}
                                      onClick={() =>
                                        setStageActiveSection((prev) => ({ ...prev, [stage.id]: 'subjects' }))
                                      }
                                    >
                                      <BookOpen size={14} />
                                      <span>المواد الدراسية ({stageCurricula.length})</span>
                                    </button>

                                    <button
                                      type="button"
                                      className={`catalog-subtab-btn ${activeSection === 'tracks' ? 'active' : ''}`}
                                      onClick={() =>
                                        setStageActiveSection((prev) => ({ ...prev, [stage.id]: 'tracks' }))
                                      }
                                    >
                                      <Route size={14} />
                                      <span>المسارات والشعب ({tracks.length})</span>
                                    </button>

                                    <button
                                      type="button"
                                      className={`catalog-subtab-btn ${activeSection === 'settings' ? 'active' : ''}`}
                                      onClick={() =>
                                        setStageActiveSection((prev) => ({ ...prev, [stage.id]: 'settings' }))
                                      }
                                    >
                                      <GraduationCap size={14} />
                                      <span>إعدادات الصف</span>
                                    </button>
                                  </div>

                                  {/* SUBTAB 1: SUBJECTS OF THIS GRADE LEVEL */}
                                  {activeSection === 'subjects' && (
                                    <div className="catalog-subtab-content">
                                      <div className="catalog-section-bar">
                                        <div>
                                          <h4 className="catalog-section-title">
                                            المواد الدراسية المخصصة لـ "{stage.name}"
                                          </h4>
                                          <p className="catalog-section-sub">
                                            يمكنك تعديل حالة أي مادة مباشرة (أساسية / اختيارية، مكتملة / قيد الإعداد، أو تغيير مسارها)، أو إضافة مادة جديدة، أو مشاركتها عبر صفوف أخرى.
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          className="btn-primary btn-sm"
                                          onClick={() => {
                                            setStageAddSubjectOpen(isAddingSubjectHere ? null : stage.id);
                                            setNewSubjName('');
                                            setNewSubjTrackId('');
                                            setNewSubjIsElective(false);
                                            setNewSubjFile(null);
                                            setNewSubjShareStages([]);
                                            setExistingSubjId('');
                                          }}
                                        >
                                          {isAddingSubjectHere ? (
                                            <>
                                              <X size={14} /> إغلاق نافذة الإضافة
                                            </>
                                          ) : (
                                            <>
                                              <Plus size={14} /> إضافة مادة لهذا الصف
                                            </>
                                          )}
                                        </button>
                                      </div>

                                      {/* Add Subject Drawer for This Stage */}
                                      {isAddingSubjectHere && (
                                        <div className="catalog-add-subject-drawer">
                                          <div className="catalog-add-subject-modes">
                                            <button
                                              type="button"
                                              className={`catalog-mode-tab ${addSubjectTab === 'new' ? 'active' : ''}`}
                                              onClick={() => setAddSubjectTab('new')}
                                            >
                                              <Plus size={14} /> إضافة مادة جديدة بالكامل
                                            </button>
                                            <button
                                              type="button"
                                              className={`catalog-mode-tab ${addSubjectTab === 'existing' ? 'active' : ''}`}
                                              onClick={() => setAddSubjectTab('existing')}
                                            >
                                              <Share2 size={14} /> مشاركة مادة موجودة من صف آخر
                                            </button>
                                          </div>

                                          {/* Mode A: Create New Subject */}
                                          {addSubjectTab === 'new' && (
                                            <div className="catalog-add-form">
                                              <div className="catalog-row">
                                                <div style={{ flex: '2 1 200px' }}>
                                                  <label className="catalog-field-label">اسم المادة الجديدة:</label>
                                                  <input
                                                    className="form-input"
                                                    placeholder="مثال: الأحياء، الفيزياء، الرياضيات..."
                                                    value={newSubjName}
                                                    onChange={(e) => setNewSubjName(e.target.value)}
                                                    maxLength={80}
                                                    autoFocus
                                                  />
                                                </div>

                                                {tracks.length > 0 && (
                                                  <div style={{ flex: '1 1 180px' }}>
                                                    <label className="catalog-field-label">المسار الدراسي:</label>
                                                    <select
                                                      className="form-input"
                                                      value={newSubjTrackId}
                                                      onChange={(e) => setNewSubjTrackId(e.target.value)}
                                                    >
                                                      <option value="">مشتركة لجميع مسارات الصف</option>
                                                      {tracks.map((t) => (
                                                        <option key={t.id} value={t.id}>
                                                          {t.name}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                )}
                                              </div>

                                              <div className="catalog-row" style={{ alignItems: 'center' }}>
                                                {stage.electivesEnabled && (
                                                  <label className="catalog-toggle">
                                                    <input
                                                      type="checkbox"
                                                      checked={newSubjIsElective}
                                                      onChange={(e) => setNewSubjIsElective(e.target.checked)}
                                                    />
                                                    <span>مادة اختيارية (يختارها الطالب ضمن مساره)</span>
                                                  </label>
                                                )}

                                                <div className="catalog-mode-radio-group">
                                                  <label className="catalog-toggle">
                                                    <input
                                                      type="radio"
                                                      name={`mode_${stage.id}`}
                                                      checked={newSubjMode === 'placeholder'}
                                                      onChange={() => setNewSubjMode('placeholder')}
                                                    />
                                                    <span>قيد الإعداد (بدون ملف حالياً)</span>
                                                  </label>
                                                  <label className="catalog-toggle">
                                                    <input
                                                      type="radio"
                                                      name={`mode_${stage.id}`}
                                                      checked={newSubjMode === 'file'}
                                                      onChange={() => setNewSubjMode('file')}
                                                    />
                                                    <span>رفع ملف المنهج (.md)</span>
                                                  </label>
                                                </div>
                                              </div>

                                              {newSubjMode === 'file' && (
                                                <div style={{ marginTop: '6px' }}>
                                                  <label className="catalog-field-label">اختر ملف المنهج Markdown:</label>
                                                  <input
                                                    type="file"
                                                    accept=".md"
                                                    className="form-input"
                                                    onChange={(e) =>
                                                      setNewSubjFile(e.target.files ? e.target.files[0] : null)
                                                    }
                                                  />
                                                </div>
                                              )}

                                              {/* Share with other stages checkbox pills */}
                                              <div style={{ marginTop: '8px' }}>
                                                <label className="catalog-field-label">
                                                  مشاركة هذه المادة أيضاً فوراً مع صفوف أخرى (اختياري):
                                                </label>
                                                <div className="catalog-chips-list">
                                                  {draft.stages
                                                    .filter((s) => s.id !== stage.id)
                                                    .map((otherSt) => {
                                                      const isChecked = newSubjShareStages.includes(otherSt.id);
                                                      return (
                                                        <button
                                                          key={otherSt.id}
                                                          type="button"
                                                          className={`path-chip ${isChecked ? 'active' : ''}`}
                                                          onClick={() =>
                                                            setNewSubjShareStages((prev) =>
                                                              prev.includes(otherSt.id)
                                                                ? prev.filter((id) => id !== otherSt.id)
                                                                : [...prev, otherSt.id]
                                                            )
                                                          }
                                                        >
                                                          {isChecked && <Check size={12} />}
                                                          <span>{otherSt.name}</span>
                                                          <small style={{ opacity: 0.7 }}>
                                                            ({sortedSystems(draft).find((s) => s.id === otherSt.systemId)?.name || ''})
                                                          </small>
                                                        </button>
                                                      );
                                                    })}
                                                </div>
                                              </div>

                                              <div className="catalog-row" style={{ marginTop: '10px' }}>
                                                <button
                                                  type="button"
                                                  className="btn-primary"
                                                  disabled={submittingSubject || !newSubjName.trim()}
                                                  onClick={() => handleCreateNewSubject(stage.id)}
                                                >
                                                  {submittingSubject ? (
                                                    <>
                                                      <Loader2 size={14} className="animate-spin" /> جاري إضافة المادة...
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Plus size={14} /> إضافة المادة لهذا الصف
                                                    </>
                                                  )}
                                                </button>
                                                <button
                                                  type="button"
                                                  className="btn-secondary"
                                                  onClick={() => setStageAddSubjectOpen(null)}
                                                >
                                                  إلغاء
                                                </button>
                                              </div>
                                            </div>
                                          )}

                                          {/* Mode B: Share existing subject from another grade */}
                                          {addSubjectTab === 'existing' && (
                                            <div className="catalog-add-form">
                                              <label className="catalog-field-label">
                                                اختر مادة مرفوعة من صف آخر لمشاركتها مع هذا الصف ("{stage.name}"):
                                              </label>

                                              {(() => {
                                                const candidates = curricula.filter(
                                                  (c) => !curriculumStageIds(draft, c).includes(stage.id)
                                                );

                                                if (candidates.length === 0) {
                                                  return (
                                                    <p className="catalog-empty-notice">
                                                      جميع المواد المرفوعة في المنصة مضافة بالفعل في هذا الصف، أو لا توجد مواد مرفوعة بعد في صفوف أخرى.
                                                    </p>
                                                  );
                                                }

                                                return (
                                                  <div className="catalog-row">
                                                    <select
                                                      className="form-input"
                                                      value={existingSubjId}
                                                      onChange={(e) => setExistingSubjId(e.target.value)}
                                                      style={{ flex: '1 1 300px' }}
                                                    >
                                                      <option value="">-- اختر المادة المراد مشاركتها --</option>
                                                      {candidates.map((c) => {
                                                        const homeStage = findStage(draft, c.grade_level);
                                                        return (
                                                          <option key={c.id} value={c.id}>
                                                            {c.subject_name} — (المالك الأصلي: {homeStage?.name || c.grade_level})
                                                            {c.is_placeholder ? ' [قيد الإعداد]' : ''}
                                                          </option>
                                                        );
                                                      })}
                                                    </select>
                                                    <button
                                                      type="button"
                                                      className="btn-primary"
                                                      disabled={!existingSubjId}
                                                      onClick={() => handleLinkExistingSubject(stage.id, existingSubjId)}
                                                    >
                                                      <Link2 size={14} /> تأكيد ربط ومشاركة المادة
                                                    </button>
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* List of subjects in this stage */}
                                      {stageCurricula.length === 0 ? (
                                        <div className="catalog-empty-notice">
                                          لا توجد أي مواد دراسية مرتبطة بهذا الصف حالياً. اضغط على زر "إضافة مادة لهذا الصف" بالأعلى لإضافة مادة جديدة أو مشاركة مادة موجودة.
                                        </div>
                                      ) : (
                                        <div className="catalog-subjects-grid">
                                          {stageCurricula.map((curr) => {
                                            const isPrimary = curr.grade_level === stage.id;
                                            const sharedWith = (draft.subjectLinks[curr.id]?.stageIds || []).filter(
                                              (id) => id !== stage.id
                                            );
                                            const isSharingOpen = sharingSubjectId === `${stage.id}_${curr.id}`;
                                            const isEditingStatus = editingStatusSubjectId === `${stage.id}_${curr.id}`;
                                            const isUpdatingThis = updatingSubjectId === curr.id;
                                            const homeStage = findStage(draft, curr.grade_level);
                                            const trackObj = findTrack(draft, curr.track_id);

                                            return (
                                              <div key={curr.id} className="catalog-subject-card">
                                                <div className="catalog-subject-card-top">
                                                  <div className="catalog-subject-name-group">
                                                    <BookOpen size={16} className="catalog-subject-icon" />
                                                    <span className="catalog-subject-title">{curr.subject_name}</span>

                                                    {/* Ownership badge */}
                                                    {isPrimary ? (
                                                      <span className="catalog-badge badge-primary-sub">
                                                        مادة أساسية لهذا الصف
                                                      </span>
                                                    ) : (
                                                      <span className="catalog-badge badge-shared-sub">
                                                        مشتركة من: {homeStage?.name || curr.grade_level}
                                                      </span>
                                                    )}

                                                    {/* Interactive Status Badges (Direct 1-Click Toggle) */}
                                                    <div className="catalog-status-badges-wrap">
                                                      {/* Standard vs Elective Badge */}
                                                      <button
                                                        type="button"
                                                        disabled={isUpdatingThis}
                                                        className={`catalog-badge clickable ${curr.is_elective ? 'badge-warning' : 'badge-standard'}`}
                                                        onClick={() => updateSubjectStatus(curr, { is_elective: !curr.is_elective })}
                                                        title={`الحالة الحالية: ${curr.is_elective ? 'مادة اختيارية' : 'مادة أساسية'}. انقر للتحويل إلى: ${curr.is_elective ? 'مادة أساسية (Standard)' : 'مادة اختيارية (Optional)'}`}
                                                      >
                                                        {isUpdatingThis ? (
                                                          <Loader2 size={11} className="animate-spin" />
                                                        ) : (
                                                          <span>{curr.is_elective ? 'مادة اختيارية' : 'مادة أساسية'}</span>
                                                        )}
                                                      </button>

                                                      {/* Completed vs Placeholder Badge */}
                                                      <button
                                                        type="button"
                                                        disabled={isUpdatingThis}
                                                        className={`catalog-badge clickable ${curr.is_placeholder ? 'badge-muted' : 'badge-complete'}`}
                                                        onClick={() => updateSubjectStatus(curr, { is_placeholder: !curr.is_placeholder })}
                                                        title={`الحالة الحالية: ${curr.is_placeholder ? 'قيد الإعداد' : 'منهج مكتمل'}. انقر لتغيير الجاهزية إلى: ${curr.is_placeholder ? 'منهج مكتمل' : 'قيد الإعداد'}`}
                                                      >
                                                        <span>{curr.is_placeholder ? 'قيد الإعداد' : 'منهج مكتمل'}</span>
                                                      </button>

                                                      {/* Track badge */}
                                                      {trackObj ? (
                                                        <span className="catalog-badge badge-track">
                                                          مسار: {trackObj.name}
                                                        </span>
                                                      ) : tracks.length > 0 ? (
                                                        <span className="catalog-badge badge-meta">
                                                          لكافة المسارات
                                                        </span>
                                                      ) : null}
                                                    </div>
                                                  </div>

                                                  <div className="catalog-subject-actions">
                                                    {/* Quick Edit Status Button */}
                                                    <button
                                                      type="button"
                                                      className={`btn-secondary btn-xs ${isEditingStatus ? 'active' : ''}`}
                                                      onClick={() => {
                                                        if (isEditingStatus) {
                                                          setEditingStatusSubjectId(null);
                                                        } else {
                                                          setEditingStatusSubjectId(`${stage.id}_${curr.id}`);
                                                          setEditTrackId(curr.track_id || '');
                                                          setEditIsElective(!!curr.is_elective);
                                                          setEditIsPlaceholder(!!curr.is_placeholder);
                                                        }
                                                      }}
                                                      title="تعديل حالة المادة (أساسية/اختيارية، مكتملة/قيد الإعداد، وتحديد المسار)"
                                                    >
                                                      <SlidersHorizontal size={13} />
                                                      <span>تعديل الحالة</span>
                                                    </button>

                                                    {/* Share button */}
                                                    <button
                                                      type="button"
                                                      className={`btn-secondary btn-xs ${isSharingOpen ? 'active' : ''}`}
                                                      onClick={() =>
                                                        setSharingSubjectId(
                                                          isSharingOpen ? null : `${stage.id}_${curr.id}`
                                                        )
                                                      }
                                                      title="مشاركة هذه المادة مع صفوف أخرى"
                                                    >
                                                      <Share2 size={13} />
                                                      <span>
                                                        مشاركة مع صفوف
                                                        {sharedWith.length > 0 && ` (${sharedWith.length})`}
                                                      </span>
                                                    </button>

                                                    {/* Delete / Unlink Button */}
                                                    <button
                                                      type="button"
                                                      className="catalog-icon-btn danger"
                                                      onClick={() => handleRemoveSubjectFromStage(stage.id, curr)}
                                                      title={
                                                        isPrimary
                                                          ? 'حذف هذه المادة نهائياً'
                                                          : 'إلغاء مشاركة المادة من هذا الصف فقط'
                                                      }
                                                      aria-label="حذف المادة من هذا الصف"
                                                    >
                                                      {isPrimary ? <Trash2 size={14} /> : <Unlink size={14} />}
                                                    </button>
                                                  </div>
                                                </div>

                                                {/* Info on shared stages if any */}
                                                {sharedWith.length > 0 && (
                                                  <div className="catalog-subject-shared-info">
                                                    <Share2 size={12} />
                                                    <span>تظهر أيضاً في: </span>
                                                    {sharedWith.map((swId) => (
                                                      <span key={swId} className="catalog-tag">
                                                        {stageName(draft, swId)}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}

                                                {/* Inline Status & Track Edit Drawer for this specific row */}
                                                {isEditingStatus && (
                                                  <div className="catalog-edit-status-panel">
                                                    <div className="catalog-edit-status-head">
                                                      <span style={{ fontWeight: 800, fontSize: '0.84rem' }}>
                                                        تعديل حالة وخيارات مادة "{curr.subject_name}" في هذا الصف:
                                                      </span>
                                                      <button
                                                        type="button"
                                                        className="catalog-icon-btn sm"
                                                        onClick={() => setEditingStatusSubjectId(null)}
                                                      >
                                                        <X size={12} />
                                                      </button>
                                                    </div>

                                                    <div className="catalog-row" style={{ alignItems: 'flex-start', gap: '14px' }}>
                                                      <div>
                                                        <label className="catalog-field-label">نوع المادة في هذا الصف:</label>
                                                        <div className="catalog-status-btn-group">
                                                          <button
                                                            type="button"
                                                            className={`catalog-status-toggle-btn ${!editIsElective ? 'active' : ''}`}
                                                            onClick={() => setEditIsElective(false)}
                                                          >
                                                            مادة أساسية (Standard)
                                                          </button>
                                                          <button
                                                            type="button"
                                                            className={`catalog-status-toggle-btn ${editIsElective ? 'active' : ''}`}
                                                            onClick={() => setEditIsElective(true)}
                                                          >
                                                            مادة اختيارية (Optional)
                                                          </button>
                                                        </div>
                                                      </div>

                                                      <div>
                                                        <label className="catalog-field-label">جاهزية وتفعيل المنهج:</label>
                                                        <div className="catalog-status-btn-group">
                                                          <button
                                                            type="button"
                                                            className={`catalog-status-toggle-btn ${!editIsPlaceholder ? 'active' : ''}`}
                                                            onClick={() => setEditIsPlaceholder(false)}
                                                          >
                                                            منهج مكتمل (مفعل)
                                                          </button>
                                                          <button
                                                            type="button"
                                                            className={`catalog-status-toggle-btn ${editIsPlaceholder ? 'active' : ''}`}
                                                            onClick={() => setEditIsPlaceholder(true)}
                                                          >
                                                            قيد الإعداد (قادم)
                                                          </button>
                                                        </div>
                                                      </div>

                                                      {tracks.length > 0 && (
                                                        <div style={{ flex: '1 1 180px' }}>
                                                          <label className="catalog-field-label">المسار المخصص:</label>
                                                          <select
                                                            className="form-input"
                                                            value={editTrackId}
                                                            onChange={(e) => setEditTrackId(e.target.value)}
                                                          >
                                                            <option value="">مشتركة لجميع المسارات</option>
                                                            {tracks.map((t) => (
                                                              <option key={t.id} value={t.id}>
                                                                {t.name}
                                                              </option>
                                                            ))}
                                                          </select>
                                                        </div>
                                                      )}
                                                    </div>

                                                    <div className="catalog-row" style={{ marginTop: '6px' }}>
                                                      <button
                                                        type="button"
                                                        className="btn-primary btn-sm"
                                                        disabled={isUpdatingThis}
                                                        onClick={() =>
                                                          updateSubjectStatus(curr, {
                                                            is_elective: editIsElective,
                                                            is_placeholder: editIsPlaceholder,
                                                            track_id: editTrackId || null,
                                                          })
                                                        }
                                                      >
                                                        {isUpdatingThis ? (
                                                          <>
                                                            <Loader2 size={13} className="animate-spin" /> جاري الحفظ...
                                                          </>
                                                        ) : (
                                                          <>
                                                            <Check size={13} /> تطبيق وحفظ التعديلات
                                                          </>
                                                        )}
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="btn-secondary btn-sm"
                                                        onClick={() => setEditingStatusSubjectId(null)}
                                                      >
                                                        إلغاء
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Sharing Management Drawer */}
                                                {isSharingOpen && (
                                                  <div className="catalog-subject-sharing-panel">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                      <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                                                        حدد الصفوف الدراسية التي تريد أن تظهر فيها مادة "{curr.subject_name}":
                                                      </span>
                                                      <button
                                                        type="button"
                                                        className="catalog-icon-btn sm"
                                                        onClick={() => setSharingSubjectId(null)}
                                                      >
                                                        <X size={12} />
                                                      </button>
                                                    </div>

                                                    <div className="catalog-chips-list" style={{ marginTop: '8px' }}>
                                                      {draft.stages
                                                        .filter((s) => s.id !== curr.grade_level)
                                                        .map((st) => {
                                                          const isLinked = (
                                                            draft.subjectLinks[curr.id]?.stageIds || []
                                                          ).includes(st.id);
                                                          return (
                                                            <button
                                                              key={st.id}
                                                              type="button"
                                                              className={`path-chip ${isLinked ? 'active' : ''}`}
                                                              onClick={() => toggleLink(curr.id, 'stageIds', st.id)}
                                                            >
                                                              {isLinked && <Check size={12} />}
                                                              <span>{st.name}</span>
                                                              <small style={{ opacity: 0.7 }}>
                                                                ({findStage(draft, st.id)?.systemId || ''})
                                                              </small>
                                                            </button>
                                                          );
                                                        })}
                                                    </div>
                                                    <p className="catalog-field-hint">
                                                      يتم تطبيق التغييرات فوراً في المسودة. اضغط على زر "حفظ كافة التغييرات" الأزرق بأعلى الصفحة لاعتمادها على الفور.
                                                    </p>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* SUBTAB 2: TRACKS OF THIS STAGE */}
                                  {activeSection === 'tracks' && (
                                    <div className="catalog-subtab-content">
                                      <div className="catalog-section-bar">
                                        <div>
                                          <h4 className="catalog-section-title">
                                            المسارات والشعب الخاصة بـ "{stage.name}"
                                          </h4>
                                          <p className="catalog-section-sub">
                                            إذا كان هذا الصف يحتوي على شعب أو مسارات تخصص (مثل: علمي، أدبي، طب، هندسة)، يمكنك إضافتها هنا وتعديل حالة تفعيلها.
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          className="btn-primary btn-sm"
                                          onClick={() => addTrack(stage.id)}
                                        >
                                          <Plus size={14} /> إضافة مسار أو شعبة
                                        </button>
                                      </div>

                                      {tracks.length === 0 ? (
                                        <div className="catalog-empty-notice">
                                          لا توجد مسارات لهذا الصف (جميع المواد تكون عامة ومشتركة لجميع طلاب هذا الصف). يمكنك إضافة مسارات إذا كان الصف يدعم التخصص.
                                        </div>
                                      ) : (
                                        <div className="catalog-tracks-list">
                                          {tracks.map((track) => (
                                            <div
                                              key={track.id}
                                              className={`catalog-track-item ${track.active ? '' : 'inactive'}`}
                                            >
                                              <Route size={15} className="catalog-row-icon" />
                                              <input
                                                className="form-input catalog-track-name"
                                                value={track.name}
                                                maxLength={80}
                                                onChange={(e) => patchTrack(track.id, { name: e.target.value })}
                                                placeholder="اسم المسار (مثال: علمي علوم، مسار الهندسة...)"
                                              />
                                              <input
                                                className="form-input catalog-track-desc"
                                                value={track.description}
                                                maxLength={200}
                                                placeholder="وصف المسار (اختياري)"
                                                onChange={(e) =>
                                                  patchTrack(track.id, { description: e.target.value })
                                                }
                                              />
                                              <label className="catalog-toggle">
                                                <input
                                                  type="checkbox"
                                                  checked={track.active}
                                                  onChange={(e) => patchTrack(track.id, { active: e.target.checked })}
                                                />
                                                <span>مفعل</span>
                                              </label>
                                              <span className="catalog-badge badge-meta">
                                                {usage?.studentsByTrack[track.id] || 0} طالب
                                              </span>
                                              <button
                                                type="button"
                                                className="catalog-icon-btn danger"
                                                disabled={trackInUse(track.id)}
                                                title={
                                                  trackInUse(track.id)
                                                    ? 'لا يمكن حذف المسار لوجود طلاب أو مناهج مرتبطة به'
                                                    : 'حذف المسار'
                                                }
                                                onClick={() =>
                                                  update((c) => ({
                                                    ...c,
                                                    tracks: c.tracks.filter((t) => t.id !== track.id),
                                                  }))
                                                }
                                                aria-label="حذف المسار"
                                              >
                                                <Trash2 size={13} />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* SUBTAB 3: STAGE SETTINGS */}
                                  {activeSection === 'settings' && (
                                    <div className="catalog-subtab-content">
                                      <h4 className="catalog-section-title">بيانات وإعدادات وحالة الصف</h4>
                                      <div className="catalog-row" style={{ marginTop: '10px' }}>
                                        <div style={{ flex: '2 1 220px' }}>
                                          <label className="catalog-field-label">اسم الصف الدراسي:</label>
                                          <input
                                            className="form-input"
                                            value={stage.name}
                                            maxLength={80}
                                            onChange={(e) => patchStage(stage.id, { name: e.target.value })}
                                          />
                                        </div>
                                        <div style={{ flex: '1 1 160px' }}>
                                          <label className="catalog-field-label">المرحلة التعليمية:</label>
                                          <select
                                            className="form-input"
                                            value={stage.level}
                                            onChange={(e) =>
                                              patchStage(stage.id, { level: e.target.value as StageLevel })
                                            }
                                          >
                                            {LEVELS.map((l) => (
                                              <option key={l.value} value={l.value}>
                                                {l.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div style={{ flex: '1 1 180px' }}>
                                          <label className="catalog-field-label">النظام التابع له:</label>
                                          <select
                                            className="form-input"
                                            value={stage.systemId}
                                            onChange={(e) => patchStage(stage.id, { systemId: e.target.value })}
                                          >
                                            {allSystems.map((s) => (
                                              <option key={s.id} value={s.id}>
                                                {s.name}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>

                                      <div className="catalog-row" style={{ marginTop: '12px', alignItems: 'center' }}>
                                        <label className="catalog-toggle">
                                          <input
                                            type="checkbox"
                                            checked={stage.active}
                                            onChange={(e) => patchStage(stage.id, { active: e.target.checked })}
                                          />
                                          <span>مفعل للطلاب الجدد</span>
                                        </label>
                                        <label className="catalog-toggle">
                                          <input
                                            type="checkbox"
                                            checked={stage.electivesEnabled}
                                            onChange={(e) =>
                                              patchStage(stage.id, { electivesEnabled: e.target.checked })
                                            }
                                          />
                                          <span>يختار الطالب مادة اختيارية ضمن مساره</span>
                                        </label>
                                      </div>

                                      <div className="catalog-stage-tech-info">
                                        <span>معرف الصف البرمجي: <code dir="ltr">{stage.id}</code></span>
                                        <span>عدد الطلاب المسجلين: <strong>{stageUsage}</strong></span>
                                        <span>إجمالي المواد المرتبطة: <strong>{stageCurricula.length}</strong></span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Shared & Elective Subjects Panel (Collapsible Directory) */}
      <div className="glass catalog-panel">
        <div
          className="catalog-header"
          style={{ cursor: 'pointer', marginBottom: 0 }}
          onClick={() => setGlobalSharingOpen(!globalSharingOpen)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="catalog-collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                setGlobalSharingOpen(!globalSharingOpen);
              }}
              aria-label="توسيع أو طي الدليل الشامل"
            >
              {globalSharingOpen ? <ChevronDown size={18} /> : <ChevronLeft size={18} />}
            </button>
            <div>
              <h3>
                <Link2 size={18} /> الدليل الشامل للمواد المشتركة والاختيارية
              </h3>
              <p>
                نظرة عامة على جميع المناهج المرفوعة وروابط مشاركتها وتعديل حالتها مباشرة بين مختلف الصفوف والأنظمة التعليمية في مكان واحد.
              </p>
            </div>
          </div>
          <span className="catalog-badge badge-meta">
            {curricula.length} مادة
          </span>
        </div>

        {globalSharingOpen && (
          <div className="catalog-subjects" style={{ marginTop: '16px' }}>
            {curricula.map((curr) => {
              const link = draft.subjectLinks[curr.id] || { stageIds: [], trackIds: [] };
              const offered = curriculumStageIds(draft, curr);
              const homeTracks = tracksOfStage(draft, curr.grade_level);
              const extraTracks = offered
                .filter((id) => id !== curr.grade_level)
                .flatMap((id) => tracksOfStage(draft, id));
              const open = globalSubjectExpanded === curr.id;

              return (
                <div key={curr.id} className="catalog-subject">
                  <div
                    className="catalog-subject-head"
                    onClick={() => setGlobalSubjectExpanded(open ? null : curr.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="catalog-subject-name">{curr.subject_name}</span>
                      <button
                        type="button"
                        className={`catalog-badge clickable ${curr.is_elective ? 'badge-warning' : 'badge-standard'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSubjectStatus(curr, { is_elective: !curr.is_elective });
                        }}
                        title="انقر لتعديل نوع المادة (أساسية / اختيارية)"
                      >
                        {curr.is_elective ? 'مادة اختيارية' : 'مادة أساسية'}
                      </button>
                      <button
                        type="button"
                        className={`catalog-badge clickable ${curr.is_placeholder ? 'badge-muted' : 'badge-complete'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateSubjectStatus(curr, { is_placeholder: !curr.is_placeholder });
                        }}
                        title="انقر لتعديل جاهزية المنهج"
                      >
                        {curr.is_placeholder ? 'قيد الإعداد' : 'منهج مكتمل'}
                      </button>
                    </div>

                    <span className="catalog-subject-meta">
                      الصف المالك: {stageName(draft, curr.grade_level)}
                      {link.stageIds.length > 0 && ` + ${link.stageIds.length} صفوف مشتركة`}
                    </span>
                  </div>

                  {open && (
                    <div className="catalog-subject-body">
                      {homeTracks.length > 0 && (
                        <div className="catalog-row">
                          <label className="catalog-field">
                            المسار الأساسي في {stageName(draft, curr.grade_level)}:
                            <select
                              className="form-input"
                              value={curr.track_id || ''}
                              onChange={(e) => updateSubjectStatus(curr, { track_id: e.target.value || null })}
                            >
                              <option value="">مشتركة لجميع المسارات</option>
                              {homeTracks.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}

                      <p className="catalog-field-title">تظهر أيضاً في الصفوف التالية:</p>
                      <div className="catalog-chips-list">
                        {draft.stages
                          .filter((s) => s.id !== curr.grade_level)
                          .map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={`path-chip ${link.stageIds.includes(s.id) ? 'active' : ''}`}
                              onClick={() => toggleLink(curr.id, 'stageIds', s.id)}
                            >
                              {link.stageIds.includes(s.id) && <Check size={12} />}
                              <span>{s.name}</span>
                            </button>
                          ))}
                      </div>

                      {(homeTracks.length > 0 || extraTracks.length > 0) && (
                        <>
                          <p className="catalog-field-title" style={{ marginTop: '10px' }}>
                            مسارات مخصصة تظهر لها المادة:
                          </p>
                          <div className="catalog-chips-list">
                            {[...homeTracks, ...extraTracks]
                              .filter((t) => t.id !== curr.track_id)
                              .map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  className={`path-chip ${link.trackIds.includes(t.id) ? 'active' : ''}`}
                                  onClick={() => toggleLink(curr.id, 'trackIds', t.id)}
                                >
                                  {link.trackIds.includes(t.id) && <Check size={12} />}
                                  <span>{t.name}</span>
                                  <small style={{ opacity: 0.7 }}>({stageName(draft, t.stageId)})</small>
                                </button>
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {curricula.length === 0 && <p className="catalog-empty-notice">لا توجد مناهج مرفوعة بعد.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
