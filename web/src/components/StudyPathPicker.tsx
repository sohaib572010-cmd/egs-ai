'use client';

import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import {
  CatalogCurriculum,
  EducationCatalog,
  StudentPath,
  curriculaForPath,
  electiveOptions,
  findStage,
  findSystem,
  isElectiveMatch,
  sortedSystems,
  stagesOfSystem,
  tracksOfStage,
} from '@/lib/education_catalog';

interface StudyPathPickerProps {
  catalog: EducationCatalog;
  curricula: (CatalogCurriculum & { is_placeholder?: boolean })[];
  activeCurriculumIds?: string[];
  value: StudentPath;
  onChange: (path: StudentPath) => void;
  /** The student's saved path: its stage and track stay selectable even after an admin deactivates them. */
  current?: StudentPath | null;
  showSubjects?: boolean;
}

/** Subjects a path resolves to, using the same published/elective rules as the picker. */
export function pathSubjects(
  catalog: EducationCatalog,
  curricula: (CatalogCurriculum & { is_placeholder?: boolean })[],
  activeCurriculumIds: string[],
  value: StudentPath
) {
  const stage = findStage(catalog, value.stageId);
  if (!stage) return [];
  const published = curricula.filter((c) => activeCurriculumIds.length === 0 || activeCurriculumIds.includes(c.id) || c.is_placeholder);
  const tracks = tracksOfStage(catalog, stage.id, true);
  if (tracks.length > 0 && !value.trackId) return [];
  const electives = electiveOptions(catalog, published, stage.id, value.trackId);
  return curriculaForPath(catalog, published, { ...value, electiveSubject: value.electiveSubject || electives[0] || null });
}

/** True when the path names a stage and, for stages with tracks, a track. */
export function isPathComplete(catalog: EducationCatalog, path: StudentPath, current?: StudentPath | null): boolean {
  const stage = findStage(catalog, path.stageId);
  if (!stage) return false;
  const tracks = tracksOfStage(catalog, stage.id).filter((t) => t.active || t.id === current?.trackId);
  return tracks.length === 0 || tracks.some((t) => t.id === path.trackId);
}

export default function StudyPathPicker({
  catalog,
  curricula,
  activeCurriculumIds = [],
  value,
  onChange,
  current,
  showSubjects = true,
}: StudyPathPickerProps) {
  const currentStage = findStage(catalog, value.stageId);
  const currentSystemId = findStage(catalog, current?.stageId)?.systemId;
  const systems = sortedSystems(catalog).filter(
    (s) => (s.active && stagesOfSystem(catalog, s.id, true).length > 0) || s.id === currentSystemId
  );
  const systemId = currentStage?.systemId || systems[0]?.id || '';
  const stages = stagesOfSystem(catalog, systemId).filter((s) => s.active || s.id === current?.stageId);
  const tracks = currentStage
    ? tracksOfStage(catalog, currentStage.id).filter((t) => t.active || (t.id === current?.trackId && currentStage.id === current?.stageId))
    : [];
  const published = useMemo(
    () => curricula.filter((c) => activeCurriculumIds.length === 0 || activeCurriculumIds.includes(c.id) || c.is_placeholder),
    [curricula, activeCurriculumIds]
  );
  const electives = currentStage ? electiveOptions(catalog, published, currentStage.id, value.trackId) : [];
  const subjects = currentStage && (tracks.length === 0 || value.trackId)
    ? curriculaForPath(catalog, published, { ...value, electiveSubject: value.electiveSubject || electives[0] || null })
    : [];

  const selectStage = (stageId: string) => {
    const nextTracks = tracksOfStage(catalog, stageId, true);
    const keepTrack = nextTracks.some((t) => t.id === value.trackId) ? value.trackId : null;
    onChange({ stageId, trackId: keepTrack ?? (nextTracks.length === 1 ? nextTracks[0].id : null), electiveSubject: null });
  };

  const selectSystem = (id: string) => {
    if (id === systemId) return;
    const first = stagesOfSystem(catalog, id, true)[0];
    if (first) selectStage(first.id);
  };

  return (
    <div className="path-picker">
      {systems.length > 1 && (
        <section className="path-section">
          <h4 className="path-section-title">النظام التعليمي</h4>
          <div className="path-chips" role="radiogroup" aria-label="النظام التعليمي">
            {systems.map((sys) => (
              <button
                key={sys.id}
                type="button"
                role="radio"
                aria-checked={sys.id === systemId}
                className={`path-chip${sys.id === systemId ? ' active' : ''}`}
                onClick={() => selectSystem(sys.id)}
              >
                {sys.name}
              </button>
            ))}
          </div>
          {findSystem(catalog, systemId)?.description && (
            <p className="path-hint">{findSystem(catalog, systemId)?.description}</p>
          )}
        </section>
      )}

      <section className="path-section">
        <h4 className="path-section-title">الصف الدراسي</h4>
        <div className="path-grid" role="radiogroup" aria-label="الصف الدراسي">
          {stages.map((stage, idx) => {
            const selected = stage.id === value.stageId;
            const hasTracks = tracksOfStage(catalog, stage.id, true).length > 0;
            return (
              <button
                key={stage.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`path-card${selected ? ' active' : ''}`}
                onClick={() => selectStage(stage.id)}
              >
                <span className="path-card-num">{idx + 1}</span>
                <span className="path-card-body">
                  <span className="path-card-title">{stage.name}</span>
                  <span className="path-card-desc">{findSystem(catalog, stage.systemId)?.name}{hasTracks ? ' · اختيار المسار' : ''}</span>
                </span>
                {selected && <span className="path-card-check"><Check size={14} strokeWidth={3} /></span>}
              </button>
            );
          })}
          {stages.length === 0 && <p className="path-hint">لا توجد صفوف متاحة في هذا النظام حالياً.</p>}
        </div>
      </section>

      {tracks.length > 0 && (
        <section className="path-section">
          <h4 className="path-section-title">المسار / الشعبة <span className="path-required">· مطلوب</span></h4>
          <div className="path-grid" role="radiogroup" aria-label="المسار">
            {tracks.map((track) => {
              const selected = track.id === value.trackId;
              return (
                <button
                  key={track.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`path-card${selected ? ' active' : ''}`}
                  onClick={() => onChange({ ...value, trackId: track.id, electiveSubject: null })}
                >
                  <span className="path-card-body">
                    <span className="path-card-title">{track.name}</span>
                    {track.description && <span className="path-card-desc">{track.description}</span>}
                  </span>
                  {selected && <span className="path-card-check"><Check size={14} strokeWidth={3} /></span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {electives.length > 0 && (
        <section className="path-section">
          <h4 className="path-section-title">المادة الاختيارية <span className="path-section-sub">· مادة واحدة</span></h4>
          <div className="path-chips" role="radiogroup" aria-label="المادة الاختيارية">
            {electives.map((name) => {
              const selected = isElectiveMatch(name, value.electiveSubject || electives[0]);
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`path-chip violet${selected ? ' active' : ''}`}
                  onClick={() => onChange({ ...value, electiveSubject: name })}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {showSubjects && subjects.length > 0 && (
        <section className="path-section path-subjects">
          <h4 className="path-section-title">موادك الدراسية ({subjects.length})</h4>
          <div className="path-subject-list">
            {subjects.map((c) => (
              <span key={c.id} className="path-subject">
                {c.subject_name}
                {c.is_placeholder && <small>قيد الإعداد</small>}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
