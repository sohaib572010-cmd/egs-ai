export type StageLevel = 'primary' | 'preparatory' | 'secondary' | 'other';

export interface EducationSystem {
  id: string;
  name: string;
  description: string;
  order: number;
  active: boolean;
}

export interface EducationStage {
  id: string;
  systemId: string;
  name: string;
  level: StageLevel;
  order: number;
  active: boolean;
  /** Students of this stage pick one elective subject among the elective curricula of their track. */
  electivesEnabled: boolean;
}

export interface EducationTrack {
  id: string;
  stageId: string;
  name: string;
  description: string;
  order: number;
  active: boolean;
}

/** Extra placements of a curriculum beyond its own grade_level / track_id columns. */
export interface SubjectLink {
  stageIds: string[];
  trackIds: string[];
}

export interface EducationCatalog {
  version: 1;
  systems: EducationSystem[];
  stages: EducationStage[];
  tracks: EducationTrack[];
  subjectLinks: Record<string, SubjectLink>;
}

export interface CatalogCurriculum {
  id: string;
  grade_level: string;
  subject_name: string;
  track_id?: string | null;
  is_elective?: boolean;
  is_placeholder?: boolean;
}

export const UNSELECTED_STAGE = 'unselected';
export const CATALOG_SETTING_KEY = 'education_catalog';
const ID_PATTERN = /^[a-z0-9][a-z0-9_]{1,39}$/;
const LIMITS = { systems: 20, stages: 80, tracks: 120, name: 80, description: 200 };

export const DEFAULT_EDUCATION_CATALOG: EducationCatalog = {
  version: 1,
  systems: [
    { id: 'general', name: 'التعليم العام', description: 'المرحلة الإعدادية', order: 1, active: true },
    { id: 'baccalaureate', name: 'البكالوريا المصرية', description: 'المرحلة الثانوية بنظام البكالوريا', order: 2, active: true },
  ],
  stages: [
    { id: '1_middle', systemId: 'general', name: 'الصف الأول الإعدادي', level: 'preparatory', order: 1, active: true, electivesEnabled: false },
    { id: '2_middle', systemId: 'general', name: 'الصف الثاني الإعدادي', level: 'preparatory', order: 2, active: true, electivesEnabled: false },
    { id: '3_middle', systemId: 'general', name: 'الصف الثالث الإعدادي', level: 'preparatory', order: 3, active: true, electivesEnabled: false },
    { id: '1_high', systemId: 'baccalaureate', name: 'الصف الأول الثانوي', level: 'secondary', order: 1, active: true, electivesEnabled: false },
    { id: '2_high', systemId: 'baccalaureate', name: 'السنة الثانية بكالوريا', level: 'secondary', order: 2, active: true, electivesEnabled: true },
  ],
  tracks: [
    { id: 'medicine_life_sciences', stageId: '2_high', name: 'مسار الطب وعلوم الحياة', description: 'العلوم الحيوية والطبية والصيدلانية', order: 1, active: true },
    { id: 'engineering_cs', stageId: '2_high', name: 'مسار الهندسة وعلوم الحاسب', description: 'الرياضيات المتقدمة والهندسة والتكنولوجيا', order: 2, active: true },
    { id: 'business', stageId: '2_high', name: 'مسار إدارة الأعمال', description: 'الاقتصاد والمحاسبة والعلوم المالية والإدارية', order: 3, active: true },
    { id: 'arts_literature', stageId: '2_high', name: 'مسار الآداب والفنون', description: 'الفنون والعلوم الإنسانية واللغات والفلسفة', order: 4, active: true },
  ],
  subjectLinks: {},
};

const LEVELS: StageLevel[] = ['primary', 'preparatory', 'secondary', 'other'];

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function order(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(999, Math.round(n))) : fallback;
}

/**
 * Validates an untrusted catalog (admin input or stored JSON). Returns the cleaned catalog plus
 * human-readable Arabic errors; ids must be stable snake_case keys because profiles, sessions
 * and curricula reference them.
 */
