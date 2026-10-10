'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2, Minus, Plus, X } from 'lucide-react';

interface CreatorSheetProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function CreatorSheet({ icon, title, subtitle, onClose, footer, children }: CreatorSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="creator-overlay" onClick={onClose}>
      <div className="creator-sheet" role="dialog" aria-modal="true" aria-labelledby="creator-title" onClick={e => e.stopPropagation()}>
        <span className="creator-handle" aria-hidden="true" />
        <header className="creator-head">
          <span className="creator-head-icon">{icon}</span>
          <div className="creator-head-text">
            <h2 id="creator-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="creator-close" onClick={onClose} aria-label="إغلاق">
            <X size={18} />
          </button>
        </header>
        <div className="creator-body custom-scrollbar">{children}</div>
        {footer && <footer className="creator-foot">{footer}</footer>}
      </div>
    </div>
  );
}

interface CreatorStepProps {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}

export function CreatorStep({ index, title, hint, done, aside, children }: CreatorStepProps) {
  return (
    <section className="creator-step">
      <div className="creator-step-head">
        <span className={`creator-step-num ${done ? 'done' : ''}`}>{done ? <Check size={14} strokeWidth={3} /> : index}</span>
        <div className="creator-step-title">
          <h3>{title}</h3>
          {hint && <span>{hint}</span>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface CountStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function CountStepper({ label, value, min, max, onChange }: CountStepperProps) {
  return (
    <div className="count-stepper">
      <span className="count-stepper-label">{label}</span>
      <div className="count-stepper-controls">
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`زيادة ${label}`}>
          <Plus size={16} />
        </button>
        <span className="count-stepper-value num" aria-live="polite">{value}</span>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`تقليل ${label}`}>
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}

interface GenerationProgressProps {
  title: string;
  stages: string[];
  details: string[];
  stageMs?: number;
}

export function GenerationProgress({ title, stages, details, stageMs = 4500 }: GenerationProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(timer);
  }, []);

  const current = Math.min(stages.length - 1, Math.floor(elapsed / stageMs));
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="gen-progress" role="status" aria-live="polite">
      <div className="gen-progress-orb" aria-hidden="true">
        <span />
        <Loader2 size={30} className="animate-spin" />
      </div>
      <div className="gen-progress-text">
        <h3>{title}</h3>
        <div className="gen-progress-details">
          {details.filter(Boolean).map(d => <span key={d}>{d}</span>)}
        </div>
      </div>
      <ol className="gen-progress-stages">
        {stages.map((stage, i) => (
          <li key={stage} className={i < current ? 'done' : i === current ? 'active' : ''}>
            <span className="gen-stage-dot">
              {i < current ? <Check size={13} strokeWidth={3} /> : i === current ? <Loader2 size={13} className="animate-spin" /> : null}
            </span>
            <span>{stage}</span>
          </li>
        ))}
      </ol>
      <p className="gen-progress-note">
        <span className="num">{seconds}</span> ثانية · غالباً أقل من دقيقة، وتقدر تقفل النافذة وهيكمّل في الخلفية
      </p>
    </div>
  );
}