export function sanitizeCatalog(input: unknown): { catalog: EducationCatalog; errors: string[] } {
  const errors: string[] = [];
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const ids = new Set<string>();
  const takeId = (value: unknown, label: string): string | null => {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!ID_PATTERN.test(id)) {
      errors.push(`المعرف "${id || '(فارغ)'}" غير صالح في ${label}. استخدم حروفاً إنجليزية صغيرة وأرقاماً وشرطة سفلية فقط.`);
      return null;
    }
    if (ids.has(id) || id === UNSELECTED_STAGE) {
      errors.push(`المعرف "${id}" مكرر أو محجوز.`);
      return null;
    }
    ids.add(id);
    return id;
  };

  const systems: EducationSystem[] = [];
  for (const [i, s] of (Array.isArray(raw.systems) ? raw.systems : []).slice(0, LIMITS.systems).entries()) {
    const id = takeId(s?.id, 'الأنظمة التعليمية');
    const name = text(s?.name, LIMITS.name);
    if (!id) continue;
    if (!name) errors.push(`النظام "${id}" بدون اسم.`);
    systems.push({ id, name: name || id, description: text(s?.description, LIMITS.description), order: order(s?.order, i + 1), active: s?.active !== false });
  }
  const systemIds = new Set(systems.map((s) => s.id));

  const stages: EducationStage[] = [];
  for (const [i, s] of (Array.isArray(raw.stages) ? raw.stages : []).slice(0, LIMITS.stages).entries()) {
    const id = takeId(s?.id, 'المراحل الدراسية');
    if (!id) continue;
    if (!systemIds.has(s?.systemId)) {
      errors.push(`المرحلة "${id}" مرتبطة بنظام غير موجود.`);
      continue;
    }
    const name = text(s?.name, LIMITS.name);
    if (!name) errors.push(`المرحلة "${id}" بدون اسم.`);
    stages.push({
      id,
      systemId: s.systemId,
      name: name || id,
      level: LEVELS.includes(s?.level) ? s.level : 'other',
      order: order(s?.order, i + 1),
      active: s?.active !== false,
      electivesEnabled: !!s?.electivesEnabled,
    });
  }
  const stageIds = new Set(stages.map((s) => s.id));

  const tracks: EducationTrack[] = [];
  for (const [i, t] of (Array.isArray(raw.tracks) ? raw.tracks : []).slice(0, LIMITS.tracks).entries()) {
    const id = takeId(t?.id, 'المسارات والشعب');
    if (!id) continue;
    if (!stageIds.has(t?.stageId)) {
      errors.push(`المسار "${id}" مرتبط بمرحلة غير موجودة.`);
      continue;
    }
    const name = text(t?.name, LIMITS.name);
    if (!name) errors.push(`المسار "${id}" بدون اسم.`);
    tracks.push({ id, stageId: t.stageId, name: name || id, description: text(t?.description, LIMITS.description), order: order(t?.order, i + 1), active: t?.active !== false });
  }
  const trackIds = new Set(tracks.map((t) => t.id));

  const subjectLinks: Record<string, SubjectLink> = {};
  const rawLinks = raw.subjectLinks && typeof raw.subjectLinks === 'object' ? (raw.subjectLinks as Record<string, { stageIds?: unknown; trackIds?: unknown } | null>) : {};
  for (const [curriculumId, link] of Object.entries(rawLinks).slice(0, 500)) {
    if (!/^[\w-]{1,64}$/.test(curriculumId)) continue;
    const linkStages = Array.isArray(link?.stageIds) ? [...new Set(link.stageIds.filter((x: unknown) => typeof x === 'string' && stageIds.has(x)))] as string[] : [];
    const linkTracks = Array.isArray(link?.trackIds) ? [...new Set(link.trackIds.filter((x: unknown) => typeof x === 'string' && trackIds.has(x)))] as string[] : [];
    if (linkStages.length || linkTracks.length) subjectLinks[curriculumId] = { stageIds: linkStages, trackIds: linkTracks };
  }

  if (!stages.some((s) => s.active)) errors.push('يجب أن تبقى مرحلة دراسية واحدة مفعلة على الأقل.');
  return { catalog: { version: 1, systems, stages, tracks, subjectLinks }, errors };
}

/**
 * Stored catalog, or the default catalog seeded from the legacy active_grade_levels / active_tracks
 * settings so existing installs keep exactly the stages and tracks they had.
 */
export function loadCatalog(stored: string | null | undefined, legacyActiveGrades?: string[] | null, legacyActiveTracks?: string[] | null): EducationCatalog {
  if (stored) {
    try {
      const { catalog } = sanitizeCatalog(JSON.parse(stored));
      if (catalog.stages.length > 0) return catalog;
    } catch {}
  }
  const catalog: EducationCatalog = JSON.parse(JSON.stringify(DEFAULT_EDUCATION_CATALOG));
  if (Array.isArray(legacyActiveGrades) && legacyActiveGrades.length > 0) {
    for (const s of catalog.stages) s.active = legacyActiveGrades.includes(s.id);
  }
  if (Array.isArray(legacyActiveTracks)) {
    for (const t of catalog.tracks) t.active = legacyActiveTracks.includes(t.id);
  }
  return catalog;
}

const byOrder = <T extends { order: number; name: string }>(a: T, b: T) => a.order - b.order || a.name.localeCompare(b.name, 'ar');

export function sortedSystems(catalog: EducationCatalog, activeOnly = false): EducationSystem[] {
  return catalog.systems.filter((s) => !activeOnly || s.active).sort(byOrder);
}

export function stagesOfSystem(catalog: EducationCatalog, systemId: string, activeOnly = false): EducationStage[] {
  return catalog.stages.filter((s) => s.systemId === systemId && (!activeOnly || s.active)).sort(byOrder);
}

/** Active stages whose system is active too, in system then stage order. */
export function selectableStages(catalog: EducationCatalog): EducationStage[] {
  return sortedSystems(catalog, true).flatMap((sys) => stagesOfSystem(catalog, sys.id, true));
}

export function tracksOfStage(catalog: EducationCatalog, stageId: string, activeOnly = false): EducationTrack[] {
  return catalog.tracks.filter((t) => t.stageId === stageId && (!activeOnly || t.active)).sort(byOrder);
}

export function findStage(catalog: EducationCatalog, stageId?: string | null): EducationStage | undefined {
  return stageId ? catalog.stages.find((s) => s.id === stageId) : undefined;
}

export function findTrack(catalog: EducationCatalog, trackId?: string | null): EducationTrack | undefined {
  return trackId ? catalog.tracks.find((t) => t.id === trackId) : undefined;
}

export function findSystem(catalog: EducationCatalog, systemId?: string | null): EducationSystem | undefined {
  return systemId ? catalog.systems.find((s) => s.id === systemId) : undefined;
}

export function stageName(catalog: EducationCatalog, stageId?: string | null): string {
  if (!stageId || stageId === UNSELECTED_STAGE) return 'لم يتم تحديد المرحلة';
  return findStage(catalog, stageId)?.name || stageId;
}

export function trackName(catalog: EducationCatalog, trackId?: string | null): string {
  return findTrack(catalog, trackId)?.name || '';
}

/** Full label for UI and AI prompts, e.g. "السنة الثانية بكالوريا - مسار الطب وعلوم الحياة". */
export function stageLabel(catalog: EducationCatalog, stageId?: string | null, trackId?: string | null): string {
  const track = trackName(catalog, trackId);
  return track ? `${stageName(catalog, stageId)} - ${track}` : stageName(catalog, stageId);
}

export function stageLevel(catalog: EducationCatalog, stageId?: string | null): StageLevel {
  const stage = findStage(catalog, stageId);
  if (stage) return stage.level;
  if (stageId?.endsWith('_middle')) return 'preparatory';
  if (stageId?.endsWith('_high') || stageId?.includes('secondary')) return 'secondary';
  return 'other';
}

/** Stage ids where a curriculum is offered: its own grade plus any stages it is shared with. */
export function curriculumStageIds(catalog: EducationCatalog, curr: CatalogCurriculum): string[] {
  return [...new Set([curr.grade_level, ...(catalog.subjectLinks[curr.id]?.stageIds || [])])];
}

/** Tracks a curriculum is restricted to; empty means it is shared by every track of its stages. */
export function curriculumTrackIds(catalog: EducationCatalog, curr: CatalogCurriculum): string[] {
  return [...new Set([curr.track_id, ...(catalog.subjectLinks[curr.id]?.trackIds || [])].filter((t): t is string => !!t))];
}

function restrictionForStage(catalog: EducationCatalog, curr: CatalogCurriculum, stageId: string): string[] {
  const stageTracks = new Set(tracksOfStage(catalog, stageId).map((t) => t.id));
  return curriculumTrackIds(catalog, curr).filter((t) => stageTracks.has(t));
}

export interface StudentPath {
  stageId: string;
  trackId?: string | null;
  electiveSubject?: string | null;
}

/** Elective subject names a student of this stage/track can choose from. */
export function electiveOptions(catalog: EducationCatalog, curricula: CatalogCurriculum[], stageId: string, trackId?: string | null): string[] {
  if (!findStage(catalog, stageId)?.electivesEnabled) return [];
  const names = curricula
    .filter((c) => c.is_elective && curriculumStageIds(catalog, c).includes(stageId))
    .filter((c) => {
      const restriction = restrictionForStage(catalog, c, stageId);
      return restriction.length === 0 || (!!trackId && restriction.includes(trackId));
    })
    .map((c) => c.subject_name.trim());
  return [...new Set(names)];
}

/**
 * Strips volume/part/semester suffixes (e.g. "- جزئ اول", "- جزء 1", "(الفصل الأول)")
 * from a subject name to return its core discipline name.
 */
export function getBaseSubjectName(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s*[-–—:]\s*(?:جز[ءئ]|الجزء|فصل|الفصل|ترم|الترم|كتاب|الكتاب)(?:[\s\-_].*|$)/i, '')
    .replace(/\s*\((?:جز[ءئ]|الجزء|فصل|الفصل|ترم|الترم)[^)]*\)/i, '')
    .replace(/\s+(?:جز[ءئ]|الجزء|ترم|الترم)\s+(?:اول|أول|ثاني|ثان|ثالث|رابع|خامس|\d+).*$/i, '')
    .trim();
}

/**
 * Normalizes subject names for matching: strips Arabic definite article ('ال'),
 * diacritics, tatweel, and unifies alef, taa marbuta, and yaa variants.
 */
export function normalizeSubjectMatch(name?: string | null): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/^(ال|al-)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalized base discipline name (strips part/semester suffixes and normalizes Arabic characters).
 */
export function normalizeSubjectBase(name?: string | null): string {
  return normalizeSubjectMatch(getBaseSubjectName(name));
}

/**
 * Whether a curriculum's subject matches an elective choice made by a student.
 * Handles variations like "فيزياء" vs "فيزياء - جزئ اول", "الفيزياء", multi-part curricula, etc.
 */
export function isElectiveMatch(curriculumSubject?: string | null, studentChoice?: string | null): boolean {
  if (!curriculumSubject || !studentChoice) return false;
  const currTrim = curriculumSubject.trim();
  const choiceTrim = studentChoice.trim();
  if (currTrim === choiceTrim) return true;

  const normCurr = normalizeSubjectMatch(currTrim);
  const normChoice = normalizeSubjectMatch(choiceTrim);
  if (normCurr && normChoice && normCurr === normChoice) return true;

  const baseCurr = normalizeSubjectBase(currTrim);
  const baseChoice = normalizeSubjectBase(choiceTrim);
  if (baseCurr && baseChoice && baseCurr === baseChoice) return true;

  return false;
}

/**
 * Fuzzy subject matching across base disciplines and common prefixes/contains.
 */
export function isSubjectFuzzyMatch(subjectA?: string | null, subjectB?: string | null): boolean {
  if (!subjectA || !subjectB) return false;
  if (isElectiveMatch(subjectA, subjectB)) return true;
  const baseA = normalizeSubjectBase(subjectA);
  const baseB = normalizeSubjectBase(subjectB);
  if (baseA && baseB && (baseA.includes(baseB) || baseB.includes(baseA))) {
    const minLen = Math.min(baseA.length, baseB.length);
    if (minLen >= 4) return true;
  }
  return false;
}

/**
 * Whether a curriculum belongs to a student's study path: offered in the stage, open to the
 * student's track, and (for electives) the elective the student chose.
 */
export function isCurriculumInPath(catalog: EducationCatalog, curr: CatalogCurriculum, path: StudentPath): boolean {
  if (!curriculumStageIds(catalog, curr).includes(path.stageId)) return false;
  const restriction = restrictionForStage(catalog, curr, path.stageId);
  if (restriction.length > 0 && (!path.trackId || !restriction.includes(path.trackId))) return false;
  const electivesOn = !!findStage(catalog, path.stageId)?.electivesEnabled;
  if (electivesOn && curr.is_elective && path.electiveSubject) {
    return isElectiveMatch(curr.subject_name, path.electiveSubject);
  }
  return true;
}

export function curriculaForPath<T extends CatalogCurriculum>(catalog: EducationCatalog, curricula: T[], path: StudentPath): T[] {
  return curricula.filter((c) => isCurriculumInPath(catalog, c, path));
}

/**
 * The curriculum a student of `stageId` means by `subjectName`: the stage's own curriculum first,
 * then one shared into the stage from another stage or system, with normalized subject matching
 * and stage alias resolution.
 */
export function resolveCurriculum<T extends CatalogCurriculum>(catalog: EducationCatalog, curricula: T[], stageId: string, subjectName: string): T | undefined {
  const subject = (subjectName || '').trim();
  if (!subject) return undefined;
  const normSubject = normalizeSubjectMatch(subject);
  const baseSubject = normalizeSubjectBase(subject);

  // 1. Exact match on own stage
  const exactOwn = curricula.find((c) => c.grade_level === stageId && c.subject_name.trim() === subject);
  if (exactOwn) return exactOwn;

  // 2. Exact match on shared stages
  const exactShared = curricula.find((c) => c.subject_name.trim() === subject && curriculumStageIds(catalog, c).includes(stageId));
  if (exactShared) return exactShared;

  // 3. Normalized match on own stage (strips 'ال' and unifies alef/taa marbuta variants)
  const normOwn = curricula.find((c) => c.grade_level === stageId && normalizeSubjectMatch(c.subject_name) === normSubject);
  if (normOwn) return normOwn;

  // 4. Normalized match on shared stages
  const normShared = curricula.find((c) => normalizeSubjectMatch(c.subject_name) === normSubject && curriculumStageIds(catalog, c).includes(stageId));
  if (normShared) return normShared;

  // 4.5 Base discipline / fuzzy match on own stage (e.g. "فيزياء" -> "فيزياء - جزئ اول", "التاريخ المصري" -> "التاريخ  - جزئ اول")
  if (baseSubject) {
    const baseOwn = curricula.find((c) => c.grade_level === stageId && isSubjectFuzzyMatch(c.subject_name, subject));
    if (baseOwn) return baseOwn;

    const baseShared = curricula.find((c) => curriculumStageIds(catalog, c).includes(stageId) && isSubjectFuzzyMatch(c.subject_name, subject));
    if (baseShared) return baseShared;
  }

  // 5. Stage alias matching (by stage name equality, e.g. "الصف الثاني الثانوي")
  const stage = catalog.stages?.find((s) => s.id === stageId);
  if (stage) {
    const sisterStages = (catalog.stages || []).filter((s) => s.name.trim() === stage.name.trim() && s.id !== stageId);
    for (const sister of sisterStages) {
      const found = curricula.find((c) =>
        (c.grade_level === sister.id || curriculumStageIds(catalog, c).includes(sister.id)) &&
        (c.subject_name.trim() === subject ||
          normalizeSubjectMatch(c.subject_name) === normSubject ||
          (baseSubject && isSubjectFuzzyMatch(c.subject_name, subject)))
      );
      if (found) return found;
    }
  }

  // 6. Global fallback
  return (
    curricula.find((c) => c.subject_name.trim() === subject) ||
    curricula.find((c) => normalizeSubjectMatch(c.subject_name) === normSubject) ||
    (baseSubject ? curricula.find((c) => isSubjectFuzzyMatch(c.subject_name, subject)) : undefined)
  );
}

export type PathValidation = { ok: true; trackId: string | null; electiveSubject: string | null } | { ok: false; error: string };

/**
 * Server-side validation of a student's chosen path. Inactive stages/tracks are accepted only when
 * they are the student's current ones, so deactivating a stage never locks existing students out.
 */
export function validateStudentPath(
  catalog: EducationCatalog,
  curricula: CatalogCurriculum[],
  input: { stageId: unknown; trackId?: unknown; electiveSubject?: unknown },
  current?: { stageId?: string | null; trackId?: string | null }
): PathValidation {
  const stageId = typeof input.stageId === 'string' ? input.stageId.trim() : '';
  const stage = findStage(catalog, stageId);
  const keepsCurrent = current?.stageId === stageId;
  const system = stage ? findSystem(catalog, stage.systemId) : undefined;
  if (!stage || (!keepsCurrent && (!stage.active || !system?.active))) {
    return { ok: false, error: 'المرحلة الدراسية المختارة غير متاحة حالياً.' };
  }

  const stageTracks = tracksOfStage(catalog, stageId);
  const selectable = stageTracks.filter((t) => t.active || (keepsCurrent && t.id === current?.trackId));
  const trackId = typeof input.trackId === 'string' && input.trackId.trim() ? input.trackId.trim() : null;
  if (stageTracks.length > 0) {
    if (selectable.length > 0 && !trackId) return { ok: false, error: 'اختر المسار أو الشعبة الخاصة بك.' };
    if (trackId && !selectable.some((t) => t.id === trackId)) return { ok: false, error: 'المسار المختار غير متاح لهذه المرحلة.' };
  } else if (trackId) {
    return { ok: false, error: 'هذه المرحلة لا تحتوي على مسارات.' };
  }

  const electives = electiveOptions(catalog, curricula, stageId, trackId);
  const elective = typeof input.electiveSubject === 'string' && input.electiveSubject.trim() ? input.electiveSubject.trim().slice(0, 120) : null;
  const matchedElective = elective ? electives.find((opt) => isElectiveMatch(opt, elective)) : undefined;
  if (elective && !matchedElective) return { ok: false, error: 'المادة الاختيارية غير متاحة لهذا المسار.' };
  return { ok: true, trackId: stageTracks.length > 0 ? trackId : null, electiveSubject: electives.length > 0 ? matchedElective || elective || electives[0] : null };
}

/** Legacy settings derived from the catalog, kept in sync for older clients. */
export function legacyActiveLists(catalog: EducationCatalog): { activeGradeLevels: string[]; activeTracks: string[] } {
  const activeSystems = new Set(catalog.systems.filter((s) => s.active).map((s) => s.id));
  const activeGradeLevels = catalog.stages.filter((s) => s.active && activeSystems.has(s.systemId)).map((s) => s.id);
  const activeStageSet = new Set(activeGradeLevels);
  const activeTracks = catalog.tracks.filter((t) => t.active && activeStageSet.has(t.stageId)).map((t) => t.id);
  return { activeGradeLevels, activeTracks };
}

/**
 * Initial path sent with a sign-up: kept only when it names an existing stage/track, otherwise the
 * student picks it in onboarding. Never trusts the client-supplied ids.
 */
export function sanitizeInitialPath(
  catalog: EducationCatalog,
  gradeLevel: unknown,
  trackId: unknown,
  electiveSubject: unknown
): { gradeLevel: string; trackId: string | null; electiveSubject: string | null } {
  const stage = typeof gradeLevel === 'string' ? findStage(catalog, gradeLevel.trim()) : undefined;
  if (!stage || !stage.active) return { gradeLevel: UNSELECTED_STAGE, trackId: null, electiveSubject: null };
  const track = typeof trackId === 'string' ? tracksOfStage(catalog, stage.id, true).find((t) => t.id === trackId.trim()) : undefined;
  const elective = stage.electivesEnabled && typeof electiveSubject === 'string' ? electiveSubject.trim().slice(0, 120) || null : null;
  return { gradeLevel: stage.id, trackId: track?.id || null, electiveSubject: elective };
}
