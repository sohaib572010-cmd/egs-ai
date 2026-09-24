# EGS AI — Product Requirements Document (PRD)

> **Last updated:** 2026-09-24
> **MANDATORY MAINTENANCE RULE:** upon completing ANY task that adds, modifies, or removes anything in this project (feature, API route, schema, screen, protocol tag, env var, setting, dependency, known issue), update the corresponding section(s) of this file and the "Last updated" date **in the same session**, so this document always matches the codebase. See CODING_GUIDELINES.md rule 8. A task is not complete until this file reflects it.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Repository Structure](#2-repository-structure)
3. [Technology Stack](#3-technology-stack)
4. [Core Domain Concepts](#4-core-domain-concepts)
5. [System Architecture](#5-system-architecture)
6. [Database Schema (Supabase / PostgreSQL)](#6-database-schema)
7. [Backend API Reference](#7-backend-api-reference)
8. [AI Pipeline (RAG, Providers, Prompts, Streaming)](#8-ai-pipeline)
9. [Coin (Points) Economy](#9-coin-points-economy)
10. [Authentication and Sessions](#10-authentication-and-sessions)
11. [Message Protocol Tags](#11-message-protocol-tags)
12. [Web Frontend (Next.js)](#12-web-frontend)
13. [Theming and Design System](#13-theming-and-design-system)
14. [Responsive Design Requirements](#14-responsive-design-requirements)
15. [Admin Panel](#15-admin-panel)
16. [Deployment and Environments](#16-deployment-and-environments)
17. [Environment Variables](#17-environment-variables)
18. [Seed / Default Data](#18-seed--default-data)
19. [Security and Threat Model](#19-security-and-threat-model)
20. [Known Issues and Tech Debt](#20-known-issues-and-tech-debt)
21. [Security Vulnerability Register](#21-security-vulnerability-register)
22. [Feature Dependency and Modification Map](#22-feature-dependency-and-modification-map)

---

## 1. Product Overview

**Name:** EGS AI (repo name "EGA-AI"). Official Release Version (Production Launch).

**What it is:** An Arabic-language AI tutor ("smart assistant / teacher") for students of the **Egyptian national curriculum** — middle school (اعدادي) and high school (ثانوي). Students chat with an AI that answers strictly from their grade's uploaded curriculum, take AI-generated exams, get AI grading with feedback, and upload images of problems for analysis.

**Subscriptions & Pricing:**
- **Monthly Pro Subscription (اشتراك شهر - باقة برو):** 50 EGP / month. Full access to Deep Thinking (Reasoning Mode), daily coin renewals, and unlimited exam generation.
- **Two-Month Subscription (اشتراك شهرين):** 100 EGP / 2 months.
- **Three-Month Subscription (اشتراك 3 أشهر):** 250 EGP / 3 months.
- **Cancellation & Refund Policy:** Requests allowed within 3 days (72 hours) of purchase strictly provided that the user has consumed 0 points from the subscription package.
- **Payment Processing:** **Kashier (كاشير)** payment gateway on Web (Visa, Mastercard, Meeza, Vodafone Cash, Orange Cash, Etisalat Cash, WE Pay, Instapay; SSL 256-bit PCI-DSS encrypted).
- **Support Contact Channels:** Phone / WhatsApp: `01037220587`, Email: `business@egsaiedu.com`, dedicated Web page `/contact`.

**Platforms:**
- **Web:** Next.js single-page app at `web/` + Progressive Web App (PWA) with offline Service Worker support and desktop/mobile installation — Arabic, RTL, dark/light themes. Production domain: `https://egsaiedu.com`.
- **Curriculum Generator:** Standalone Next.js application at `Curriculum Generator/` running on localhost (port 3005) for concurrent multi-curriculum PDF multimodal extraction & RAG Markdown optimization powered by DeepSeek 4.1 (`deepseek-flash`).

**Target users:**
- **Students** (role `student`): 5 grade levels — Preparatory Stage: `1_middle`, `2_middle`, `3_middle` (الصف الأول/الثاني/الثالث الإعدادي); Secondary Stage: `1_high` (الصف الأول الثانوي), `2_high` (السنة الثانية بكالوريا مع 4 مسارات تخصصية: مسار الطب وعلوم الحياة، مسار الهندسة وعلوم الحاسب، مسار إدارة الأعمال، مسار الآداب والفنون). Default grade everywhere: `1_high`.
- **Admin** (role `admin`): manages curricula, placeholder subjects, tracks, users, notifications, reports via the web admin dashboard.
- **Guests / Visitors:** Unregistered visitors can browse curriculums and view introductory materials, but all pedagogical AI chat, image analysis, and exam generation strictly require registration to prevent misuse of expensive model quotas. Free trial points (15 coins) are granted only upon verified registration.

**Business model (planned):** point ("coins") economy metered per token consumption. Plans `free` / `pro` / `max` exist in data + UI badges, but **payments are disabled during beta** (UI promises payments "before August 2026"). Deep Thinking (Reasoning Mode) is strictly gated to active paid subscribers and administrators; free users receive high-speed direct responses without thinking mode.

**Key product rules:**
- The AI must answer from the injected curriculum context; if information is outside the curriculum, the answer must begin with a fixed Arabic warning line ("تنبيه: هذه المعلومة خارج المنهج المقرر عليك يا بطل...").
- All user-facing text is Arabic (Egyptian-friendly tone). Math in LaTeX. Diagrams as sanitized inline SVG.
- The chatbot persona is an intellectually poised, smart, sophisticated, and polite Egyptian educational mentor.

---

## 2. Repository Structure

```
c:\myapp\                      Git repo (github.com/sohip1961-dotcom/EGA-AI, branch: main)
├── PRD.md                     THIS FILE — read first
├── CODING_GUIDELINES.md       Mandatory coding rules — read second
├── CLAUDE.md / AGENTS.md      Pointers for AI agents to the two files above
├── .gitignore                 IDE/OS/log ignores only
├── Curriculum Generator/      Standalone Next.js App (Localhost:3005) for Curriculum PDF Extraction
│   ├── package.json           name "curriculum-generator", scripts: dev/build/start
│   ├── next.config.ts         experimental bodySizeLimit 50mb, serverExternalPackages pdfjs-dist
│   ├── tsconfig.json          TypeScript configuration
│   ├── .env.example           EDENAI_API_KEY, DEEPSEEK_API_KEY
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx     RTL Root Layout
│   │   │   ├── page.tsx       Arabic Multi-Curricula Dashboard UI (Concurrent Progress, Preview Modal, Live Filtered Logs)
│   │   │   ├── globals.css    Design system tokens (#FFB703 / #00B4D8 / #7209B7 on #0D1B2A / #F8F9FA)
│   │   │   └── api/           
│   │   │       ├── process/   GET/POST multi-worker queue processor manager & markdown preview
│   │   │       ├── upload/    POST multipart PDF file uploader with instant page counts
│   │   │       └── download/  GET export processed Markdown files
│   │   └── lib/
│   │       ├── types.ts       GradeLevel, FileQueueItem, PageExtractionResult, JobCheckpoint, QueueStateData
│   │       ├── pdf_parser.ts  High-speed PDFDocumentHandler & parallel image cache loader (lock-free extraction)
│   │       ├── eden_vision.ts Optional legacy Vision OCR API client with DeepSeek Flash multimodal vision and fallbacks
│   │       ├── deepseek_organizer.ts Unified Multimodal Curriculum Structuring Engine: direct single-pass extraction from page images and text via DeepSeek 4.1 (deepseek-flash) with thinking disabled for sub-1s structuring, Alibaba Qwen fallback, mandatory standalone unit & lesson title page extraction (capturing only unit/lesson number and name without omitting or skipping), and verbatim explanation preservation on continuation pages
│   │       ├── curriculum_cleaner.ts Sanitizer and deduplicator for sequential unit numbering repair, ## lesson/chapter/reader/topic header preservation, margin footer rejection, title page clutter stripping (learning outcomes, objectives, prep questions, and unit summaries), and strict title isolation
│   │       ├── checkpoint_manager.ts Persistent queue state (queue_state.json) & page-level checkpointing for zero data loss
│   │       └── queue_processor.ts Sliding-window dynamic continuous concurrency worker pool manager invoking DeepSeek 4.1 multimodal directly per page with real-time speed metrics and adaptive timeouts
│   └── output/                Stage-organized output Markdown files (output/<grade_level>/<subject>.md)
└── web/                       Next.js SPA & PWA Web Application
    ├── package.json           name "myapp-web", Next.js 16.2.9, React 19.2.4
    ├── wrangler.toml          Cloudflare: name "myapp-web", nodejs_compat
    ├── tsconfig.json          strict, paths @/* -> ./src/*
    ├── eslint.config.mjs      eslint-config-next core-web-vitals + typescript
    ├── supabase_schema.sql            Base schema v2 (destructive, full rebuild)
    ├── supabase_migration_beta.sql    Additive beta migration
    ├── supabase_migration_email_auth.sql  Email/Google auth migration
    ├── supabase_migration_security.sql    OTP expiry + password_resets table
    ├── supabase_migration_phase1.sql      chat_sessions.mode (interaction modes)
    ├── db_data.json           Local-dev JSON database (fallback when no Supabase env)
    ├── check-profiles.js      Dev utility: dumps profiles table via service key
    ├── CLAUDE.md -> @AGENTS.md    Next.js 16 breaking-changes warning
    ├── public/                logo.png (512x512), sw.js (PWA Service Worker), default SVGs
    └── src/
        ├── app/
        │   ├── layout.tsx     Root layout: metadata, ar/RTL, fonts, GSI script, JSON-LD, PWA SW registration
        │   ├── page.tsx       ENTIRE SPA (~6,880 lines): all views, components, state, PWA install prompt
        │   ├── globals.css    Full design system (1,527 lines): tokens, themes, breakpoints
        │   ├── page.module.css    DEAD CODE (unused create-next-app template)
        │   ├── terms/page.tsx     Terms of use & Return Policy (Arabic, 10 sections, #refund anchor)
        │   ├── privacy/page.tsx   Privacy policy (Arabic, 10 sections, standalone-page-scroll)
        │   ├── contact/page.tsx   Dedicated Contact Us Page (/contact) + ContactForm
        │   ├── download/          layout.tsx (SEO metadata) + page.tsx (PWA Install Guide)
        │   ├── sponsor/           layout.tsx (SEO metadata) + page.tsx (Student Sponsorship)
        │   ├── delete-account/page.tsx Dedicated Account Deletion Page
        │   ├── sitemap.ts / robots.ts / manifest.ts   SEO + PWA
        │   └── api/           Route handlers (see section 7)
        ├── components/
        │   └── ContactForm.tsx  Interactive contact & refund request form component
        └── lib/
            ├── db.ts          (~2,040 lines) All DB access + RAG search + coin logic
            ├── deepseek.ts    DeepSeek client + main system prompt builder
            ├── gemini.ts      Gemini-via-EdenAI: query intelligence, gap check, summaries
            ├── email.ts       Resend OTP email sender (register + password-reset templates)
            └── auth_helpers.ts    PBKDF2 hashing (+legacy sha256 verify), OTP gen, HMAC session tokens
```

**Critical fact:** the web client is effectively a single-file app (`page.tsx`). Any UI change happens in that file; any style change on web happens in `globals.css`.

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Web framework | Next.js (App Router) | 16.2.9 | Breaking changes vs older Next — read `web/AGENTS.md` and `node_modules/next/dist/docs/` before writing Next code |
| Web UI | React | 19.2.4 | Single `'use client'` page component |
| Language (web) | TypeScript | 5.x, strict | |
| Styling | Hand-written CSS custom properties in `globals.css` | — | No Tailwind, no CSS-in-JS |
| Icons (web) | lucide-react | 1.21.0 | Emojis were deliberately replaced by Lucide icons (commit 9b590f7) |
| Math (web) | KaTeX | 0.17.0 | Bundled, `throwOnError:false`, `trust:false` |
| Sanitization (web) | DOMPurify | 3.4.11 | Client-side only, for AI-generated SVG |
| DB / BaaS | Supabase (PostgreSQL + pgvector) | supabase-js 2.108.2 | Service-role key server-side; **no RLS** |
| Hashing | WebCrypto PBKDF2 (100k iter, salted) + js-sha256 (legacy verify / HMAC tokens) | — | Legacy sha256 hashes upgraded transparently on login |
| AI: main LLM | DeepSeek Flash (`deepseek-flash`, V4.1) | v1 API | Chat, exam generation, exam grading, query analysis |
| AI: intelligence & search | DeepSeek Flash (`deepseek-flash`, primary, direct API) with Google Gemini `gemini-2-5-flash` via EdenAI (fallback) | — | Query analysis, HyDE passage generation, context-gap check, curriculum summary, response fact-verification |
| AI: embeddings | Alibaba Cloud `text-embedding-v4` (primary, 768-dim via Matryoshka learning) with Google `text-embedding-004` via EdenAI (fallback) | 768-dim | HyDE query + child chunk embeddings |
| AI: vision | DeepSeek Flash (`deepseek-flash`, native multimodal primary) with EdenAI VQA (`google`, fallback `openai`) as fallback | — | Multimodal image description and problem parsing |
| AI: transcription | EdenAI `speech_to_text_async` (`providers=google`, fallback `openai`, `language=ar`) | — | Via `POST /api/chat/transcribe` (polling ~1s, 45s budget) |
| Email | Resend REST API | — | OTP emails, sender `no-reply@egsaiedu.com` |
| Deployment | Cloudflare Pages via `@cloudflare/next-on-pages` 1.13.16, built with Vercel CLI Build Output v3 | — | Most API routes declare `runtime='edge'` |

---

## 4. Core Domain Concepts

- **Grade levels (fixed enum):** `1_middle`, `2_middle`, `3_middle`, `1_high`, `2_high`. (Third year secondary `3_high` has been removed). Arabic names map in `page.tsx` (`GRADE_NAMES`):
  - `1_middle`: الصف الأول الإعدادي
  - `2_middle`: الصف الثاني الإعدادي
  - `3_middle`: الصف الثالث الإعدادي
  - `1_high`: الصف الأول الثانوي
  - `2_high`: السنة الثانية بكالوريا (الصف الثاني الثانوي)
- **Baccalaureate Specialization Tracks (`2_high`):**
  1. **مسار الطب وعلوم الحياة (`medicine_life_sciences`)**
  2. **مسار الهندسة وعلوم الحاسب (`engineering_cs`)**
  3. **مسار إدارة الأعمال (`business`)**
  4. **مسار الآداب والفنون (`arts_literature`)**
  - **Dynamic Subject Assignment:** المواد الاختيارية والمشتركة لكل مسار لا تعتمد على أي قيم ثابتة مشفرة مسبقاً، بل تُستخرج ديناميكياً وحصرياً من المواد والمناهج التي يضيفها المسؤول عبر لوحة التحكم (`curriculums` حيث يتم تحديد المسار `track_id` وتحديد ما إذا كانت المادة اختيارية `is_elective = true` أو مشتركة `!track_id`).
- **Placeholder Curricula (المناهج قيد الإعداد والتجهيز):** Admin can register upcoming subjects without immediately uploading Markdown content (`is_placeholder = true`). Placeholder subjects display normally to students with a "قيد الإعداد" badge and a friendly modal notice, while chat messaging, exam generation, and flashcards are temporarily disabled until the admin attaches the curriculum file.
- **Subjects:** free-form Arabic text (e.g. الأحياء, الكيمياء, الرياضيات المتخصصة). A subject exists for a grade only if an admin added/uploaded a curriculum for `(grade_level, subject_name)`.
- **Curriculum:** one Markdown document per (grade, subject), chunked hierarchically (parent sections + embedded child chunks) for RAG. Admin can publish/unpublish via `active_curriculum_ids`, gate whole grades via `active_grade_levels`, and toggle active tracks via `active_tracks` (all in `system_settings`).
- **Coins:** usage currency. Registered users receive 15.0 non-renewable trial points upon verified registration (`free_trial_grants`), plus a daily freemium lifeline (5.0 coins) replenished daily up to their plan cap (free 5.0 / pro_1m 80 / pro_2m 90 / pro_3m 120 — `DAILY_COIN_CAPS`); unauthenticated visitors have 0 coins and must register to use AI services. Deducted per token usage (see section 9). `unlimited_credit` flag or `admin` role bypasses deduction.
- **Plans:** `free` / `pro` / `max` on `profiles.plan_type` — determine the daily coin cap (section 9); otherwise cosmetic during beta (badges; Deep Thinking unlocked for subscribers).
- **Session:** a chat conversation (`chat_sessions`), tied to a subject + grade; messages in `chat_history`.
- **Unified AI Model:** Single high-performance model across the platform: `deepseek-flash` (DeepSeek-V4.1-Flash with native multimodal vision, ultra-low latency, and high mathematical accuracy). The differentiator between tiers is **Deep Thinking (Reasoning Mode)**: enabled exclusively for active subscribers and admins, disabled for free users.
- **Interaction modes:** `socratic` / `detailed` (default) / `summary` — per-session AI teaching style (`chat_sessions.mode`), selected in the chat composer and appended as a behavioral block to the system prompt.
- **Reports:** students can flag an AI answer; admin reviews (`pending`/`reviewed`/`dismissed`).
- **Notifications:** general platform broadcasts (`user_id NULL`) or targeted personal notifications (e.g. subscriber activation confirmations with `user_id UUID`), with types `info`/`success`/`warning`/`maintenance` targeted to `web`/`phone`/`both`; dismissals stored client-side.

---

## 5. System Architecture

```
┌─────────────┐        ┌──────────────────────────────┐       ┌──────────────────┐
│ Web browser │─HTTPS─▶│ Next.js app (Cloudflare/Vercel)│─────▶│ Supabase Postgres │
│ (page.tsx)  │  SSE   │ API routes + src/lib          │ svc   │ pgvector + RRF RPC│
└─────────────┘        │  key                          │       └──────────────────┘
                       │  ├── DeepSeek API (chat/exams)│
                       │  ├── EdenAI (Gemini, embed,   │
                       │  │    VQA)                    │
                       │  └── Resend (OTP email)       │
                       └──────────────────────────────┘
```

- The web client communicates **only** with its own `/api/*` routes.
- Server-side routes utilize the Supabase service-role key with secure validation and authentication.

---

## 6. Database Schema

Supabase PostgreSQL with `vector` extension. **No RLS anywhere** — all access goes through the service-role key with app-level authorization. Schema files (apply in order): `supabase_schema.sql` (destructive base), `supabase_migration_beta.sql` (additive), `supabase_migration_email_auth.sql` (email auth), `supabase_migration_security.sql` (OTP expiry + password resets), `supabase_migration_baccalaureate_tracks.sql` (Baccalaureate tracks & placeholders), `supabase_migration_curriculum_raw_content.sql` (Curriculum raw content preservation).

### 6.1 `profiles`
| Column | Type | Default / Constraint |
|---|---|---|
| id | UUID | PK |
| phone | TEXT | UNIQUE, nullable (was NOT NULL pre-email migration) |
| email | TEXT | UNIQUE (added by email migration) |
| name | TEXT | NOT NULL |
| grade_level | TEXT | NOT NULL, one of the 5 grades (`1_middle`, `2_middle`, `3_middle`, `1_high`, `2_high`) |
| track_id | TEXT | nullable (`medicine_life_sciences`, `engineering_cs`, `business`, `arts_literature`) |
| elective_subject | TEXT | nullable (student chosen elective subject) |
| plan_type | TEXT | NOT NULL default `'free'` (`free`/`pro_1m`/`pro_2m`/`pro_3m`/`pro`/`max`) |
| subscription_status | TEXT | NOT NULL default `'inactive'` (`'active'`/`'inactive'`/`'expired'`) |
| subscription_start_date | TIMESTAMPTZ | nullable (activation timestamp) |
| subscription_end_date | TIMESTAMPTZ | nullable (expiry timestamp, 30/60/90 days from activation) |
| subscription_plan_id | TEXT | nullable (`pro_1m`, `pro_2m`, `pro_3m`) |
| role | TEXT | NOT NULL default `'student'` (`student`/`admin`) |
| password_hash | TEXT | NOT NULL (sha256; empty string for Google accounts) |
| coins | NUMERIC | NOT NULL default 15.0 |
| points | NUMERIC | NOT NULL default 0 (ranking points merit score) |
| study_streak | INT | NOT NULL default 1 |
| last_active_date | DATE | NOT NULL default CURRENT_DATE |
| unlimited_credit | BOOLEAN | NOT NULL default false (admins set true) |
| pwa_installed | BOOLEAN | NOT NULL default false (added by `supabase_migration_pwa_tracking.sql`) |
| pwa_installed_at | TIMESTAMPTZ | nullable (timestamp of PWA installation) |
| pwa_platform | TEXT | nullable (`'android'`, `'ios'`, `'desktop'`, `'unknown'`) |
| improve_ai_opt_in | BOOLEAN | NOT NULL default true (added by `supabase_migration_improve_ai_privacy.sql` to let students control whether conversations are shared to improve AI response quality) |
| streak_shields | INTEGER | NOT NULL default 1 (added by `supabase_migration_streak_shields.sql` to protect student streaks when 1 day is missed) |
| apology_compensation_claimed | BOOLEAN | NOT NULL default false (added by `supabase_migration_apology_compensation.sql` for anti-double-claim compensation tracking) |
| apology_dismissed | BOOLEAN | NOT NULL default false (added by `supabase_migration_apology_compensation.sql` to ensure apology message displays strictly once) |
| terms_accepted_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | default NOW() |

### 6.2 `pending_registrations` (post email-auth migration)
`email TEXT PK`, `phone TEXT NULL`, `name TEXT NOT NULL`, `grade_level TEXT NOT NULL`, `track_id TEXT NULL`, `elective_subject TEXT NULL`, `password_hash TEXT NOT NULL`, `otp TEXT NOT NULL`, `expires_at TIMESTAMPTZ` (10-min OTP TTL; added by `supabase_migration_security.sql`), `terms_accepted_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ DEFAULT NOW()`. Rows removed on successful OTP verify or on expired-OTP attempts.

### 6.2b `password_resets` (added by `supabase_migration_security.sql`)
`user_id UUID PK FK → profiles CASCADE`, `otp TEXT NOT NULL`, `expires_at TIMESTAMPTZ NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`. One active reset per user (upsert); deleted on success or expiry.

### 6.2c `account_deletions` (added by `supabase_migration_account_deletion.sql`)
`user_id UUID PK FK → profiles CASCADE`, `email TEXT NOT NULL`, `otp TEXT NOT NULL`, `expires_at TIMESTAMPTZ NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`. Stores public email OTP deletion requests (10-min expiry); deleted on OTP verification or expiry.

### 6.3 `device_guests`
`device_id TEXT PK`, `free_message_count INTEGER NOT NULL DEFAULT 0`, `last_message_date DATE NOT NULL DEFAULT CURRENT_DATE`, `coins NUMERIC NOT NULL DEFAULT 5.0` (reset to 5.0 lazily on first request of a new day).

### 6.4 `curriculums`
`id UUID PK`, `grade_level TEXT NOT NULL`, `subject_name TEXT NOT NULL`, `file_name TEXT NOT NULL`, `content TEXT NULL` (stores pristine original uploaded Markdown text for 100% exact fidelity in admin content view and AI lesson hierarchy extraction; added by `supabase_migration_curriculum_raw_content.sql`), `units JSONB NOT NULL DEFAULT '[]'::jsonb`, `is_placeholder BOOLEAN NOT NULL DEFAULT false`, `track_id TEXT NULL`, `is_elective BOOLEAN NOT NULL DEFAULT false`, `created_at`, **UNIQUE(grade_level, subject_name)**. Holds curriculum metadata, exact raw content, units/lessons hierarchy, track associations, and placeholder state.

### 6.5 `curriculum_chunks` (RAG v2, hierarchical)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| curriculum_id | UUID | FK → curriculums, CASCADE delete |
| content | TEXT | NOT NULL |
| heading | TEXT | NOT NULL (special heading `__CURRICULUM_SUMMARY__` at position_index −1 holds the Gemini-generated summary; special heading `__RAW_MARKDOWN__` at position_index −99 stores the exact original Markdown document for 100% fidelity without requiring external schema alterations) |
| chunk_level | TEXT | `'parent'` (full section) or `'child'` (sliding-window sub-chunk) — default `'parent'` |
| parent_id | UUID | self-FK, CASCADE; set on children only |
| position_index | INTEGER | NOT NULL default 0 |
| embedding | VECTOR(768) | children only (text-embedding-004) |
| fts_arabic | TSVECTOR | trigger-maintained, `'simple'` config |
| fts_english | TSVECTOR | trigger-maintained, `'english'` config |

Indexes: HNSW on embedding (`vector_cosine_ops`, m=16, ef_construction=64); GIN on both tsvectors; btree on `parent_id` and `(curriculum_id, chunk_level)`.

Trigger: `curriculum_chunks_update_fts` (BEFORE INSERT/UPDATE) recomputes both tsvectors from `heading || ' ' || content`.

RPC function: `hybrid_search_curriculum(p_curriculum_id, p_query_embedding VECTOR(768), p_arabic_query TEXT, p_english_query TEXT, p_match_count INT DEFAULT 8, p_rrf_k INT DEFAULT 60)` — Reciprocal Rank Fusion over (vector cosine, Arabic BM25, English BM25), each top-50, child chunks only, returns top N with `rrf_score`.

### 6.6 `curriculum_entities` (GraphRAG Knowledge Graph Entities)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK `gen_random_uuid()` |
| curriculum_id | UUID | FK → curriculums, CASCADE delete |
| name | TEXT | Entity / concept name (e.g. 'قانون نيوتن الثاني') |
| normalized_name | TEXT | Normalized for morphological matching |
| category | TEXT | `'law'`, `'concept'`, `'definition'`, `'formula'`, `'rule'`, `'person'`, `'event'` |
| description | TEXT | Academic definition or statement |
| aliases | JSONB | Array of synonyms and alternative names |
| chunk_ids | JSONB | Array of associated chunk UUIDs |
| importance_score | NUMERIC | Degree centrality / syllabus weight (0.0–1.0) |
| created_at | TIMESTAMPTZ | default NOW() |

Indexes: on `curriculum_id`, `(curriculum_id, normalized_name)`, and `category`.

### 6.7 `curriculum_relations` (GraphRAG Knowledge Graph Relations)
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK `gen_random_uuid()` |
| curriculum_id | UUID | FK → curriculums, CASCADE delete |
| source_entity_id | UUID | FK → curriculum_entities, CASCADE delete |
| target_entity_id | UUID | FK → curriculum_entities, CASCADE delete |
| relation_type | TEXT | `'requires'`, `'part_of'`, `'leads_to'`, `'contrasts_with'`, `'exemplifies'`, `'applies_to'` |
| description | TEXT | Human-readable explanation of relationship |
| weight | NUMERIC | Edge strength / confidence (0.0–1.0) |
| created_at | TIMESTAMPTZ | default NOW() |

Indexes: on `curriculum_id`, `source_entity_id`, `target_entity_id`, and `relation_type`.

### 6.8 `system_settings`
`key TEXT PK`, `value TEXT NOT NULL`. Known keys: `website_link` (seed `http://localhost:3000`), `active_grade_levels` (JSON array of enabled grades), `active_tracks` (JSON array of enabled Baccalaureate tracks: `['medicine_life_sciences', 'engineering_cs', 'business', 'arts_literature']`), `active_curriculum_ids` (JSON array).

### 6.7 `chat_sessions`
`id UUID PK`, `user_id UUID FK → profiles CASCADE`, `device_id TEXT NULL`, `title TEXT NOT NULL` (first ~35 chars of first message), `subject_name TEXT NOT NULL`, `grade_level TEXT NOT NULL`, `mode TEXT NOT NULL DEFAULT 'detailed'` (`socratic`/`detailed`/`summary`, added by `supabase_migration_phase1.sql`), `engagement_points_awarded BOOLEAN NOT NULL DEFAULT false`, `created_at`.

### 6.8 `chat_history`
`id UUID PK`, `user_id UUID FK → profiles SET NULL`, `device_id TEXT NULL`, `sender TEXT NOT NULL` (`'user'`/`'ai'`), `message TEXT NOT NULL`, `coins_cost NUMERIC NOT NULL DEFAULT 0.0`, `session_id UUID FK → chat_sessions CASCADE` (indexed), `created_at`. AI rows may embed `<thought duration="N">...</thought>` prefix.

### 6.9 `exams`
`id UUID PK gen_random_uuid()`, `title TEXT`, `subject_name TEXT`, `grade_level TEXT`, `questions JSONB NOT NULL` (array of `{id, type: multiple_choice|true_false|essay, question, options?, correct_answer, explanation}`), `session_id UUID FK SET NULL`, `user_id UUID FK SET NULL` (indexed), `device_id TEXT NULL` (indexed), `created_at`. Strictly student-scoped: queries are filtered by `user_id` so students only see their own exams.

### 6.10 `exam_submissions`
`id UUID PK`, `exam_id UUID FK CASCADE`, `user_id UUID FK CASCADE`, `device_id TEXT NULL`, `answers JSONB NOT NULL` (`{questionId: answer}`), `score NUMERIC NOT NULL` (0–100), `evaluation TEXT NOT NULL` (Arabic AI feedback), `points_awarded NUMERIC NOT NULL DEFAULT 0`, `is_first_attempt BOOLEAN NOT NULL DEFAULT false`, `submitted_at`.

### 6.11 `reports`
`id UUID PK`, `user_id UUID FK SET NULL`, `device_id TEXT`, `message_id TEXT`, `session_id UUID FK SET NULL`, `reported_content TEXT NOT NULL`, `user_query TEXT`, `reason TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'pending'` (`pending`/`action_taken`/`reviewed`/`dismissed`), `action_taken TEXT NULL`, `admin_notes TEXT NULL`, `created_at`. Indexes on status, created_at.

### 6.12 `notifications`
`id UUID PK`, `user_id UUID FK → profiles(id) ON DELETE CASCADE NULL` (null for general broadcasts, user UUID for targeted notifications), `title TEXT`, `body TEXT`, `type TEXT DEFAULT 'info'` (`info`/`success`/`warning`/`maintenance`), `target TEXT DEFAULT 'both'`, `active BOOLEAN DEFAULT true` (indexed), `created_at`. Indexes on `active`, `user_id`.

### 6.13 `flashcard_decks`
`id UUID PK`, `user_id UUID FK → profiles CASCADE`, `subject_name TEXT NOT NULL`, `grade_level TEXT NOT NULL`, `title TEXT NOT NULL`, `created_at TIMESTAMPTZ default NOW()`.

### 6.14 `flashcards`
`id UUID PK`, `deck_id UUID FK → flashcard_decks CASCADE`, `question TEXT NOT NULL`, `answer TEXT NOT NULL`, `box INTEGER NOT NULL DEFAULT 1`, `next_review_at TIMESTAMPTZ default NOW()`, `created_at TIMESTAMPTZ default NOW()`.

### 6.15 `payment_transactions` (added by `supabase_migration_payments.sql`)
| Column | Type | Default / Constraint |
|---|---|---|
| id | UUID | PK `gen_random_uuid()` |
| user_id | UUID | FK → `profiles(id)` SET NULL |
| order_id | TEXT | UNIQUE NOT NULL |
| plan_id | TEXT | NOT NULL (`pro_1m`, `pro_2m`, `pro_3m`) |
| amount | NUMERIC | NOT NULL (50, 100, 250 EGP) |
| currency | TEXT | NOT NULL DEFAULT `'EGP'` |
| status | TEXT | NOT NULL DEFAULT `'pending'` (`pending`, `success`, `failed`, `refunded`) |
| provider | TEXT | NOT NULL DEFAULT `'kashier'` |
| transaction_id | TEXT | nullable (Kashier transaction reference) |
| payment_method | TEXT | nullable (`card`, `wallet`, etc.) |
| raw_response | JSONB | nullable (full webhook/callback event payload) |
| created_at | TIMESTAMPTZ | default NOW() |
| updated_at | TIMESTAMPTZ | default NOW() |

Indexes: on `user_id`, `order_id`, and `status`.

### 6.16 `user_devices` (added by `supabase_migration_device_limit.sql`)
| Column | Type | Default / Constraint |
|---|---|---|
| id | UUID | PK `gen_random_uuid()` |
| user_id | UUID | FK → `profiles(id)` ON DELETE CASCADE NOT NULL |
| device_id | TEXT | NOT NULL |
| session_token | TEXT | nullable |
| device_name | TEXT | NOT NULL DEFAULT `'جهاز غير معروف'` |
| device_type | TEXT | NOT NULL DEFAULT `'desktop'` (`desktop`/`mobile`/`tablet`) |
| browser_fingerprint | TEXT | nullable |
| ip_address | TEXT | nullable |
| user_agent | TEXT | nullable |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| last_active_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

Constraints & Indexes:
- **`UNIQUE(user_id, device_id)`**
- Indexes on `(user_id, is_active)`, `device_id`, `session_token`, and `(user_id, last_active_at DESC)`.

### 6.17 `contact_messages` (added by `supabase_migration_customer_service.sql`)
| Column | Type | Default / Constraint |
|---|---|---|
| id | UUID | PK `gen_random_uuid()` |
| name | TEXT | NOT NULL |
| contact_info | TEXT | NOT NULL (phone or email) |
| category | TEXT | NOT NULL DEFAULT `'استفسار عام'` |
| message | TEXT | NOT NULL |
| user_id | UUID | nullable, FK → `profiles(id)` ON DELETE SET NULL |
| status | TEXT | NOT NULL DEFAULT `'pending'` (`pending`, `replied`, `resolved`, `dismissed`) |
| admin_notes | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

Indexes on `status`, `created_at DESC`, `user_id`.

### 6.18 `user_lesson_progress` (added by `supabase_migration_engagement.sql`)
| Column | Type | Default / Constraint |
|---|---|---|
| id | UUID | PK `gen_random_uuid()` |
| user_id | UUID | FK → `profiles(id)` ON DELETE CASCADE NOT NULL |
| grade_level | TEXT | NOT NULL |
| subject_name | TEXT | NOT NULL |
| unit_title | TEXT | NOT NULL |
| lesson_title | TEXT | NOT NULL |
| completed | BOOLEAN | NOT NULL DEFAULT false |
| completed_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

Constraints & Indexes:
- **`UNIQUE(user_id, grade_level, subject_name, unit_title, lesson_title)`**
- Indexes on `(user_id, grade_level, subject_name)` and `(user_id, completed)`.

### 6.19 `study_notebook` (added by `supabase_migration_engagement.sql`)
| Column | Type | Default / Constraint |
|---|---|---|
| id | UUID | PK `gen_random_uuid()` |
| user_id | UUID | FK → `profiles(id)` ON DELETE CASCADE NOT NULL |
| grade_level | TEXT | NOT NULL |
| subject_name | TEXT | NOT NULL |
| title | TEXT | NOT NULL |
| content | TEXT | NOT NULL |
| note_type | TEXT | NOT NULL DEFAULT `'formula'` (`formula`, `law`, `definition`, `solution`, `general`) |
| session_id | UUID | nullable, FK → `chat_sessions(id)` ON DELETE SET NULL |
| message_id | TEXT | nullable, unique ID of the specific AI message in `chat_history` |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

Indexes: on `(user_id, subject_name)`, `session_id`, and `(user_id, created_at DESC)`.

### 6.20 Local-dev fallback
`web/src/lib/db.ts` uses `./db_data.json` in Node.js runtime and an in-memory database store (`globalThis.__egs_memory_db`) in Edge runtime when Supabase env vars are absent. It mirrors the tables above and seeds default admin and test accounts. On deployment, **Supabase is mandatory** (`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in environment).

---

## 7. Backend API Reference

All routes under `web/src/app/api/`. Conventions:
- **Bearer auth:** `Authorization: Bearer <token>` — custom HMAC token (section 10).
- **Guest header:** `x-device-id` (client-generated, spoofable).
- **Admin:** Bearer + DB check `profile.role === 'admin'` (an `authorizeAdmin()` helper duplicated per admin route).
- Nearly all routes declare `export const runtime = 'edge'` (exception: `chat/upload-image`, Node runtime).
- **Sliding-window rate limiting** protects authentication and intensive endpoints (`rate_limiter.ts`), decoupled into account (per-email) and network (per-IP) limits to support classroom NATs and concurrent traffic. Error messages are Arabic.

### 7.1 Authentication & Profile
| Route | Method | Body / Params | Behavior |
|---|---|---|---|
| `/api/auth/register` | POST | `{email, password, terms_accepted, name?, grade_level?, track_id?, elective_subject?}` | Simplified signup: requires **email and password only** (+ terms). Rate limited: 5 attempts/10m per email + 60 attempts/10m per IP (prevents OTP spamming while enabling concurrent classroom/NAT registrations). Validates email regex + terms; PBKDF2 password hash; 6-digit OTP (`crypto.getRandomValues`), 10-min expiry; sends Resend email (RTL Egyptian Arabic template, green branding) via `src/lib/email.ts` (logs OTP in dev/test); **on production email failure returns 502 (no fallback OTP)**; upserts `pending_registrations` with `grade_level` defaulting to `'unselected'` and `name` to `'طالب جديد'`. 400/429/502/500. |
| `/api/auth/otp` | POST | `{email, otp, has_registered_before, device_id?, browser_fingerprint?, platform?}` | Verifies OTP strictly against stored code; rate limited per IP and email (5/10m); expired OTPs (10 min) are rejected and pending row deleted. Creates profile (`grade_level: 'unselected'` if not set), registers device session under `user_devices` (enforcing max 3 devices limit), deletes pending row, returns `{token, user, is_new_user: true}` to launch the post-registration sequential onboarding wizard. |
| `/api/auth/login` | POST | `{email, password, device_id?, browser_fingerprint?, platform?}` | Rate limited: 5 attempts/min per email + 60 attempts/min per IP. Verifies via `verifyPassword` (PBKDF2; legacy sha256 accepted and transparently re-hashed to PBKDF2 on success); registers device under `user_devices`. **Max 3 devices limit enforcement**: if user already has 3 active devices, all previous devices are automatically revoked (`is_active = false`) and only this new device becomes active (activeCount = 1). Returns `{token, user}`. |
| `/api/auth/google` | POST | `{credential, grade_level?, track_id?, elective_subject?, device_id?, browser_fingerprint?, platform?}` | Full server-side Google ID-token verification (exp/iss/aud + RSA signature via JWKS with 1h in-memory cache and 8s abort timeout, standard WebCrypto Base64URL parsing). **Quick Registration**: if new user, creates profile directly (`grade_level: 'unselected'`, `name: googleName`, `password_hash: ''`) with automatic schema fallback in `db.createProfile` for unmigrated tracking columns (`welcome_reward_claimed`, `free_plan_claimed`), registers device, grants exactly 20.0 free trial coins, and returns `{token, user, is_new_user: true}` without pre-login modal blocking; triggers the post-registration sequential onboarding wizard inside the platform. |
| `/api/auth/devices` | GET (Bearer) | `?device_id=` | Returns active devices list (`{id, device_id, device_name, device_type, ip_address, last_active_at, is_current_device}`) and active count (`count`). Checks if current device is revoked → 401 `device_session_revoked`. |
| `/api/auth/devices` | DELETE (Bearer) | `?device_id=` or `?action=logout_all_others` or `?action=logout_all` | Deactivates target device or all other devices. Returns `{success: true}`. |
| `/api/auth/logout` | POST (Bearer) | `{device_id?}` | Deactivates the specified device session (`is_active = false`) on user logout. |
| `/api/auth/update-grade` | POST (Bearer) | `{grade_level, track_id?, elective_subject?}` | Whitelist-validated grade update (5 valid grades); persists `track_id` and `elective_subject` for `2_high` (Baccalaureate). |
| `/api/auth/update-profile` | POST (Bearer) | `{action, ...}` | `update-name`; `update-improve-ai` (updates student AI response quality improvement setting `{improve_ai_opt_in: boolean}`); `complete-onboarding` (single-parse request payload atomically updating `grade_level`, `track_id`, `elective_subject`, and `name`); `claim-welcome-reward` (grant of 15.0 welcome points capped at 20.0 total starting balance with `welcome_reward_claimed: true`); `subscribe-free-plan` (confirms free plan and guarantees daily freemium renewal with `free_plan_claimed: true`); `claim-apology-compensation` (verifies existing account cutoff, additive grant of 15.0 non-renewable compensation coins with `apology_compensation_claimed: true` and `apology_dismissed: true`); `dismiss-apology` (marks `apology_dismissed: true` for the student account); `send-otp` (generates crypto-random OTP, emails it via Resend, stores in `password_resets` with 10-min expiry); `verify-otp` (validates stored OTP + expiry) + `new_password` (PBKDF2), deactivates all other devices on password change for security, deletes the reset row on success. |
| `/api/auth/delete-account` | POST (Public / Bearer) | `{action: 'send-otp'|'verify-otp'|'delete-current', email?, otp?}` | Public email OTP deletion or direct Bearer deletion. Permanently cascades/deletes profile, user devices, chat history, exams, submissions, flashcards, reports, and active subscriptions. |

### 7.2 Chat
| Route | Method | Behavior |
|---|---|---|
| `/api/chat` | POST (Bearer) | Body `{message, subject_name (required), grade_level?, session_id?, thinking?:boolean, mode?:'socratic'|'detailed'|'summary'|'step_by_step' (default 'detailed'), history?}`. **Unified Single-Model (`deepseek-flash`) & Subscriber-Only Reasoning**: All chat completions use `deepseek-flash` (DeepSeek-V4.1-Flash with native multimodal vision). The `thinking` parameter (Deep Thinking / Reasoning Mode) is strictly gated server-side: enabled only if the user is an active subscriber (`plan !== 'free'` with `subscription_status === 'active'`) or admin/unlimited credit; for free users, `thinking` is automatically forced to disabled (`{ type: 'disabled' }`). Coins are calculated using reasoning rates when thinking is active and fast rates otherwise. **Registration Required (No Unregistered Trial)**: Unregistered trial access has been completely cancelled to prevent model cost misuse and spoofed `x-device-id` quota bypassing. `/api/chat` strictly requires an authenticated student session (`login_required`, returns 401 if unauthenticated). Verified new student profiles receive non-renewable trial points (exactly 20.0 coins) protected by multi-factor anti-abuse checks (`checkAndRecordTrialGrant`). **Conversational Fast-Lane:** pre-RAG intent classifier detects casual openings, greetings (`السلام عليكم`, `ازيك`, etc.), introductions, compliments, and inquiries about camera/image capabilities (`isImageCapabilityInquiry`); bypasses EdenAI & heavy RAG pipelines entirely, emitting `greeting` or `capabilities` (`📷`) search step with zero delay and streaming personalized Egyptian teacher responses in <1s with 0 out-of-curriculum warnings. Image capability inquiries immediately confirm multimodal vision support, explain the Camera and Attachment buttons, and invite students to photograph problems. Otherwise executes full RAG flow (section 8). Flow: validate → profile → coins>0 (else 429 `limit_reached` returning daily renewal message for active plan subscribers, or direct trial-exhausted Pro upgrade CTA for free accounts) → **Session Resolution & Subject Alignment**: if `session_id` is supplied, authoritatively loads `existingSession`, enforces user ownership (403 if unauthorized), overrides `subject_name` and `targetGrade` with the session's recorded subject and grade, and synchronizes mode; if no `session_id`, auto-creates session with incoming `subject_name` and `targetGrade` → curriculum exists for (grade,subject) (else 400 `course_unavailable`) → save user msg → last-message history → RAG (section 8) → DeepSeek stream. Messages carrying an `[AUDIO_MESSAGE:...]` prefix are stored raw but sent to the LLM as `[System Note: The following text is a transcription of the student's spoken voice message] <text>`. Incoming image messages carry `[صورة ملتقطة بالكاميرا / مرفقة من الطالب: <desc>] \n\nطلب أو سؤال الطالب حول الصورة: <text>`. **SSE response** (`text/event-stream`), events: `search_step {step,icon,message}`, `thought {content}`, `content {content}`, `done {session_id, subject_name, duration, coins_used, remaining_coins}`, `error`. Post-stream: coin deduction, AI message saved with `<thought duration="N">` prefix and `coins_cost`. |
| `/api/chat/history` | GET (Bearer) | `?session_id=`; ownership check (403); returns `{success: true, session: {id, title, subject_name, grade_level, mode}, history: [...]}`; capped at last 100 messages. |
| `/api/chat/sessions` | GET/POST/DELETE (Bearer) | List (rows include `mode`); create `{title, subject_name, grade_level}`; delete by `?id=` with ownership check (cascade removes messages). |
| `/api/chat/upload-image` | POST (Bearer required) | `{base64, mimeType}` → DeepSeek Flash (`deepseek-flash`, native multimodal, fallback EdenAI VQA `google`→`openai`) with a fixed Arabic "describe everything literally" question → `{description}`. Requires coins>0 (else 429); deducts a flat 0.5 coins per analysis; enforces the 5 MB cap server-side (413). |
| `/api/chat/transcribe` | POST (Bearer or `x-device-id`) | `{base64, mimeType, durationSeconds?}` ≤20 MB (413). Requires coins>0 (429). Uses **Alibaba Cloud DashScope ASR** (`qwen3-asr-flash` synchronous with `asr_options: { language: 'ar' }`, fallback `qwen-audio-3.0-asr-flash-filetrans`) via `ALIBABA_API_KEY`, coupled with a high-fidelity **Egyptian Dialect & Curriculum Phonetic Refinement layer** (`refineEgyptianTranscript`). Transcribes student speech in <1s with 100% colloquial Egyptian accuracy (preserving dialect words like عايز، كده، إزاي، دلوقتي، علشان، مش، يا مستر without converting to MSA) and repairs phonetic mishearings of English/scientific terms (DNA, RNA, physics/chemistry laws). Deducts a flat 0.15 coins. Edge runtime. |

### 7.3 Exams
| Route | Method | Behavior |
|---|---|---|
| `/api/exams` | GET (Bearer) | `?subject_name=`; grade from profile; strictly returns only the authenticated student's own exams (`user_id` scoped) **with `correct_answer` and `explanation` stripped from every question** (answers withheld until submission). |
| `/api/exams` | POST (Bearer) | Persist an exam object (used for chat-emitted `[CREATE_EXAM]`); associates exam with authenticated `user_id`; response is answer-stripped. |
| `/api/exams/generate` | POST (Bearer) | `{subject_name, grade_level, topic?, mode: 'auto'|'total_only'|'custom_types'|'remedial', remedial_concepts?: string[], total_count?, mcq_count?, tf_count?, essay_count?}`. Node.js runtime (`maxDuration = 60`). Coins>0 else 402. Context is intelligently retrieved via `getCurriculumContextForLesson(grade_level, subject_name, topic)`. Powered by the centralized pedagogical specification engine `web/src/lib/exam_specifications.ts` (`buildOfficialExamSystemPrompt`). **Stage-by-Stage Calibration (NCEEE Standards):** (1) `1_middle`: Reformed curriculum (المنهج المطور), 40% comprehension, 40% direct application, 20% simple deduction; (2) `2_middle`: 30% comprehension, 45% application, 25% analysis & cause-and-effect; (3) `3_middle`: Governorate booklet standards (البوكليت الموحد), 30% comprehension, 40% application, 30% HOTS & problem solving; (4) `1_high`: Restructured secondary stage, 85% MCQ, 15% short essay, 70% comprehension/application, 30% HOTS, integrated science cross-disciplinary problems, philosophical fallacies; (5) `2_high` (Egyptian Baccalaureate - السنة الثانية بكالوريا): 50% analytical MCQ, 50% critical thinking short essay, **Zero Rote Memorization** (open Concept Booklet assumption; complete prohibition of recalling bare definitions, dates, or names), humanities source criticism (primary document analysis, unstated Realpolitik motives, long-term geopolitical repercussions, comparative historical analysis, counterfactual reasoning "ماذا كان سيحدث لو...", functional syntax in complex inversions/ellipses, and argumentative claims vs empirical evidence). DeepSeek `deepseek-flash` temp 0.4 with `max_tokens: 8000`, `thinking: { type: 'disabled' }`, and `response_format: json_object`, with automatic fallback to Gemini Flash via EdenAI → strict JSON exam with resilient question recovery → parse & clean markdown fences → coin deduction (x12.5) → save with authenticated `user_id`. Response is answer-stripped. |
| `/api/exams/submit` | POST (Bearer) | `{exam_id, answers}`. Node.js runtime (`maxDuration = 60`). Validates that the exam belongs to the requesting student (403 Forbidden if mismatched). Evaluates student answers using grade-level pedagogical rubrics: For `2_high` Baccalaureate, evaluates short essay answers on Critical Thinking, Deductive Logic, Evidence, and Causality without penalizing students for personal phrasing rather than verbatim textbook regurgitation; for `1_high` and preparatory grades, grades based on clear sequential steps, formulas, and conceptual explanations. For English exams, generates diagnostic feedback and concept tags (`mastered_concepts`, `revision_concepts`) in English. If user has sufficient coins, uses DeepSeek `deepseek-flash` temp 0.3 with `thinking: { type: 'disabled' }` and automatic fallback to Gemini Flash via EdenAI → resilient JSON parser & regex fallback → `{score 0-100, evaluation}` → coin deduction (x12.5) → awards first-attempt ranking points (`is_first_attempt`) for leaderboard competition without increasing AI usage currency balance → save submission. If user has zero coins (depleted trial/quota), automatically runs deterministic automated grading against correct answers without 402 rejection, calculating the score, saving the submission, awarding first-attempt merit points, and providing encouraging feedback (in English for English exams, Egyptian Arabic for other subjects) to preserve student effort and eliminate churn. Response includes `questions_review` (per-question `student_answer`, `correct_answer`, `explanation`). |
| `/api/exams/submissions` | GET (Bearer) | User's submissions strictly scoped to authenticated `user_id` (silently `[]` when logged out). |

### 7.4 Public / utility
| Route | Method | Behavior |
|---|---|---|
| `/api/config` | GET (optional auth) | `export const dynamic = 'force-dynamic'`. `{website_link, active_grade_levels (default 5 grades), active_tracks (default 4 tracks), active_curriculum_ids, all_curriculums, guest_messages_count: 0, guest_coins: 0, user?, daily_quests?}`. Includes `daily_quests` when user is authenticated to eliminate startup waterfall requests. Never hard-fails. **Conditional HTTP Caching & ETags:** Computes deterministic `ETag` based on public config version/fingerprint, `curriculum_version`, and authenticated user state (`coins`, `points`, `plan_type`, `subscription_status`, `streakDays`, `allCompleted`); returns `HTTP 304 Not Modified` with 0 body bytes when `If-None-Match` matches, saving 51 KB per request. Uses `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (with `no-store`) for fresh updates. Backed by in-memory cache in `db.ts` (`PUBLIC_CONFIG_CACHE_TTL_MS = 30000`) with instant curriculum/settings mutation invalidation and version tracking. |
| `/api/config` | POST (Admin) | Persist `website_link` / `active_grade_levels` / `active_tracks` / `active_curriculum_ids` to `system_settings`. Automatically bumps `curriculum_version` and invalidates public config and curriculums in-memory caches immediately. |
| `/api/notifications` | GET (public / optional auth) | `?target=web`; active rows matching target. If `Authorization: Bearer <token>` is present, returns active broadcasts (`user_id IS NULL`) plus targeted personal notifications matching the authenticated `user_id`. Otherwise returns only public broadcasts. **Conditional HTTP Caching & ETags:** Computes `ETag` based on notification IDs and state; returns `HTTP 304 Not Modified` on matching `If-None-Match`. Uses `Cache-Control: private, no-cache, must-revalidate` (without `no-store`). Backed by in-memory caching in `db.ts` for both broadcast and user notifications (`cachedUserNotifications`, 60s TTL) with instant admin invalidation. |
| `/api/report` | POST (Bearer or device-id) | `{reported_content (req, ≤8000), user_query (≤2000), reason (≤500), message_id (≤200), session_id?}` → `reports` row. |
| `/api/contact` | POST (Public / Optional Bearer) | `{name, contact_info, category?, message}`. Validates fields, associates authenticated `user_id` if present, saves message to `contact_messages` with status `'pending'`. |
| `/api/log` | POST (Bearer or device-id) | Client telemetry echoed to server console (`[BROWSER LOG]:`), capped 4000 chars. Not persisted. |

### 7.5 Active Recall & Gamification
| Route | Method | Behavior |
|---|---|---|
| `/api/flashcards` | GET (Bearer) | Returns a list of flashcard decks for the authenticated user, including each deck's `total_count` and `due_count` (calculated using Leitner schedule: `box` intervals 1, 2, 7, 14, 30 days). |
| `/api/flashcards` | POST (Bearer) | `{subject_name, grade_level, title, cards: [{question, answer}]}`. Manually creates a flashcard deck and inserts card rows. |
| `/api/flashcards` | PATCH (Bearer) | `{id, title}`. Renames a flashcard deck. |
| `/api/flashcards` | DELETE (Bearer) | `?id=`. Deletes a flashcard deck and all its contained cards. |
| `/api/flashcards/card` | PATCH (Bearer) | `{id, question, answer}`. Edits a single flashcard's question and answer. |
| `/api/flashcards/card` | DELETE (Bearer) | `?id=`. Deletes a single flashcard. |
| `/api/flashcards/subject` | GET (Bearer) | `?subject_name=`. Returns all pooled flashcards and decks under a given subject for subject-level stacked review. |
| `/api/flashcards/generate` | POST (Bearer) | `{subject_name, grade_level, topic, count}`. Node.js runtime (`maxDuration = 60`). Generates a new flashcard deck using AI. Injects targeted lesson textbook context via `getCurriculumContextForLesson`. Enforces strict Modern Standard Arabic (`الفصحى الأكاديمية`) for Arabic subjects and 100% English for English subjects with zero colloquialisms. Focuses on conceptual understanding, scientific reasoning, and application rather than rote definition recall. DeepSeek `deepseek-flash` temp 0.35 with `thinking: { type: 'disabled' }` is prompted to produce a JSON array of QA cards. Deducts coins on success. |
| `/api/flashcards/review` | GET (Bearer) | `?deck_id=`. Returns flashcards from the specified deck that are currently due for review (`next_review_at <= now`). |
| `/api/flashcards/review` | POST (Bearer) | `{card_id, rating}`. Submits a review score (1-5) for a flashcard. Adjusts the card's Leitner `box` number and updates `next_review_at` accordingly (increases box on score >= 4, resets to box 1 on score <= 2). |
| `/api/leaderboard` | GET (Bearer) | `?grade_level=my|all&limit=10`. Returns the top 10 leaderboard rankings ordered by `points DESC` (`"نقاط الترتيب"`), along with `user_rank` containing the student's exact ranking number, points, study streak, accuracy, and `is_in_top_10` status. |
| `/api/pwa/install` | POST (Bearer) | Body `{platform?: 'android'|'ios'|'desktop'}`. Records student PWA installation in database (`pwa_installed = true`, `pwa_installed_at`, `pwa_platform`), invalidates dashboard stats cache. |

### 7.6 Admin (all Bearer + role check; 401/403)
| Route | Methods | Behavior |
|---|---|---|
| `/api/admin/dashboard` | GET | Aggregated platform metrics with in-memory 30s TTL caching (`cachedDashboardStats`, `invalidateDashboardStatsCache`): totalUsers, subscribedUsersCount (active paid plans), freeUsersCount, expiredUsersCount, totalRevenueEGP (calculated from successful `payment_transactions`), conversionRate (percentage of total students converted to paid), subscriptionsByPlan breakdown (`pro_1m`, `pro_2m`, `pro_3m`), activeTodayCount (students active in past 24 hours), totalExamsCount, totalMessagesCount, totalFlashcardDecksCount (total flashcard decks created), totalFlashcardsCount (total individual flashcards created), flashcardsCreatedTodayCount (decks/cards created today in Cairo time), averageCardsPerDeck, flashcardsBySubject (breakdown of decks created per subject), flashcardsByGrade (breakdown of decks created per grade), totalPwaUsersCount (total students who installed the PWA), pwaAdoptionRate (percentage of students adopting PWA), pwaUsersByPlatform (`android`, `ios`, `desktop`), pwaUsersByGrade, pwaUsersList (roster of PWA students with name, contact, grade, platform, install timestamp), usersByGrade, highestUsageUser, and highestUsageGrade. Eliminates full-history memory loads through fast head-count queries. |
| `/api/admin/users` | GET `?search=&tier=&grade_level=` / PATCH `{id, unlimited_credit?, action?}` / DELETE `{id}` | Students & Subscriptions Directory API: GET supports search filtering (`name`, `phone`, `email`), subscription tier filtering (`tier: 'all' | 'free' | 'subscribed' | 'expired' | 'pwa'`), and grade level filtering (`grade_level`). Returns `{ success: true, users: usersWithDevices, counts: { total, subscribed, free, expired, pwa } }` including active devices, plan details, PWA installation status (`pwa_installed`, `pwa_installed_at`, `pwa_platform`), AI privacy opt-in status (`improve_ai_opt_in`), and live academic activity counts: `messages_sent_count` (total messages sent by student in chat), `active_chat_days_count` (number of distinct days the student sent a message to the AI in Cairo time), `flashcard_decks_count` (number of flashcard decks created by student), `flashcards_created_count` (number of flashcards created by student), `exams_created_count` (number of exams generated for student), and `exams_completed_count` (number of exams submitted/evaluated). PATCH supports `action === 'reset_devices'` and `unlimited_credit`. Self-delete blocked; password hashes excluded. |
| `/api/admin/users/conversations` | GET (Bearer, Admin only) | `?userId=` | Student AI Conversations History API: Returns `{ success: true, opted_out: false, student, sessions, messages, totalSessions, totalMessages }` for the specified student. **Privacy Enforcement:** If student opted out (`improve_ai_opt_in === false`), strictly returns HTTP 403 Forbidden with `{ success: false, opted_out: true, error: "قام هذا الطالب بإلغاء تفعيل خيار المساعدة في تحسين استجابات الذكاء الاصطناعي... تم حجب سجل المحادثات بالكامل" }` and zero chat messages. |
| `/api/admin/customer-service` | GET `?action=student_detail&userId=` / POST | Admin Operations & Student Control Hub: (1) `action: 'student_detail'` returns detailed dossier with subscription timestamps, metrics, devices, academic activity counts (`messages_sent_count`, `active_chat_days_count`, `flashcard_decks_count`, `flashcards_created_count`, `exams_created_count`, `exams_completed_count`), and cancellation eligibility; (2) `action: 'grant_subscription'` activates plan (`pro_1m`, `pro_2m`, `pro_3m`), configures duration (days), sets daily coin cap, inserts `payment_transactions` record (`provider: 'admin_manual'`), dispatches targeted congratulations in-app notification, and invalidates stats cache; (3) `action: 'update_student_profile'` updates name, phone, email, grade_level, and track_id; (4) `action: 'toggle_account_status'` toggles account freeze / ban (`suspended` / `inactive`); (5) `action: 'send_direct_notification'` dispatches targeted in-app notification to student (`user_id`); (6) `action: 'cancel_subscription'` verifies strict 72h / 0-coin-spent condition, reverts to `'free'`, and marks transaction as refunded; (7) `action: 'recalculate_coins'` resets daily coins to plan cap and updates date; (8) `action: 'add_coins'` adds arbitrary coins; (9) `action: 'deduct_coins'` safely deducts coins down to 0; (10) `action: 'delete_student'` permanently purges student account and cascades; (11) `action: 'update_report_action'` logs admin resolution notes. |
| `/api/admin/support-messages` | GET `?status=&category=` / PATCH `{id, status, admin_notes?}` / DELETE `{id}` | Support Ticket Desk: lists contact form submissions, updates ticket status (`pending`, `replied`, `resolved`, `dismissed`) and internal notes, or deletes tickets. |
| `/api/admin/reports` | GET `?status=` / PATCH `{id, status, action_taken?, admin_notes?}` / DELETE | AI Complaints Moderation: filters by status (`pending`, `action_taken`, `reviewed`, `dismissed`), saves action taken note, updates status, or permanently deletes report. |
| `/api/admin/notifications` | GET / POST / PATCH `{id,active}` / DELETE | Title ≤200, body ≤2000, type/target whitelisted, optional `user_id` targeting. |
| `/api/admin/curriculum` | GET / POST / PATCH `{id, subject_name}` / DELETE `{id}` | GET returns curricula list with `Cache-Control: no-store, no-cache, must-revalidate`. POST supports two modes: (1) Multipart upload (`file`, `grade_level`, `subject_name`, `track_id?`, `is_elective?`) or attaching to existing placeholder (`curriculum_id`, `file`), executing rapid hierarchical parent-child chunking, GraphRAG entity/relation extraction, and database persistence in <2s (Node.js runtime, `maxDuration = 60`), returning `pendingEmbeddingCount` for client-driven progressive embedding; (2) JSON/multipart placeholder creation (`is_placeholder: true`, `grade_level`, `subject_name`, `track_id?`, `is_elective?`) without a file. All creations, file attachments, renames, and deletions trigger `syncCurriculumStateMutation`, bumping `curriculum_version` in `system_settings`, synchronizing `active_curriculum_ids`, and invalidating all server memory caches. |
| `/api/admin/curriculum/detail` | GET `?id=` / POST `{id, grade_level, subject_name, content}` | GET reassembles Markdown from chunks with `Cache-Control: no-store, no-cache, must-revalidate`; POST re-chunks and re-indexes using fast hierarchical ingestion in <2s (Node.js runtime, `maxDuration = 60`), returning `pendingEmbeddingCount`. Triggers `syncCurriculumStateMutation` to update `curriculum_version` and invalidate caches. |
| `/api/admin/curriculum/embed` | GET `?curriculumId=` / POST `{curriculumId, limit?}` | Progressive Batch Vector Embeddings API (Node.js runtime, `maxDuration = 60`): GET returns `{stats: {totalChildren, embeddedCount, pendingCount, percentage, isComplete}}` with `Cache-Control: no-store, no-cache, must-revalidate`; POST generates 768-dim embeddings in batches of 30 for pending child chunks using Alibaba Cloud text-embedding-v4 (concurrency pool limited to 3, 10s fetch timeouts) with EdenAI fallback, updating `curriculum_chunks` rows incrementally. Automatically bumps `curriculum_version` in `system_settings` and invalidates caches upon batch completion or when `pendingCount === 0`. |
| `/api/admin/curriculum/units` | POST / PUT (Admin) | Body `{id: curriculumId, units: CurriculumUnit[]}`. Updates and persists manually authored units and lessons for a curriculum. Triggers `syncCurriculumStateMutation` to bump `curriculum_version` and purge structure caches immediately. |
| `/api/admin/curriculum/graph` | GET (Admin) | `?grade_level=&subject_name=`. Returns the curriculum's extracted Knowledge Graph (`{success, gradeLevel, subjectName, entityCount, relationCount, entities, relations}`) for visual inspection and debugging. |

### 7.7 Kashier Payment Gateway (Live Checkout)
| Route | Method | Behavior |
|---|---|---|
| `/api/payment/kashier/initialize` | POST (Bearer) | Body `{plan_id: 'pro_1m'|'pro_2m'|'pro_3m'}`. Validates plan and user token. **Blocks duplicate checkouts**: if user already has an active subscription (`subscription_status === 'active'` or `plan_type !== 'free'`), rejects with 400 and Arabic error message. Generates a unique order ID `egs_sub_<id>_<time>`, calculates server-side HMAC-SHA256 order hash, creates a pending `payment_transactions` record, and returns checkout parameters with fallback URL resolution (`NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_SITE_UR`). |
| `/api/payment/kashier/webhook` | POST (public/gateway) | Receives asynchronous server-to-server transaction notifications from Kashier. Verifies HMAC signature with `KASHIER_SECURITY_KEY` / `KASHIER_API_KEY`. If payment succeeded (`SUCCESS`/`CAPTURED`/`APPROVED`), marks transaction `success`, records `cardBrand` as payment method, activates duration (30/60/90 days), tops up daily coin balance to the plan cap (80/90/120), and creates an in-app confirmation notification targeted to the subscriber. |
| `/api/payment/kashier/callback` | GET / POST (public/gateway) | Handles customer redirect from Kashier checkout. Multi-mode signature verification (raw query sequence, arrival order, sorted order, signatureKeys). Confirmed gateway payments for legitimate database orders are never falsely marked as failed. Activates subscription on success and redirects to `/?payment_result=success&orderId=...&plan=...`; only explicitly cancelled/declined attempts redirect to `/?payment_result=failed`. |
| `/api/payment/kashier/verify` | POST (Bearer) | Client-side verification endpoint called when checkout modal emits a completion event. Validates HMAC signature against Kashier data, verifies transaction amount against database record, and activates subscription with `cardBrand` tracking. |
| `/api/payment/sponsor-info` | GET (Public / Edge) | `?student_id=`. Returns safe public student profile metadata (`name`, `grade_level`, `track_id`, `elective_subject`, `study_streak`, `points`, `plan_type`, `subscription_status`) for the parent sponsorship portal (`/sponsor`), enabling parents to view their child's academic context before paying. |
| `/api/payment/kashier/initialize-sponsor` | POST (Public / Gateway) | Body `{student_id, plan_id, payer_name?, payer_phone?}`. Public endpoint for parent sponsorship checkout. Validates student profile and plan, blocks duplicate checkouts for already active students, generates unique order ID `egs_spon_<id>_<time>`, calculates server-side HMAC-SHA256 order hash, creates a pending `payment_transactions` record linked to `user_id = student_id`, and returns Kashier checkout parameters. When payment succeeds, webhook/callback automatically activates the subscription on the student's account. |
| `/api/user/verify-currency` | POST (Bearer) | Authenticated currency and subscription verification endpoint. Evaluates Cairo calendar date (`Africa/Cairo`), checks exact subscription status and countdown, computes exact time to next renewal (00:00 Cairo time), generates HMAC signature, and returns verified state to synchronize client and server. |

### 7.8 Curriculum Structure API
| Route | Method | Behavior |
|---|---|---|
| `/api/curriculum/structure` | GET (Public / Dynamic) | `export const dynamic = 'force-dynamic'`. `?grade_level=&subject_name=`. Reads the manually configured curriculum units and lessons from the database record for `(grade_level, subject_name)`. Uses `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` to ensure immediate freshness. Backed by `structureCache` in `curriculum_structure.ts` with 30s TTL and registered instant cache invalidation on any curriculum mutation. Returns `{ success: true, hasCurriculum: boolean, curriculumId?, gradeLevel, subjectName, units: CurriculumUnit[], totalLessons: number }`. |

### 7.9 Gamified Rewards & Re-Engagement Automation
| Route | Method | Behavior |
|---|---|---|
| `/api/user/quiz-points` | POST (Bearer) | Body `{points: 2}`. Securely awards and persists merit ranking points (+2 points) when an authenticated student solves an in-chat interactive quiz card (`[QUIZ_QUESTION]`). Enforces boundary checks (1–5 points), calls `db.addPoints(userId, points)`, and returns updated total points. |
| `/api/cron/study-reminder` | GET / POST (Bearer / CRON_SECRET / Admin) | Edge automated retention worker. Identifies students registered between 12h and 7d ago who have only sent ≤1 chat message and have not studied today. Dispatches branded educational HTML retention emails via Resend (`sendStudyReminderEmail`) inviting them back to preserve their study streak. Rate-limited in batches of 15. |

### 7.10 Student Engagement, Retention & Study Notebook APIs
| Route | Method | Behavior |
|---|---|---|
| `/api/user/curriculum-progress` | GET (Bearer) | `?grade_level=&subject_name=`. Returns `{progress: UserLessonProgress[], completedCount, totalCount, percentage}` for the requested subject or user's current grade. |
| `/api/user/curriculum-progress` | POST (Bearer) | Body `{grade_level, subject_name, unit_title, lesson_title, completed: boolean}`. Upserts student's lesson completion state, updating `completed_at`, and returns updated progress stats. |
| `/api/user/daily-quests` | GET (Bearer) | Computes student's daily mission progress for today in Cairo time (`Africa/Cairo`): 1. Solving an exam / quiz (`quest_exam`), 2. Asking tutor 3 questions (`quest_chat`), 3. Saving a law or reviewing flashcards (`quest_notebook`). Returns `{quests: DailyQuestItem[], streak, completedCount, totalQuests, allCompleted}`. |
| `/api/user/daily-quests` | POST (Bearer) | Body `{quest_id}`. Claims rewards (+15 merit points) for a completed daily quest. Persists claim to prevent double-dipping, calls `db.addPoints(userId, 15)`, and returns updated quest item and total points. |
| `/api/user/study-notebook` | GET (Bearer) | Node.js runtime (`export const runtime = 'nodejs'`). `?subject_name=&action=resolve&note_id=`. Returns user's saved notebook items (laws, formulas, definitions, student notes) with full KaTeX math formatting and localDB fallback. Supports `action=resolve&note_id=` to resolve originating `session_id` and `message_id` for direct chat navigation. |
| `/api/user/study-notebook` | POST (Bearer) | Node.js runtime. Body `{grade_level, subject_name, title, content, note_type?, session_id?, message_id?}`. Sanitizes UUIDs, strips thought tags, and saves an AI explanation or formula directly into Supabase `study_notebook` with automatic retry without foreign keys on schema mismatches, and disk persistence fallback (`db_data.json`). |

---

## 8. AI Pipeline (RAG v4: GraphRAG + Okapi BM25 Hybrid Retrieval)

- **DeepSeek** `https://api.deepseek.com/v1/chat/completions` — `deepseek-flash` (unified single model: DeepSeek-V4.1-Flash with native multimodal capabilities and configurable thinking mode). Powers real-time chat streaming, student tutor persona, multimodal problem image analysis, exam generation, grading, flashcards, query intelligence (`analyzeQueryIntelligence`), HyDE passage generation, RAG context gap assessment (`assessContextGap`), curriculum summaries (`generateCurriculumSummary`), student engagement classification (`classifyEngagement`), and context fact-checking guardrails (`validateResponseAgainstContext`). Reasoning Mode (Deep Thinking) is enabled exclusively for active subscribers and admins, while free users receive fast direct answers with thinking disabled.
- **Curriculum Generator (Localhost:3005 Multimodal Engine):** Standardized on **DeepSeek-V4.1-Flash (`deepseek-flash`)** as the single unified model for both textbook page visual OCR understanding and curriculum Markdown structuring. The older disjoint pipeline (discontinued EdenAI/Gemini OCR -> text-only structuring) has been replaced by a direct single-pass multimodal inference workflow with thinking disabled for sub-second page processing.
- **Alibaba Cloud DashScope** `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings` — `text-embedding-v4` (primary embedding model with Matryoshka Representation Learning configured for 768 dimensions, directly populating Supabase pgvector `VECTOR(768)` with zero database migrations; batch size $\le 10$).
- **Alibaba Cloud DashScope Speech-to-Text (ASR):** Powered by **Qwen3-ASR-Flash (`qwen3-asr-flash`)** via `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` (fallback `qwen-audio-3.0-asr-flash-filetrans`). Ultra-low-latency synchronous speech recognition (<1s) with native Arabic phonetic alignment, backed by an Egyptian Dialect & Curriculum Phonetic Refinement layer (`refineEgyptianTranscript`) that preserves 100% colloquial Egyptian while repairing phonetic mishearings of science/English terms.
- **EdenAI** `https://api.edenai.run/v2/text/chat` (Gemini 2.5 Flash as multi-provider fallback for query intelligence, gap checks, summaries, and exam generation), `/v2/text/embeddings` (Google text-embedding-004, 768-dim as fallback dense vector embedding), `/v2/image/question_answer` (VQA google→openai as fallback for student image analysis), `/v2/audio/speech_to_text_async` (STT google→openai, Arabic, polled).
- **Token Efficiency & Meta-Prompting Strategy:** System prompts, metadata extraction schemas, and structural formatting rules are written in dense, unambiguous English instructions to reduce prompt token consumption by ~40-50% and enhance reasoning adherence. DeepSeek performs Arabic curriculum analysis and outputs Arabic HyDE passages and keywords, while operating under a strict high-priority directive mandating friendly, authentic Egyptian colloquial Arabic (`اللهجة المصرية التعليمية المهذبة`) for all student explanations.
- **Resend** for OTP email.

### 8.2 Main system prompt (`buildSystemPrompt(context, mode, lessonMode, subjectName, gradeLevel)` in `deepseek.ts`)
Persona "EGS AI" — master Egyptian teacher with deep familiarity with the official Egyptian curriculum:
1. Primary Persona Mandate: Speak in natural, polite, intellectually refined Egyptian educational Arabic (`بالعامية المصرية التعليمية الراقية والذكية`), maintaining academic dignity and composure.
   - **Grade-Level Adaptive Pedagogical Profiles (`web/src/lib/exam_specifications.ts`):** The prompt adapts dynamically according to the student's exact grade:
     * **1st Prep (`1_middle` - الصف الأول الإعدادي المطور):** Reformed curriculum standard. Focus on scientific inquiry, foundational understanding, real-life connections, and accessible phrasing. Cognitive weighting: 40% comprehension, 40% direct application, 20% simple deduction.
     * **2nd Prep (`2_middle` - الصف الثاني الإعدادي):** Intermediate preparatory consolidation. Cognitive weighting: 30% comprehension, 45% application, 25% cause-and-effect analysis & comparison.
     * **3rd Prep (`3_middle` - الشهادة الإعدادية):** Standardized governorate booklet specification (البوكليت الموحد). Precise step-by-step rubrics. Cognitive weighting: 30% comprehension, 40% application, 30% HOTS & problem-solving.
     * **1st Secondary (`1_high` - الصف الأول الثانوي):** Tablet exam format (85% MCQ, 15% short essay). 70% comprehension/application, 30% HOTS. Interdisciplinary Integrated Sciences (العلوم المتكاملة), philosophical logic and fallacy analysis.
     * **Egyptian Baccalaureate 2nd Year (`2_high` - السنة الثانية بكالوريا):** Complete paradigm shift to **Zero Rote Memorization** (open Concept Booklet assumption). Balanced 50% analytical MCQ and 50% critical-thinking short essay. 100% higher-order thinking (35% deep comprehension, 40% critical thinking/deduction, 25% case studies & problem solving). For Humanities (Arabic and History): ZERO date or name recall; focuses exclusively on primary source criticism, unstated Realpolitik motives behind treaties/decisions, long-term geopolitical repercussions, comparative historical analysis, counterfactual reasoning ("ماذا كان سيحدث لو..."), functional grammar governing meaning in complex inversions/ellipses, and argumentative claims vs empirical evidence. Specialized track problem scenarios across Medicine, Engineering, Business, and Arts.
   - **Strict Zero Raw Emojis Mandate:** Aligned with CODING_GUIDELINES Rule 1, the AI is strictly forbidden from outputting raw decorative emojis (e.g. 🎯, 📘, ✨, 🤔, 📌, ✅, 🚀, 💡, 👏, 🔥) in headings, bullet lists, or text. Headings and lists use standard clean Markdown (bold text, numbered lists, bullet dashes, blockquotes).
   - **Sophisticated Academic Tone & Zero Sycophancy / Unearned Flattery Directive:** Strictly forbidden from showering the student with flattery, artificial praise, or complimentary remarks merely for asking a question or requesting an explanation (e.g., forbidden from saying "سؤال ممتاز يدل على ذكائك", "سؤالك ينم عن نباهتك / عبقريتك", "سؤال ذكي جداً", "Your question demonstrates your brilliance"). Asking routine curriculum questions is standard student behavior; labeling routine inquiries as genius is patronizing and synthetic. The AI opens directly with conceptual substance or a clean pedagogical setup ("النقطة الجوهرية هنا هي...", "لفهم المسألة بدقة، خلينا نحلل...", or direct formula/concept breakdown without opening filler). Authentic praise (e.g. "أحسنت", "استنتاج دقيق", "ممتاز", or reserved titles like "يا بطل") is strictly reserved for earned academic milestones (independently solving a tough problem, subtle non-trivial deduction, or full lesson completion).
   - **Strict Constraint on Filler Honorifics:** Strictly avoid repetitive or mechanical overuse of filler titles such as `يا بطل` or `يا دكتور` or `يا بشمهندس`. Never open routine messages with "تمام يا بطل" or "أهلاً يا بطل".
   - **Language Purity in Arabic Explanations:** In Arabic subjects, strictly forbids accidental foreign language word insertions in Arabic prose (e.g. "يعتبر" instead of "considered"). Foreign text is permitted only for English subject content, scientific symbols, units, or code variables.
1.1. **Zero "Missing Information" Prohibition & Unsolicited Roadmap Guardrail:** The AI is strictly forbidden from ever stating "لا أملك هذه المعلومة" (I don't have this information) or "المعلومة غير متوفرة في المنهج المرفوع" for questions belonging to an active curriculum subject. It must answer authoritatively based on Egyptian curriculum standards. It is also strictly forbidden from predicting or launching an unsolicited multi-point lesson roadmap when the student merely asked a specific question or concept inquiry.
1.2. **Subject & Grade Level Boundary Enforcement (حماية حدود المادة والصف الدراسي):**
- **Session Identity Headers:** Every chat session injects the student's explicit registered grade level (e.g. `الصف الأول الإعدادي` / `1st Preparatory`), selected subject (e.g. `العلوم`), and active curriculum (`منهج العلوم (الصف الأول الإعدادي)`) into the system prompt header.
- **Different Grade Level Redirection Directive:** If a student asks questions, lessons, or inquiries belonging to a different grade level than their registered profile, the AI does not answer from another grade's syllabus; it provides the mandatory directive:
  * In Arabic: `"يبدو أنك في [اسم الصف الدراسي]... للإجابة بناءً على منهجك المحدد، يرجى الانتقال إلى 'الملف الشخصي' (Profile) وتحديث صفك الدراسي."`
  * In English: `"It appears you are in [Grade Level]... To answer based on your specific curriculum, please go to 'Profile' and update your grade level."`
- **Different Subject Redirection Directive:** If a student asks questions belonging to a different school subject than the currently selected subject, the AI does not attempt to solve it or pretend to hold other curricula in this chat; it provides the mandatory directive:
  * In Arabic: `"المنهج المتاح لدي حالياً هو [اسم المنهج]... للإجابة بناءً على منهجك، يرجى بدء محادثة جديدة واختيار المادة المطلوبة. (كما نذكرك بالتأكد من اختيار صفك الدراسي الصحيح من خلال 'الملف الشخصي' (Profile))."`
  * In English: `"The curriculum I currently have access to is [Curriculum Name]... To answer based on your curriculum, please start a new chat and select the desired subject. (Also, remember to select your correct grade level under 'Profile'.)"`
- **Prohibition of Interactive Cards on Redirection:** When issuing subject or grade redirection messages, the AI is strictly forbidden from attaching interactive quiz/exam cards (`[QUIZ_QUESTION]`, `[CREATE_EXAM]`, `[CREATE_FLASHCARDS]`).
- **Casual Greetings Exemption:** Greetings, courtesies, introductions, and general study habits do not trigger the boundary redirection.
1.3. **Multimodal Vision Capabilities & Camera / Image Input as Standard Input:**
- **Standard Input Recognition:** The AI tutor natively supports receiving camera captures, photos, and uploaded images as standard, first-class input alongside text.
- **Strict Prohibition of Text-Only Claims:** The AI is strictly forbidden from claiming, stating, or implying that it is a text-only model (`نموذج نصي فقط`, `لا أستطيع رؤية الصور`, `لا أستقبل صوراً`). It possesses full vision capabilities.
- **Handling Inquiries on Sending Images/Photos:** When asked if it can receive images, take pictures with the camera, see pictures, or solve problems from photos, it confirms with warmth and enthusiasm in polite Egyptian Arabic, guides students to the two dedicated composer buttons (Camera button for live capture, Attachment button for gallery files), and invites them to photograph their exercises.
- **Incoming Image Processing:** Attached/captured images are automatically analyzed and injected into the prompt as `[صورة ملتقطة بالكاميرا / مرفقة من الطالب: <description>] \n\nطلب أو سؤال الطالب حول الصورة: <text>`. The AI references the image naturally in its explanation and solves/explains the problem thoroughly step-by-step.
2. Breadcrumb Grounding: Context includes exact Unit and Lesson paths (e.g. `[الوحدة X > الدرس Y > المفهوم Z]`), enabling the AI to explicitly reference the syllabus context.
3. Egyptian Curriculum Methodology: Given → laws in KaTeX LaTeX → steps → result+unit for STEM; grammar-rule-first + syntactic parsing for languages; precise facts, dates, and causes/results for humanities.
4. **Mathematical & STEM Rigor Protocol (معايير كتابة الرياضيات والرموز العلمية):**
   - **Curriculum-Aware Mathematical & Scientific Notation:**
     * **Physics, Chemistry, and Sciences (الفيزياء، الكيمياء، العلوم المتكاملة):** In Secondary Physics (e.g. الصف الثاني الثانوي - 11th Grade Physics), Chemistry, and Integrated Sciences, ALL formulas, mathematical equations, physical variables ($V, v, a, t, d, F, m, c, \lambda, \nu, \theta, f, E, P, \rho, g, h$), units ($\text{m/s}, \text{kg}, \text{N}, \text{J}, \text{W}, \text{s}, \text{Hz}, \text{Pa}$), and numerical values ($4.0, 3.0, 5.0, 60, 30^\circ, 9.8, 3 \times 10^8$) MUST BE WRITTEN IN ENGLISH (Latin letters and Western digits $0-9$) formatted in standard KaTeX / LaTeX, flowing Left-to-Right (LTR), EXACTLY as taught in the official Egyptian Ministry of Education textbook. Strictly forbidden to translate physics or chemistry symbols or numerals into Arabic.
     * **Arabic General Mathematics (منهج الرياضيات باللغة العربية):** When explaining Arabic mathematics (الجبر، الهندسة، التفاضل، حساب المثلثات في التعليم العام), use Arabic variables ($س, ص, ع, ن, ر, أ, ب$), combinations strictly formatted as $ن \text{ ق } ر$ (e.g. $٦ \text{ ق } ٣$), permutations ($ن \text{ ل } ر$), term ranks ($ح_ن$), and Eastern Arabic numerals ($٠-٩$) formatted in KaTeX flowing RTL. If a problem or formula specifically uses Latin variables ($x, y, z$), it is kept in English notation with Western digits ($0-9$).
   - **Absolute Prohibition of Raw Unicode Math Characters:** Strictly forbidden to output raw Unicode superscripts (⁰, ¹, ², ³, ⁴, ⁵, ⁶, ⁷, ⁸, ⁹) or Unicode multiply (×) or divide (÷) in plain text, which trigger browser BiDi inversion. All equations and variables must be formatted in standard KaTeX / LaTeX (`$$` block, `$` or `\(\)` inline).
   - **Binomial Theorem, Multi-Variable Expansions & Pascal's Triangle:** Must state the curriculum general term formula ($ح_{ر+١}$), show each term sequentially on separate display lines ($ح_١, ح_٢, \dots$) with standalone variable powers ($أ^٣ ب^٢$, never nesting variables in superscripts or double superscripts), format Pascal's triangle rows right-to-left with Arabic numerals ($مفكوك (أ + ب)^٤ \leftarrow ١ \quad ٤ \quad ٦ \quad ٤ \quad ١$), and state the complete un-truncated final expansion without omitting terms.
5. Geometric diagrams as fenced ```` ```svg ```` blocks — whitelist `svg,path,circle,rect,line,polygon,polyline,text,g,ellipse`; theme colors (`#00B4D8`, `#FFB703`, `#7209B7`, `currentColor`); viewBox required; Arabic labels.
6. Interactive protocol tags: `[QUIZ_QUESTION]{json}[/QUIZ_QUESTION]`, `[CREATE_EXAM]{json}[/CREATE_EXAM]`, `[CREATE_FLASHCARDS]{json}[/CREATE_FLASHCARDS]`, `[LESSON_NAV]{json}[/LESSON_NAV]`.
7. **Master Question Language Mandate (Standard Arabic & English):** While the tutor's conversational explanation and coaching tone is friendly Egyptian educational Arabic, ALL questions (text-based in chat or interactive cards `[QUIZ_QUESTION]`, `[CREATE_EXAM]`, `[CREATE_FLASHCARDS]`), answer options, model answers, and explanations MUST strictly be in flawless Modern Standard Arabic (`الفصحى الأكاديمية السليمة`) or 100% English for English subjects. Colloquial Egyptian vocabulary (e.g., `إيه`, `ليه`, `مين`, `دول`, `علشان`, `ازاي`) is strictly prohibited in question stems, options, and model answers.
8. Calibrated Out-of-curriculum warning: Answers are primarily derived from the injected curriculum context. When answering queries genuinely beyond the curriculum, the response begins on the very first line with: `"تنبيه: هذه المعلومة خارج المنهج المقرر عليك، ولكنها تفيدك في فهم الدرس..."`. **Strict Exception:** Greetings (`السلام عليكم`, `ازيك`), courtesies, introductions, study tips, and general conversation MUST NEVER receive this warning. Never issue this warning for any syllabus concept or term belonging to the subject.
9. **Comprehension-First Question Architecture & Strict Question Gating:**
   - **Full Comprehension & Meaning Derivation:** All questions must rely on full comprehension and the ability to derive meaning and implications from the curriculum text. Pure rote memorization questions (bare definitions verbatim, memorizing dates or numbers without context, word-matching) are strictly prohibited.
   - **Secondary & Egyptian Baccalaureate Standards (Bloom's HOTS & Zero Rote):** For high school grades (`1_high`, `2_high`), questions strictly measure Higher-Order Thinking Skills (analysis, evaluation, deduction, and syllabus learning outcomes / نواتج التعلم). For `2_high` (Egyptian Baccalaureate), enforces strict **Zero Rote Memorization** (no recalling bare dates, definitions, or names): in History, questions evaluate primary source criticism, hidden Realpolitik motives behind treaties, long-term geopolitical impacts, and counterfactual deduction ("ماذا كان سيحدث لو..."); in Arabic, questions evaluate implicit meaning, claims vs evidence vs refutation, functional syntax in complex inversions/ellipses, and rhetorical semantic value.
   - **Distractor Quality:** Distractors must be intelligent, scientifically plausible concepts addressing common misconceptions, never silly or obvious fillers.
   - **Mandatory Randomization of Correct Answer Positions:** The correct answer position MUST be dynamically distributed across all 4 positions (Options 1, 2, 3, or 4 / أ، ب، ج، د) and NEVER default to option 1. The `correct_answer` value must match verbatim with one of the strings in the `options` array.
   - **Strict Question Gating (Zero Question Spam):** Unnecessary, repetitive, or nonsensical questions are strictly prohibited. The AI never generates `[QUIZ_QUESTION]` cards or test questions on casual greetings, courtesies, brief clarifications, redirections, platform queries, or when the curriculum context lacks depth. Question cards are emitted ONLY when explicitly requested by the student, upon full lesson completion, or at the conclusion of substantial, deep conceptual explanations.
10. Mode-specific behavioral block (`MODE_INSTRUCTIONS`): **socratic** (scaffolded guiding questions in Modern Standard Arabic that stimulate deep comprehension and deduction without colloquial slang or trivial rhetorical queries), **detailed** (structured student-friendly explanations with core formula/takeaway in the first 2 lines, avoiding monolithic walls of text), **step_by_step** (rigorous 4-tier STEM problem-solving scaffold: `[المعطيات والمطلوب]`, `[القانون المستخدم]`, `[التعويض والخطوات الحسابية]`, `[الناتج النهائي والوحدة والتحقق]`), **summary** (high-yield exam review bullet points).
11. **Single Point / Specific Concept Explanation Directive (شرح نقطة أو مفهوم محدد غير مفهوم بالكامل في رسالة واحدة):** When a student asks about a specific concept, term, question, difficulty, or point they don't understand (e.g. "مش فاهم نقطة...", "اشرحلي الجزئية دي", "ليه النواة موجبة", "علل...", "ما هو...", "احسب..."):
    - The AI does NOT trigger the multi-turn roadmap or divide the answer across multiple messages.
    - Delivers a comprehensive, in-depth explanation in a SINGLE complete response covering: (1) Core concept simply and intuitively, (2) Scientific reasoning / mechanism from textbook, (3) Practical worked example or analogy, (4) Exact law/formula in KaTeX with units, (5) Concluding interactive `[QUIZ_QUESTION]` card in Standard Arabic testing deep comprehension (only if the concept has sufficient depth; omitted on brief answers to avoid clutter), (6) Curiosity hook.
12. **Dual-Mode Lesson Pedagogical System (منظومة شرح الدروس الثنائية):**
    - **Mode A: Comprehensive Full Lesson Masterclass (`lessonMode = 'full_lesson'`):** Triggers when the student requests an overall explanation of a lesson (e.g., "اشرح لي الدرس الأول بالتفصيل", "عايز شرح الدرس كامل", "اشرح درس الحضارة والتاريخ"). Delivers a complete, in-depth, structured masterclass in a single turn covering: (1) Inspiring opening & targeted learning outcomes, (2) Balanced, proportional pacing covering all lesson units with distinct headings ("أولاً:", "ثانياً:", etc.), definitions, causes, analogies, and formulas without front-heavy token exhaustion, (3) High-order exam tips and concept linkages for Egyptian secondary school exams, (4) High-yield comparison summary table, (5) Concluding `[QUIZ_QUESTION]` card, (6) Closing curiosity challenge for the next lesson. Does NOT prematurely halt after Point 1 and does NOT append `[LESSON_NAV]`.
    - **Mode B: Interactive Step-by-Step Lesson Protocol (`lessonMode = 'step_by_step'`):** Triggers when the student explicitly requests step-by-step guidance ("ذاكر معايا خطوة بخطوة", "اشرحلي نقطة بنقطة") or advances via `[LESSON_NAV]` action buttons. Turn 1 announces roadmap and explains Point 1 with maximal exhaustive detail; subsequent turns advance to Point K with full depth; final turn celebrates completion with summary and quiz question; every turn appends `[LESSON_NAV]`.

### 8.3 RAG flow (Sub-1.5s Optimized Tri-Fusion Retrieval, with live `search_step` SSE events)
0. **Conversational & Multimodal Capability Fast-Lane Check:** If the student's message is a greeting or introduction (`isConversationalGreeting`) or an inquiry about sending camera/image inputs or multimodal capabilities (`isImageCapabilityInquiry`), steps 1–5 are bypassed entirely. For greetings, emits an immediate `greeting` search step; for image/camera capability inquiries, emits `capabilities` (`📷`) and streams an enthusiastic Egyptian teacher response in <1s confirming camera photos and images as standard input, detailing the Camera and Image buttons, and inviting questions with zero out-of-curriculum warnings.
0.5. **Exhaustive Full Lesson Retrieval Mode (`getExhaustiveLessonContext`):** If the student requests a lesson explanation (`isLessonRequest`):
    - Bypasses snippet-based 8-candidate chunk capping.
    - Identifies the matching lesson via `findMatchingLessonInCurriculum` (enhanced regex supporting numerical `الدرس 1`, Arabic ordinal `الدرس الأول`, and subtitle matching).
    - Extracts 100% of the textbook content from `curriculum_chunks` under `__RAW_MARKDOWN__` in <100ms without downloading all chunks over the network.
    - Sets `lessonMode = 'full_lesson'` (or `'step_by_step'` if user requested turn-by-turn guidance).
1. `analyzeQueryIntelligence` (DeepSeek Flash via `model: 'deepseek-flash'` with `thinking: { type: 'disabled' }`, `response_format: { type: 'json_object' }` and 350 max tokens, completed in ~500ms) → `{queryType, isLessonExplanation, lessonTitle, arabicKeywords, englishKeywords, hydePassage, searchAnnouncement, metadata}`.
2. Parallel Tri-Fusion Retrieval (`runHybridTriFusionRetrieval` in `hybrid_retriever.ts`):
   - **Dense Vector Search**: Semantic cosine similarity on Alibaba Cloud `text-embedding-v4` (primary, 768-dim) / Google `text-embedding-004` via EdenAI (fallback).
   - **Direct Supabase Postgres RPC**: Executes `hybrid_search_curriculum(p_curriculum_id, p_query_embedding, p_arabic_query, p_match_count)` directly in PostgreSQL in ~48ms, eliminating multi-megabyte network transfers.
   - **GraphRAG Traversal**: Knowledge Graph sub-graph exploration (`KnowledgeGraphEngine` in `graph_rag.ts`) with preserved chunk UUID links.
3. Weighted Reciprocal Rank Fusion (W-RRF) selecting top candidates.
4. **Direct Parent Expansion & Fallback Assembly**:
   - Expanded into full parent sections with breadcrumb hierarchy (`# Unit > ## Lesson > ### Subtitle`).
   - If fusion yields <2 chunks, scans and extracts relevant sections directly from curriculum markdown.
5. Real-time SSE Stream (`search_step`): Emits `analyzing`, `searching`, `graph_traversal`, `fusion`, and `found`.
6. Real-time DeepSeek streaming: Sub-1.5s time-to-first-token. `reasoning_content` → `thought` events, `content` → `content` events; usage tokens captured for billing.

### 8.4 Curriculum ingestion pipeline (`curriculum_processor.ts`)
Unified for initial upload (`/api/admin/curriculum`) and detail edits (`/api/admin/curriculum/detail`):
Source Markdown is stored directly in `curriculums.content` (exact raw preservation ensuring zero distortion and 100% fidelity) → split into **parents** with deduplicated breadcrumb hierarchy (`# Unit > ## Lesson > ### Subtitle`; PARENT_MAX 500 tokens) → **children** via sentence-aware sliding window (CHILD_MAX 120 tokens, 24-token overlap, Arabic `؟` aware) → batch embeddings (10 per Alibaba Cloud call via `text-embedding-v4`, fallback 20 per EdenAI call via `text-embedding-004`) → Gemini curriculum summary stored as parent chunk `__CURRICULUM_SUMMARY__` (position −1) → **Knowledge Graph Entity & Relation Extraction** preserving real UUIDs → batch insert chunks and graph records with parent-child ID mapping. Fallback reconstruction in `getCurriculumDetail` reconstructs hierarchical `# Unit`, `## Lesson`, and `### Subtitle` headings if raw content is absent on legacy records.

### 8.5 Fallback chain
Gemini intelligence fails → regex stop-word-filtered keywords; embedding fails → enhanced BM25; RPC fails → BM25 full-curriculum scan; GraphRAG traversal / auto-backfill fails → fail-safe empty subgraph; sparse context / retrieval dropout → direct curriculum detail markdown section extraction; VQA google fails → openai.

---

## 9. Coin (Points) Economy & Merit Leaderboard

### 9.1 Coins (Usage Currency & Renewal Integrity)
- EGP cost per chat: single unified model `deepseek-flash`: **reasoning rate (Deep Thinking enabled)** `prompt/1M x 150 + completion/1M x 200`; **standard fast rate (Deep Thinking disabled)** `prompt/1M x 30 + completion/1M x 50`. **Coins = EGP x 10.**
- Exams (generate + submit): flash rates **x 12.5**. Image analysis (`/api/chat/upload-image`): flat 0.5 coins.
- Floor at 0 with 2-decimal-place precision math (`toPreciseCoins`) preventing floating-point drift. `admin` role or `unlimited_credit` never deducted.
- Unregistered visitors: 0 coins. Trial coins (exactly 20.0 coins) are granted upon registration via `checkAndRecordTrialGrant` (ensuring no more and no less than 20.0 free points on account creation), with daily freemium renewal (5.0 coins) replenished at 12:00 AM Cairo Time. (The previous one-time 15.0-point compensation apology modal for legacy accounts registered on or before `2026-09-10T16:00:00Z` has been permanently retired and disabled from the user interface).
- **Registered users: daily replenishment and subscription expiry check (lazy, in `checkAndResetDailyCoins` via `getProfile`)**:
  - Automatically verifies `subscription_end_date`. If past expiration (`Date.now() >= subscription_end_date`), strictly downgrades `plan_type` to `'free'`, sets `subscription_status = 'expired'`, and stops all subsequent daily replenishments, preventing overstay.
  - Active subscribers are guaranteed daily renewal up to their plan cap (`DAILY_COIN_CAPS`: `pro_1m` 80.0, `pro_2m` 90.0, `pro_3m` 120.0, legacy `pro` 80.0, `max` 120.0) at 12:00 AM Cairo Time (`Africa/Cairo`) each calendar day throughout the active subscription. Free accounts receive an initial trial grant plus a sustainable daily freemium lifeline (`DAILY_COIN_CAPS.free = 5.0`) replenished each calendar day at 12:00 AM Cairo Time for fast queries, while Deep Thinking (Reasoning Mode), image analysis, and exam generation are strictly gated to active subscribers to maintain high upgrade intent without a permanent abandonment cliff.
  - Balances above the cap are never reduced.
  - **Schema Fallback & Resilience:** When optional subscription tracking columns (`subscription_status`, `subscription_start_date`, `subscription_end_date`, `subscription_plan_id`) are pending migration execution in Supabase, the backend (`db.ts`), verification engine (`currency_verifier.ts`), and client (`page.tsx`) automatically infer `'active'` subscription status and compute duration (30 days for `pro_1m`, 60 days for `pro_2m`, 90 days for `pro_3m`/`max`) from `plan_type` and `payment_transactions`. Self-healing logic in `checkAndResetDailyCoins` automatically detects and repairs truncated 30-day end dates on 2-month and 3-month accounts, backfilling accurate start/end dates so subscribers receive their complete academic term. The client formats the remaining duration into clear Arabic text (`3 أشهر (90 يوماً متبقياً)`, `شهران (60 يوماً متبقياً)`, `شهر واحد (30 يوماً متبقياً)`). Migration script `supabase_migration_fix_subscription_durations.sql` provides the database-level backfill for all existing accounts.
- Anti-tampering: Central server validation and HMAC-signed verification payloads guarantee accurate balances, prevent client-clock manipulation, and enforce strict expiration.
- 429 `limit_reached` from `/api/chat` when coins ≤ 0.
- All coin deductions happen server-side.

### 9.2 Ranking Points (`points` Merit System & Leaderboard)
- **Purpose:** A dedicated, non-depleting merit score tied directly to academic achievement and active participation (labeled `"نقاط الترتيب"` with a `Trophy` icon).
- **Currency Isolation:** Competition points (from exams and chat engagement) strictly increase ranking points (`points`) only; they never increase or award AI usage currency balance (`coins`). Usage currency is replenished exclusively via daily subscription renewals and package activations.
- **Exam First Attempt Scoring (`is_first_attempt = true`):**
  - **100% score:** 5 points
  - **>90% score:** 3 points
  - **>70% score:** 2 points
  - **>50% score:** 1 point
  - **≤50% score:** 0 points
  *(Points are awarded once on the student's first attempt per exam; subsequent retakes do not grant additional points).*
- **AI-Judged Chat Engagement:**
  - On chat completion (`/api/chat` done event), an asynchronous background classification evaluates the session's first meaningful user engagement (`classifyEngagement`).
  - If genuine engagement is detected in a new session (`engagement_points_awarded: false`), **+3 points** are awarded and synced to the profile and SSE done payload.
- **Leaderboard RPC (`get_leaderboard` & `get_user_leaderboard_rank`):** Ranks students by `points DESC`, with `study_streak DESC` and `avg_accuracy DESC` as secondary tiebreakers. Leaderboard results are strictly capped to the **Top 10** students. When an authenticated student is not in the Top 10, the server computes and returns their exact overall position (`user_rank`) along with points gap to the 10th rank. Test and trial accounts (non-student roles, or accounts with emails/names containing 'test', 'trial', 'اختباري', or 'تجريبي') are automatically filtered out from all leaderboard queries.

---

## 10. Authentication and Sessions

- **Password hashing:** PBKDF2-HMAC-SHA256 (WebCrypto, 100k iterations, 16-byte random salt, format `pbkdf2$iter$saltB64$hashB64`) in `auth_helpers.ts`. Legacy unsalted sha256 hashes are still verified and transparently re-hashed to PBKDF2 on successful login. Google accounts store `password_hash: ''`. The password-change flow calls `/api/auth/update-profile`.
- **Web session token:** `base64("userId:expiry:HMAC-SHA256(JWT_SECRET, 'userId:expiry')")`, 30-day expiry, constant-time comparison, no revocation/refresh; logout is client-side only. Secret from `JWT_SECRET` (prod refuses to run without it; dev fallback string exists).
- **Multi-Device Limit Security System (Max 3 Concurrent Devices):**
  - Accounts are strictly limited to a maximum of **3 active concurrent devices** (`user_devices` table).
  - Devices are identified by client UUIDs (`localStorage.getItem('egs_device_id')` on web) coupled with device metadata (browser fingerprint, IP address, user agent, Arabic OS/browser label).
  - **Auto-Revocation on 4th Device**: When a user registers or logs in on a new device while already having 3 active devices, the system automatically revokes all previous devices (`is_active = false`) and activates **only** the single new device (active count drops strictly to 1).
  - **Session Validation & Interception**: Protected endpoints validate the active device session via `validateUserSessionDevice`. Revoked devices receive a `401` response with `{error: 'device_session_revoked', code: 'device_session_revoked'}` and are immediately logged out with an informative Arabic explanation dialog.
  - **Device Self-Service Management**: The profile screen features an `"الأجهزة المتصلة والجلسات النشطة"` section with live active counts (`N / 3 أجهزة`), device list with device-type icons (`Smartphone`, `Tablet`, `Laptop`), last active timestamps, and remote single/all-other logout buttons.
  - **Admin Device Reset**: Administrators can view active device counts in the admin users table and reset a user's devices with a single click.
- **Deleted Account & Orphan Session Auto-Logout:**
  - When an account is deleted (via Admin Users, Admin Customer Service, or student self-service `/delete-account`), all database records including `user_devices` are immediately purged.
  - **Deterministic Initial Validation (`/api/config`)**: On browser startup or page load, if a token is provided in `localStorage` for a deleted or non-existent profile, `/api/config` explicitly returns `{ authenticated: false, user: null, user_not_found: true, session_invalid: true }`. The client immediately executes `handleForceLogout`, purging `egs_token`, `egs_user`, `egs_chat_sessions`, `egs_active_exam_id`, etc., and transitions to guest mode with an Arabic session-terminated dialog (`accountDeletedModal`).
  - **Live Heartbeat & Tab Focus Invalidation**: Active sessions automatically verify with `/api/config` whenever the tab regains visibility (`visibilitychange` with a 60-second cooldown to eliminate focus request storms and DevTools spam) and via a recurring 60-second background heartbeat. Deleted users are logged out immediately without needing to perform manual actions.
  - **Universal 401 Interception**: All protected API endpoints (`/api/chat`, `/api/chat/sessions`, `/api/chat/history`, `/api/exams/*`, `/api/flashcards/*`, `/api/auth/devices`, `/api/auth/update-*`, `/api/user/verify-currency`) verify that `db.getProfile(userId)` exists. If not, they return `401 Unauthorized` with `{ error: 'user_not_found', code: 'user_not_found' }`, which triggers `handleForceLogout` across the web client.
- **Simplified Registration Options & Egyptian Arabic Onboarding Flow:**
  - **Option 1 (Top — "تسجيل سريع"):** Google Quick Registration prominently displayed at the very top of the account creation modal. Clicking Google sign-in directly authenticates the student and creates their initial profile without blocking them with pre-login forms.
  - **Option 2 (Bottom):** Registration with **email and password only** (+ privacy/terms acceptance). No upfront stage, track, or name inputs are requested.
  - **OTP Verification (Email):** 6-digit crypto-random (`crypto.getRandomValues`), 10-minute expiry (`OTP_TTL_MS`); Resend email via `src/lib/email.ts` (register + password-reset templates). User enters 6-digit code with friendly Egyptian Arabic instructions ("وصلك كود على إيميلك!").
  - **Sequential Post-Registration Onboarding (Inside the Platform):** Upon completing signup via either Google or Email+OTP, the platform opens, and a neat sequential wizard guides the student:
    - **Screen 1 (Stage):** Student selects their educational stage (`GRADE_NAMES`), and if Secondary/Baccalaureate (`2_high`), selects their specialized track and elective subject.
    - **Screen 2 (Name):** Student inputs or confirms their full name ("اسمك الكريم إيه؟"). Submitting screen 2 calls `/api/auth/update-profile` (`action: 'complete-onboarding'`) to atomically persist the stage, track, elective, and name.
    - **Automatic Starting Balance & Seamless Platform Entry:** Exactly 20.0 free points (no more, no less) are credited automatically to the student's wallet upon account creation (via email OTP or Google Quick Registration). Both welcome reward and free plan subscription flags are atomically marked as claimed (`welcome_reward_claimed = true`, `free_plan_claimed = true`), preventing redundant double-claims or point inflation during sequential onboarding completion (`complete-onboarding`). The previous blocking collection gateway screen (which required clicking two separate buttons before unlocking the platform entry button) was removed to prevent onboarding friction and failure cases. The introductory walkthrough (`startTour('chat')`) now launches immediately and seamlessly.
- **Google Sign-In:** web uses GSI button (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, hardcoded fallback ID in source). Prominently rendered at the top of both register and login views.
- **Guest identity:** web `egs_device_id` = `device_<random36>`. Client-supplied, spoofable.

---

## 11. Message Protocol Tags

These inline tags are the contract between AI output, storage, and the web client. Never change one side without the others (web `page.tsx` parser, backend prompt in `deepseek.ts`).

| Tag | Direction | Meaning |
|---|---|---|
| `[QUIZ_QUESTION]{json}[/QUIZ_QUESTION]` | AI → clients | Interactive quiz card (`multiple_choice` / `true_false` ("true"/"false") / `essay`); 100% in English with dynamic LTR formatting and True/False buttons for the English curriculum. During streaming generation, intercepted before closing tag to display animated placeholder: "جاري إعداد السؤال التفاعلي..." |
| `[CREATE_EXAM]{json}[/CREATE_EXAM]` | AI → clients | Exam invite card; client persists via POST `/api/exams`; strictly English questions for English subject. During streaming generation, intercepted before closing tag to display animated placeholder: "جاري توليد الاختبار..." |
| `[CREATE_FLASHCARDS]{json}[/CREATE_FLASHCARDS]` | AI → clients | Flashcard deck invite card (`{subject_name, title, cards: [{question, answer}]}`); client persists deck via POST `/api/flashcards` and renders interactive review bubble; 100% English cards for English subject. During streaming, displays: "جاري إنشاء كروت الاستذكار..." |
| `[LESSON_NAV]{json}[/LESSON_NAV]` | AI → clients | Interactive lesson navigation card (`{lesson_title, current_point, total_points, current_point_title, next_point_title, is_completed}`); client renders 'الانتقال إلى النقطة التالية' button, plus 'لم أفهم، وضح بمثال إضافي' and 'استمر في الشرح' clarification buttons. During streaming, displays: "جاري تنظيم خطة الدرس..." |
| `<thought duration="N">...</thought>` | storage prefix on AI rows | Collapsible chain-of-thought + duration |
| `[VOICE_MESSAGE:duration=<sec>;mime=<mime>;audio=<base64>]transcript` | user msg prefix | Native voice note sent directly by student to AI; web client renders interactive `AudioMessageBubble` with HTML5 play/pause, animated waveform progress, duration counter, and collapsible transcript; backend extracts transcript + duration and instructs AI of spoken input |
| `[IMAGE_MESSAGE:<mime>;<base64>;<uriEncodedDescription>]text` | user msg prefix | Image + AI description; backend keeps only the description in the prompt (`[وصف الصورة المرفقة من الطالب: ...]`); can be combined with `[VOICE_MESSAGE:...]` when sending image + audio simultaneously |
| ```` ```svg ```` fenced block / `<svg>` | AI → clients | Sanitized inline SVG diagram (DOMPurify on web). During streaming generation, raw XML code is intercepted to display animated placeholder: "جاري إنشاء الرسم التوضيحي..." |
| `$$...$$` / `\[...\]` / LaTeX environments | AI → clients | KaTeX mathematical formulas & symbols. During streaming generation, unclosed formulas or partial syntax errors are intercepted to display animated placeholder: "جاري كتابة الرموز والمعادلات..." |
| `data: {json}` SSE lines, terminator `data: [DONE]` | server → clients | Event types `search_step`, `thought`, `content`, `done` (includes `points_awarded` & `total_points`), `error` |

---

## 12. Web Frontend

Single client component `web/src/app/page.tsx`. Static and public standalone routes for `/terms`, `/privacy`, `/contact`, `/download`, `/delete-account`, `/sponsor`, and `/pay`. View switching via `activeTab` state: `'chat' | 'tasks' | 'admin' | 'subscriptions' | 'beta' | 'profile' | 'exams' | 'flashcards' | 'leaderboard'`.

### 12.0 Application Lifecycle & Deterministic Auth Resolution
- **Zero-Flash Initialization:** On initial client mount, the app enters an `isInitialLoading: true` state for ~120ms while synchronously recovering stored credentials (`egs_token` & `egs_user`) and local layout settings (`egs_theme`, `isMobile`, `sidebarOpen`) from `localStorage`.
- **Branded Preloader:** While `isInitialLoading` is active, renders a lightweight, elegant branded splash screen (deep obsidian `#0E0D0D`, clean framed logo, gradient title, and `Loader2` indicator) preventing Flash of Unauthenticated Content (FOUC) or premature display of registration/login cards for authenticated students.
- **Progressive Transition:** Once auth state is deterministically established, transitions smoothly via `animate-fade-in` directly into the student's personal workspace (if logged in) or the clean guest/login interface (if unauthenticated).
- **Instant-Render Hydration Architecture (Zero Page-Loading Delays):**
  - **Curriculum List Bar (`renderSubjectSelectorBar`):** To eliminate the delayed appearance and layout shift on page open, static default curricula (`DEFAULT_STATIC_CURRICULUMS` from `@/lib/default_curriculums.ts` spanning all 28 Egyptian subjects across `1_middle`, `2_middle`, `3_middle`, `1_high`, and `2_high`) initialize state synchronously on the very first paint. Curricula and active IDs/grades are cached in `localStorage` (`egs_curriculums_cache`, `egs_active_grade_levels`, `egs_active_curriculum_ids`), ensuring returning students retain their exact configured curriculum instantaneously without waiting for network responses.
  - **In-Chat Tasks Circuit Bar:** Rendered immediately on first paint below the floating composer for both guest visitors and authenticated students via fallback daily quests (`DEFAULT_DAILY_QUESTS` / `DEFAULT_DAILY_QUESTS_DATA`), cached synchronously in `localStorage` (`egs_daily_quests`), and updated in-place seamlessly upon completion of background requests or unified `/api/config` payloads. Directly navigates to the dedicated Tasks view (`setActiveTab('tasks')`).
  - **Subject Memory:** Remembers the student's last active study subject (`egs_last_subject`), selecting the corresponding curriculum pill immediately without flash or reset to blank.

### 12.1 Layout, Metadata, and SEO Engine (`layout.tsx`)
`<html lang="ar" dir="rtl">`; title template `%s | EGS AI`, default title `"EGS AI | ذكاء اصطناعي للمناهج المصرية | أول مساعد ومعلم ذكي للمنهج المصري"`; high-CTR educational description highlighting student AI, Thanaweya Amma, Prep school, and step-by-step problem solving.
- **Comprehensive Keyword Registry (150+ terms):** Broadened coverage across:
  - Brand variations & typos (`EGS AI`, `EGSAI`, `egsai`, `egs-ai`, `egz ai`, `egas ai`, `اي جي اس`, `إي جي إس`, `ايجيس`, `ايجس`, `إيجيس`, `اي جى اس`, `منصه اي جي اس`, `تطبيق اي جي اس`).
  - Common phonetic & Arabic spelling mistakes (`زكاء اصطناعي`, `زكاء اصطناعى`, `ذكاء اصتناعي`, `ذكاء صطناعي`, `زكاء صطناعي`, `استطناعي للتعليم`).
  - Generic student AI queries (`ذكاء اصطناعي للطلاب`, `الذكاء الاصطناعي للطلاب`, `ذكاء اصطناعي للمذاكرة`, `ذكاء اصطناعي للدراسة`, `موقع ذكاء اصطناعي للمذاكرة`, `موقع ذكاء اصطناعي يحل مسائل`, `تطبيق ذكاء اصطناعي للمذاكرة`, `مدرس ذكاء اصطناعي`, `شات للمذاكرة`, `بوت مذاكرة`, `شات جي بي تي مصري`, `بديل شات جي بي تي في مصر`).
  - Broad Egyptian artificial intelligence (`Egyptian artificial intelligence`, `Egyptian AI`, `Egypt AI`, `AI in Egypt`, `الذكاء الاصطناعي المصري`, `ذكاء اصطناعي مصري`).
  - English generic student AI (`artificial intelligence for students`, `AI for students`, `student AI`, `AI study assistant`, `AI homework solver`, `AI tutor Egypt`, `free student AI`).
  - Curriculum AI & Egyptian Stages (`ذكاء اصطناعي خاص بالمناهج`, `مساعد المنهج الدراسي المصري`, `ذكاء اصطناعي للثانوية العامة`, `الشهادة الإعدادية`, `تالتة إعدادي`, `أولى ثانوي`, `تانية ثانوي`).
- **Multi-Schema JSON-LD Graph (`@graph`):** Injects 4 interoperable schemas parsed before React hydration:
  1. `WebSite`: Canonical URL, alternate brand aliases (`egsai`, `ايجيس`, `Egyptian Artificial Intelligence`, `Artificial Intelligence for Students`), and Google Sitelinks `SearchAction` (`https://egsaiedu.com/?q={search_term_string}`) enabling Google's search box snippet.
  2. `EducationalOrganization`: Authority entity with `areaServed: Egypt`, official contact points (phone/WhatsApp/email), and educational subjects.
  3. `EducationalApplication`: Software metadata with features list and free-tier pricing (`price: 0 EGP`).
  4. `FAQPage`: 7 keyword-dense Q&As covering curriculum alignment, generic student AI assistance, photo problem solving, and Egyptian platform advantages, directly triggering expandable rich accordion question snippets in Google search results.
- **SSR Crawler Semantics:** Server-rendered hidden semantic element (`<section class="sr-only">`) with H1/H2 hierarchy and educational summaries for student AI and Egyptian artificial intelligence, ensuring instant indexing by Googlebot/Bingbot on the initial HTML request.
- **Sitemap & Robots:** Dynamic `sitemap.ts` indexing all 7 public routes (`/`, `/download`, `/sponsor`, `/contact`, `/terms`, `/privacy`, `/delete-account`) with tuned crawl priorities; `robots.ts` configured for Googlebot with private API route protection; `manifest.ts` configured with educational categories.
- **Dedicated Sub-Page Layouts:** `download/layout.tsx` and `sponsor/layout.tsx` exporting dedicated titles and metadata; contact/terms/privacy metadata enriched with alternates and canonical tags.
- **Client-Side Fuzzy & Overlapping Search Engine:** `normalizeArabicText` in `page.tsx` unifying Alef variants (`[أإآٱ] -> ا`), Taa Marbuta (`ة -> ه`), Yaa/Maksura (`[ىي] -> ي`), Waw with Hamza (`ؤ -> و`), phonetic typo correction (`زكاء -> ذكاء`, `اصتناع -> اصطناع`, `ايجيس -> egs`, `egsai -> egs`), and stripping Tashkeel/Tatweel; `calculateSearchRelevance` and `isFuzzyWordMatch` supporting multi-word token overlap, out-of-order terms, and 1-edit distance typo tolerance, scoring matches and pinning exact and best-matching items right to the very top of search results; listens to external Google Sitelinks SearchBox query parameters (`?q=` / `?search=`) on mount to pre-populate the AI assistant prompt.
- Viewport: `maximumScale 1`, `viewportFit cover`, `interactiveWidget resizes-visual`; theme color `#0D1B2A`; GSI script; MutationObserver strips extension-injected attributes to avoid hydration mismatches. PWA manifest (standalone, theme `#FFB703`, background `#0D1B2A`, portrait orientation, education category), Service Worker registration (`sw.js`). Fonts: Tajawal/Cairo (Arabic body), Outfit (Latin/code).

### 12.2 Module-level components in page.tsx
`CodeBlock` (LTR code + copy), `ThoughtBlock` (collapsible CoT with timer), `MathRenderer` (KaTeX, `throwOnError:false` graceful fallback without raw code dumps, `trust:false`, macros `\RR`, `\NN`, `\ZZ`, `\QQ`, `\CC`, `\degree`, `\degreeC`, `\celsius`, `\ohm`, `\micro`, `\ga` [جا], `\gta` [جتا], `\za` [ظا], `\zota` [ظتا], `\qaf` [ق], `\lam` [ل], `\naha` [نها], `\logar` [لو], `\defe` [د], `\had` [ح]; dynamic language-aware directionality: `dir="ltr"` for Physics, Chemistry, and English formulas containing Latin variables [V, v, a, t, d, F, m, x, y], and `dir="rtl"` strictly for Arabic mathematics formulas [س, ص, ن \text{ ق } ر]; automatic normalization of combinations from legacy `{^n}\text{ق}_r` into standard Egyptian `$n \text{ ق } r$`, preventing reversed `$ر \text{ ق } ن$` rendering; automatic repair of multi-variable binomial term powers and double superscripts; native Greek symbols `\Delta`, `\alpha`, `\beta`, `\gamma`, `\theta`, `\pi` rendered without recursive self-referential macro collisions; automatic Unicode superscript [⁰-⁹] and operator [×, ÷, −, ≤, ≥, ≠, ≈, ±] normalization to LaTeX; preservation of Western numerals in Physics, Chemistry, and science curricula while supporting Eastern Arabic numerals [٠-٩] in Arabic general math formulas with `\text{}` wrapping and Cairo/Tajawal font fallback; CSS `.katex-error` override preventing raw red dumps; graceful unwrap fallback), `SvgDiagram` (DOMPurify svg profile; FORBID script/foreignObject/on-handlers/href), `parseInlineText` (recursive inline parsing supporting mathematical expressions inside bold `**`, italic `*`, and links, with bounded recursion depth [depth < 3] ensuring formulas within bolded statements such as $ن \text{ ق } ر$, $ر$, $ن$ are cleanly parsed and rendered via KaTeX instead of leaking raw code or suffering BiDi inversion; inline math `\(...\)` and `$..$` including spaced delimiters `$ x = 5 $`, display math `\[...\]` and `$$...$$`, enhanced bare LaTeX detection with brace-enclosed whitespace support for functions and symbols `\frac`, `\sqrt`, `\xrightarrow`, `\times`, `\div`, `\pm`, `\approx`, `\le`, `\ge`, `\neq`, `\sin`, `\cos`, `\tan`, `\cot`, `\sec`, `\csc`, `\log`, `\ln`, `\to`, `\rightarrow`, `\Delta`, `\theta`, `\lambda`, `\rho`, `\omega`, `\sigma`, `\phi`, `\psi`, `\pi`, etc.; bold `**`, italic `*`, bold-italic `***`, strikethrough `~~`, code `` ` ``, safe links `[text](url)`), `renderFormattedMath` (universal math & rich markdown renderer utilized across exams questions/options/explanations, flashcards questions/answers, and chat), `MarkdownMessage` (universal parser: recursive blockquotes with RTL callouts, multiline LaTeX math blocks `\[ \]` and `$$ $$`, LaTeX environments `\begin{aligned|align|equation|gather|matrix|cases}`, intelligent standalone math formula detection for both LaTeX and Arabic/Unicode equations, headers H1-H6, horizontal rules `---`, task lists with checkboxes, ordered lists with `arabic-indic` numeral styling in Arabic, RTL tables with inline cell parsing, code & SVG fences), `CurriculumLessonPicker` (student-friendly, streamlined curriculum browser for Exams and Flashcards modals featuring 1-click full curriculum selection, instant live search with query clearing, lightweight unit accordions with 1-tap whole-unit selection, minimal lesson list rows with concept subtitle summaries, and compact pinned/docked active selection summary), `InteractiveQuizCard`, `InteractiveExamInviteCard`, `InteractiveFlashcardInviteCard`, `MotivationalPaywallCard` (high-conversion psychological paywall card for depleted coins with 1-tap WhatsApp parent forwarding, copyable sponsor link, Egyptian payment badges, and 3-day refund guarantee), `FormattedChatMessage` (tag extraction including `[CREATE_FLASHCARDS]` and `[UPGRADE_PAYWALL]`), `SearchStepsPanel` (live RAG steps), `CameraCaptureModal` (direct in-site camera viewfinder via `navigator.mediaDevices.getUserMedia` with front/rear environment facing mode toggle, question framing guides, high-resolution snapshot capture to canvas, instant preview/retake, and 1-tap fallback to native device camera via `<input capture="environment">`), `ImageEditorModal` (canvas crop + brand-palette freehand brush + undo before upload; exports JPEG stepped under 5 MB), `AppTour` (interactive guided walkthrough system with responsive cutout spotlight overlays, safe-area-aware viewport clamping, intelligent non-overlapping target bounding, sticky mobile action controls, and authentic Egyptian Arabic instructions).

### 12.3 Views
1. **Sidebar** (right, RTL): Brand header (logo + grade context), prominent primary "+ محادثة دراسية جديدة" hero action button, followed immediately by an expandable "المحادثات السابقة" (Previous Conversations) section at the top of the list (opens when clicked with session count badge, instant search input with clear button, scrollable previous conversations list with subject chips and hover/touch delete buttons, active session highlighting, and login CTA for guests; selecting an existing session authoritatively synchronizes `chatSubject` and `chatMode` to match that conversation's enrolled subject and mode, ensuring continuous alignment across the header capsule, curriculum progress banner, prompt suggestions, and AI completions), organized workflow categories (المذاكرة والذكاء الاصطناعي: الدردشة والمساعد، **المهام والإنجاز اليومي** with live pending quest count / reward badge, بنك الامتحانات، المدرب الذكي، دفتري الذكي; المسار والتفوق: المسابقة ولوحة المتصدرين، خريطة المنهج; الحساب والخدمات: باقات الاشتراك، الملف الشخصي، لوحة التحكم، تواصل معنا، تحميل التطبيق، جولة في المنصة), and student wallet footer (user name, plan badge, AI coins balance, logout button, and clean policy links). Desktop 320px collapsible; mobile 280px fixed overlay + backdrop.
2. **Chat & Study Hub (Clean Distraction-Free Conversational AI):**
   - **Top Global Header (`<header class="header-responsive">`):** Responsive bar with adaptive height (`calc(58px + env(safe-area-inset-top, 0px))` on mobile, 64px on desktop) and safe-area insets. Features:
     - (a) RTL-right Context zone: Sidebar drawer trigger (`PanelLeftOpen`/`PanelLeftClose` with 38px touch target on mobile) and interactive Subject & Grade Capsule (`.header-subject-capsule` capped at max 130px with text truncation on mobile to prevent clipping).
     - (b) RTL-left Student & Utilities cluster: On desktop renders the full Tasks pill + Coins pill + Points pill; on mobile intelligently deduplicates by showing a compact Coins (14px icon) + Points (14px icon) pill while Tasks and Profile are permanently anchored at the student's thumb via the 5-tab Mobile Bottom Navigation bar. Includes Smart Study Notebook shortcut with count badge (`.header-icon-btn.active-gold`, 38px on mobile, 17px icon), Notifications bell with unread indicator and adaptive dropdown positioning (`top: calc(60px + env(safe-area-inset-top, 0px))`), 1-tap Theme Switcher (38px on mobile, 17px Moon/Sun icon), and Student Avatar / Login CTA (hidden on mobile header for authenticated users since Profile is tab 5 in bottom nav).
   - **Decluttered Chat Landing State:** Focused conversational tutor view without heavy dashboard clutter:
     - Sleek, compact brand mark (50px) and clean student greeting ("مرحباً بك يا [اسم الطالب] في EGS AI").
     - **Centered Subject Selector Rail (`.subject-pills-bar`):** Compact horizontal scroll chips for the student's enrolled grade with safe RTL start-alignment on mobile preventing first-item clipping.
     - **Centered AI Assistant Composer Dock (`renderInputForm(true)`):** Prominently placed with dynamic single-row swipeable subject prompt sparks, auto-growing textarea, direct in-site camera capture button (`CameraCaptureModal`), and image upload button with crop/brush editor.
     - **Quick Tasks Link Pill (`.chat-tasks-quick-pill`):** Subtle, elegant 1-line progress indicator linking directly to the dedicated Tasks page (`"مهام المذاكرة اليومية: N من M مكتملة — عرض المهام ←"`).
   - **Active Chat Stream (`messages.length > 0`):** Clean distraction-free message list with KaTeX math rendering, ThoughtBlock CoT collapsible reasoning steps with 16px icons, upgraded 16px message action buttons (Copy, Notebook bookmark, Report), non-intrusive one-time auto-scroll on message send (automatically scrolls to bottom once upon sending a new message if not already at the bottom, strictly suppressed during AI streaming updates), floating scroll-to-bottom FAB (`.scroll-bottom-fab` with pulse glow and safe-area offset), and ergonomic bottom composer dock with compact mobile disclaimer.
3. **Dedicated Tasks and Study Progress Page (`tasks` tab):**
   - **Header & Reset Notice:** Clean return-to-chat button, page title "مهام المذاكرة والمتابعة الأكاديمية", motivational subtitle, and Cairo-midnight renewal badge (`.tasks-reset-badge`).
   - **3-Card Quick Metric Summary:** Today's Quests Completion (`N من M مكتملة`), Quests Ranking Points earned, and Active Subject Curriculum Mastery percentage.
   - **Daily Quests Tracker:** Interactive quest cards for today's goals (Chat question, Exam simulator, Flashcards review) with live progress bar (`current / target`), merit points pill (`+X نقاط`), 1-click action triggers ("ابدأ هذه المهمة الآن"), and celebratory "استلام المكافأة" claim buttons. Unauthenticated students see an inviting registration card with 1-tap onboarding.
   - **Curriculum Syllabus Mastery & Roadmap:** Enrolled subject switcher pills, subject completion progress meter (% and lessons count), 1-click interactive roadmap modal launcher (`خريطة المنهج`), and next upcoming lessons list with 1-tap "مذاكرة" AI study triggers.
   - **Academic Accelerators:** 1-click launch cards for Smart Exam Simulator, Smart Coach (Flashcards), and Smart Study Notebook.
4. **Composer (Ergonomic Dock) & In-Stream Sparks:** Directly above the input box on the desktop submission screen are dynamic subject-specific prompt sparks (`.composer-prompt-tags-wrapper`, `.composer-prompt-tag`) equipped with `Sparkles` (13px) prefix icons and downward-pointing arrow indicators (12px `↓`) that auto-fill high-yield curriculum prompts into the textarea.
   - **Pristine Conversational Landing State:** When the chat has 0 messages, the interface provides a distraction-free, inviting study hub with the enrolled subject switcher and centered composer front-and-center, eliminating extraneous quiz cards and testing anxiety so students feel completely comfortable asking their questions.
   - **Post-Answer Continuity Sparks ("The Rabbit Hole"):** Contextual action pills rendered below each completed AI explanation (`FormattedChatMessage`) offering 3 high-yield study pathways ("فكرة خادعة تتكرر في الامتحانات", "مسألة مماثلة من الكتب الخارجية", "حفظ أهم قانون في دفتري الذكي") preventing dead-ends and keeping students in flow. Guarded by `!isStreaming` and `!isPaywall` so they only appear after the AI stream finishes rather than rendering prematurely during generation.
   - **In-Chat Daily Quests Circuit Tracker:** Floating circuit bar directly below the composer tracking the 3 daily quest chips (Chat smart question, Booklet test, Notebook flashcard) with completion status and streak protection indicator.
   - **Primary Composer Row & Mobile Distraction-Free Controls:** Auto-grow textarea (16px base font preventing iOS zoom, Enter send / Shift+Enter newline, cap 160px), 40x40px direct camera capture button (`CameraCaptureModal` live in-browser scanner + native mobile camera fallback), 40x40px image attach button with ≤5 MB editor modal, and 40x40px send button. When submitted with an attached image, sends immediately and displays `"تحليل الصورة"` (`image_analysis` search step) while server-side VQA extracts problems and feeds into curriculum RAG + DeepSeek stream. For free accounts with depleted coins, displays a motivational paywall banner above the input dock celebrating their daily progress. Interactive Quiz Cards (`InteractiveQuizCard`) embedded in responses support 1-tap answers, awarding +2 ranking points via `/api/user/quiz-points`.
    - **Mobile Distraction-Free Strip (`.composer-compact-control-bar`):** Replaces cluttered toolbars on mobile devices with a single, sleek, thumb-ergonomic status chip (`.composer-compact-config-pill` showing e.g. `شرح مفصل ▾`) and a 1-tap mini Thinking toggle (`.composer-mini-toggle-pill` with `Brain` icon, locked with `Lock` icon for free accounts), eliminating horizontal overflow, keyboard occlusion, and accidental touches. Tapping the chip launches the **Teacher Settings Bottom Sheet (`renderTeacherConfigSheet`)**, which centralizes Deep Thinking toggle (gated to subscribers with upgrade CTA) and 4 teaching styles into a single clean modal sheet. On desktop (≥769px), retains the streamlined horizontal feature toolbar (`.composer-features-toolbar`). Active chat input dock eliminates redundant subject/grade pills and suppresses disclaimers on mobile, maximizing visible conversation area above the 62px bottom nav.
5. **Exams:** creator modal (dual mode: "اختيار من المنهج" with modern student-friendly picker supporting 1-click whole-curriculum selection, instant search, lightweight unit accordions with 1-tap whole-unit selection, streamlined lesson rows with concept subtitles, and docked scope summary; "موضوع مخصص" for custom topics; modes auto/total_only ≤15/custom_types MCQ+TF+essay counts); grid of available exams + submission history (score colors: ≥80 green, ≥50 orange, else red; mobile responsive single-column layout); taking view (all questions required before submit; **no timer exists**; on mobile includes sticky bottom action dock `.exam-taking-sticky-bar` with answered question progress and instant submission CTA; bottom navigation automatically hides during active exam answering for full immersion); results view (conic-gradient score ring, AI evaluation as markdown, per-question corrections from `questions_review`). Submissions never block zero-coin students: deterministic automated scoring grades answers, saves the attempt, awards merit points, and provides encouraging feedback without 402 rejection.
6. **Flashcards (المدرب الذكي):** Dual-view study system with "جميع الكروت" (All Cards Grid/List view displaying all pooled cards with rendered LaTeX math for question/answer, answer reveal toggles, deck filter pills, real-time Leitner box level progression [صندوق 1..5] with immediate visual rating button selection highlighting, save confirmation [✓ تم الحفظ], and no phantom stack advancement) and "مراجعة تفاعلية" (3D interactive focus flip stack with rendered LaTeX math, progress bar, Leitner 1-5 recall assessment buttons embedded directly on the back face of the card [.flashcard-back] with color-coded grades [1 صعب جداً .. 5 ممتاز], instant save confirmation, and automatic card dealing/slide-off progression to the next card, with return-to-question toggle, skip option, edit/delete controls, and summary completion screen with genuine random deck shuffling [RotateCcw]), inline card edit/delete, deck rename/delete, and AI + Manual creation modal (featuring the same streamlined student-friendly Unit & Lesson Picker with whole-curriculum, whole-unit, and specific lesson selection with live search and concept subtitles for AI card generation; container styled with `.mobile-main-with-nav` for safe bottom clearance).
7. **Leaderboard & Competition (المسابقة ولوحة المتصدرين):** Ordered strictly by `points DESC` (`"نقاط الترتيب"`) and capped to the **Top 10** students.
   - **Out-of-Top-10 Student Ranking Banner (`.user-current-rank-card`):** If the logged-in student is ranked outside the Top 10 (or has rank > 10), renders a prominent glowing card at the very top of the page displaying their exact overall rank (`#N`), name, "أنت" tag, grade level, points, streak, points gap required to reach the 10th spot, and an instant exam action button (`زيادة نقاطي بالامتحانات`).
   - **Universal Top 3 Podium (`.leaderboard-podium-container`):** Rendered on both Desktop and Mobile with Gold 1st center elevated with Crown, Silver 2nd, and Bronze 3rd with individual glowing border badges, student name, grade name, points with Trophy, and streak counter.
   - **Ranks 4-10 Listing:** Displayed as a clean glass table on desktop (Rank, Name, Grade Level, Points, Streak) and compact mobile cards on phones. Container constrained to `maxWidth: 960px` with back-to-chat button and grade/global filters.
8. **Subscriptions & Pricing page (`subscriptions` tab):**
   - **Primary Navigation via Mobile Bottom Nav & Desktop Header:** Anchored directly at the student's thumb as tab #2 in the 5-tab Mobile Bottom Navigation bar (`الاشتراك` with `CreditCard` icon), and in the desktop top header for unsubscribed users (`.header-sub-btn`).
   - **For active subscribers:** Renders the **Active Subscription Dashboard** showing the active plan name (1 Month / 2 Months / 3 Months), start date, expiration date, remaining days counter, daily coins allowance (80/90/120), policy notice stating renewal unlocks upon period completion, and direct return-to-chat button. Blocks checkout redirection and duplicate plan selection.
   - **For unsubscribed users (Asymmetric Decoy Choice Architecture):** 3 plan cards with the **3-Month Term Plan as the prominent Hero Tier**:
     * **Plan 1 (Starter — `pro_1m`):** 60 EGP / 80 daily coins / 30 days (2.0 EGP/day, badge: "الباقة التمهيدية").
     * **Plan 2 (Decoy — `pro_2m`):** 110 EGP / 90 daily coins / 60 days (1.83 EGP/day, badge: "الباقة المرنة").
     * **Plan 3 (Hero Tier — `pro_3m`):** 140 EGP / 120 daily coins / 90 days (1.5 EGP/day, badge: "خيار 85% من الطلاب المتفوقين — باقة الترم الكامل", glowing card styling `.pricing-hero-card`, gold accent, maximum daily quota, streak shield, and highest term savings).
     * Kashier payment gateway information card (Visa, Mastercard, Meeza, Vodafone Cash, Orange Cash, Etisalat Cash, WE Pay, Instapay), 3-day refund policy alert (requires 0 points consumed), current points balance card, and support banner.
9. **Profile:** name edit, grade select (clears chat), password change (real emailed OTP, 10-min expiry), **Privacy & AI Improvement Card (`المساعدة في تحسين استجابات الذكاء الاصطناعي`):** Allows students to control AI response quality sharing. Includes an iOS-style tactile toggle switch, status badge (`مفعل (Opted-in)` vs `معطل (Opted-out)`), dedicated in-card confirmation feedback (`privacyCardMessage`), and clear Arabic explanation stating conversations are used to improve AI response quality with complete freedom to opt in or out at any time. Default setting is "Enabled" (`improve_ai_opt_in: true`). Employs resilient multi-tier persistence (direct `profiles.improve_ai_opt_in` column update with automated fallback to `system_settings` key-value store and in-memory caching), optimistic state updates with rollback on network failure, **Connected Devices Management Card** (displays `N / 3 أجهزة` badge, device list with device-type icons, last active timestamps, remote device logout buttons, and bulk logout for other devices), account deletion danger zone (links to `/delete-account`), and subscription management status card.
10. **Dedicated Application Download & Install Page (`/download`):** Standalone page with device and standalone mode auto-detection, platform switcher tabs (Android, iOS, Desktop), interactive 1-click PWA install triggers, Safari iOS step-by-step visual guidance, Chrome/Edge desktop install directions, and FAQ accordion.
11. **Account Deletion page (`/delete-account`):** Dedicated standalone public page for permanent account removal via email OTP verification. Clearly warns of irreversible deletion, subscription cancellation, and immediate data purge.
12. **Admin:** see section 15.
13. **Mobile bottom nav (5 thumb-reachable tabs):** الدردشة (Chat with `MessageSquare` icon), **الاشتراك** (Subscription with `CreditCard` icon, direct 1-tap route to `subscriptions`), الامتحانات (Exams), المدرب (Smart Coach), حسابي (Profile). 62px + safe-area insets, `backdrop-filter: blur(24px)`, active scale-down (`:active { transform: scale(0.92); }`), and top active pill indicator. All tabs employ `.mobile-main-with-nav` with `calc(84px + env(safe-area-inset-bottom, 0px))` bottom padding so content scrolls completely clear above the bar. Tasks remains accessible via the sidebar navigation drawer and in-chat study hub progress links.
14. **Universal Modal & Sheet Pickers:** `renderSubjectSheet` (subject + grade picker), `renderModeSheet` (detailed explanation vs socratic scaffolding vs quick summary capsules), `renderTeacherConfigSheet` (teaching modes + subscriber-gated Deep Thinking toggle), `renderUpgradeSheet` (instant plan selection with WhatsApp parent sponsorship forwarding in Academic Progress Report format, Egyptian e-wallets, InstaPay, Meeza, Visa/Mastercard, and 3-day refund guarantee; returns `null` for active subscribers).
15. **App Tour System (Interactive Guided Walkthrough, Mobile Keyboard Adaptation & Streaming Isolation):** Lightweight, zero-dependency, RTL-native guided tour engine (`AppTour.tsx`) featuring a 4-panel surround cutout backdrop architecture that leaves spotlighted elements 100% uncovered, crystal clear, unblurred, and directly clickable (framed with an animated glowing focus ring `.tour-spotlight-ring`), target auto-scroll into view, and dynamic positioning. **Introductory Platform Walkthrough on First Access:** Triggers automatically upon first access to the platform chat screen (`!localStorage.getItem('egs_tour_completed_chat')`). Streamlined into a 3-step essential tour: platform welcome, subject selection, and intelligent composer dock with reasoning controls (the standalone privacy/AI improvement card instruction step was removed from the initial tour while preserving full user control via the profile settings card). Features mobile virtual keyboard adaptation via real-time `window.visualViewport` tracking (`resize` and `scroll` listeners) to keep the docked annotation card perfectly visible above software keyboards with non-blocking overlay panels (`pointer-events: none` on dark backdrops, `pointer-events: auto` exclusively on spotlight and card). Course selection (Step 1) includes an always-active fallback 'المتابعة للخطوة التالية' button in the card so students never experience UI freezing if DOM clicks lag. To ensure unobstructed AI interaction, the tour automatically force-closes immediately upon message submission before SSE streaming begins, displaying the typewriter stream with zero blackout. Strictly isolates the tutorial lifecycle from all application popups and sheets: automatically force-closes all open modals, dropdowns, and drawers upon tour launch; suppresses all bottom sheets, PWA install banners, mobile bottom nav tabs, and auth/modal overlays while `isTourOpen` is active; and queues deferred popups (`pendingDeferredPopup`) to display safely and sequentially only after the tutorial has fully concluded. Includes per-screen localStorage persistence (`egs_tour_completed_{screen}`), automatic triggers upon first-time onboarding completion, skippable actions at every step, and top header/sidebar replay shortcuts.
16. **Dedicated Parent Sponsorship Portal (`/sponsor` & `/pay`):** Standalone public landing page tailored for parents. Wrapped in `.standalone-page-scroll` with back navigation to the platform. Fetches safe public student metadata via `/api/payment/sponsor-info`, presents the **Parent Cost Comparison Card** contrasting private lessons (~2,400 to 4,500 EGP/term) against EGS AI 3-Month Plan (140 EGP total, saving 94%+), defaults to the Hero Tier (3m: 140 EGP at 1.5 EGP/day), and initializes official Kashier checkout via `/api/payment/kashier/initialize-sponsor` supporting mobile wallets (Vodafone Cash, Orange, Etisalat, WE Pay), InstaPay, Meeza cards, and Visa/Mastercard with 72-hour refund guarantee.

### 12.4 localStorage keys
`egs_theme`, `egs_token`, `egs_user` (JSON, coins kept in sync), `egs_device_id`, `egs_browser_id`, `egs_dismissed_notifications`, `egs_registered_before`, `egs_chat_mode`, `egs_pwa_banner_dismissed`, `egs_tour_completed_{screen}`, `egs_just_registered`. No sessionStorage.

### 12.5 SSE consumption & Search/Reasoning Accordions
`fetch` → `res.body.getReader()` → line-buffered `data:` JSON parse. Placeholder AI message with `isThinking:true`; 1 s timer increments thought duration; `done` updates coins, points, session id; handles `error` event by displaying visible error message bubbles in chat.
- **Search & Reasoning Steps Accordions (`SearchStepsPanel` & `ThoughtBlock`):** Both the RAG search steps panel and the Deep Thinking / reasoning thought process are hidden (collapsed) by default in the chat interface. Each renders a compact, responsive status card with real-time indicators (spinning loader/brain icons, live timer/search stage) and an interactive `'عرض'` ('View') / `'إخفاء'` ('Hide') toggle button. Detailed search steps or chain-of-thought analysis only expand into view when the student explicitly clicks `'عرض'`.

### 12.6 Progressive Web App (PWA) Architecture & Smart Device Detection
- **Detection Matrix:**
  - **Standalone Mode (`isStandalone`):** Checks `window.matchMedia('(display-mode: standalone)').matches`, `navigator.standalone === true` (iOS Safari standalone), and Android TWA referrer (`document.referrer.includes('android-app://')`). When true, all download prompts and home screen install banners are completely suppressed across the app, and `/download` displays an informative "Already Installed" badge.
  - **Device Type (`isMobileDevice`):** Differentiates between mobile touch devices (phones/tablets via User Agent and touch capabilities) and desktop computers.
- **Adaptive Install Surfaces:**
  - **Mobile Browsers:** Non-intrusive install banner displayed on the home study hub with 1-click install action (`deferredPrompt.prompt()`), dismiss action with localStorage memory (`egs_pwa_banner_dismissed`), and iOS Safari step-by-step modal guide.
### 12.7 Student Experience (SX) Enhancements
- **Native Voice Message Recording & Audio Bubble Player:** The microphone action operates as a native voice recording station (`.composer-voice-rec-row`) directly inside the composer dock, equipped with an animated pulsing indicator (red during recording, amber when paused), live soundwave equalizer bars, duration timer, Delete button (`Trash2`), Pause and Resume recording controls, Playback Preview button (`previewAudioUrl` allowing students to listen to their voice before sending), and a prominent "إرسال الصوت" (Send Audio) trigger (all legacy references to "إتمام التحويل" removed). Voice messages can be sent alongside attached camera/gallery images (`pendingImage`). Upon submission, audio is transcribed via Alibaba Cloud DashScope `qwen-audio-3.0-asr-flash-filetrans` (`/api/chat/transcribe`) and dispatched to the chat stream. The student's message renders as an interactive **Audio Message Bubble (`AudioMessageBubble`)** with circular HTML5 Play/Pause playback, animated waveform progress tracking, duration display, and an expandable "عرض النص المفرّغ" (View transcript) drawer. Parameterized MIME types (e.g. `audio/webm;codecs=opus`) are robustly supported via non-greedy regex matching `/\[?VOICE_MESSAGE:duration=([0-9.]+);mime=([\s\S]*?);audio=([\s\S]*?)\]([\s\S]*)/`, and session titles are systematically sanitized across backend routes (`/api/chat`, `/api/chat/sessions`, `/api/chat/history`) and frontend components via `formatSessionTitle`, eliminating garbled characters or raw base64 strings in conversation headers, sidebar lists, and customer service transcripts. The AI system prompt in `deepseek.ts` explicitly recognizes the input as an authentic spoken voice note and handles inquiries regarding voice messaging capabilities via `isVoiceCapabilityInquiry`.
- **Decluttered Responsive Composer Dock:** On mobile screens ($\le 768\text{px}$), accessory actions (Camera, Image upload, Math Keypad) are cleanly unified under an expandable `+` launcher button (`.composer-tools-btn`), opening a sleek animated auxiliary tools tray (`.composer-tools-tray`). This eliminates crowded horizontal layouts on mobile devices, expanding typing textarea width from ~90px to over 220px on 360px–480px screens.
- **STEM Math & Scientific Calculator Keypad with Visual Format & Live Formula Preview:** Replaced the legacy flat symbol strip with a comprehensive, tactile calculator panel (`.math-calc-panel`) featuring 4 category tabs:
  - **حاسبة أساسية (Basic Calculator):** $+$, $-$, $\times$, $\div$, $=$, $\neq$, $\pm$, $\sqrt{x}$, $\sqrt[3]{x}$, $x^2$, $x^3$, $x^y$, $\frac{a}{b}$, $( )$, $|x|$, $\%$, $\approx$, $\le$, $\ge$, $\infty$.
  - **منهج مصري (Egyptian Curriculum):** س, ص, ع, ن, د, س², ص², $\frac{\text{س}}{\text{ص}}$, $\sqrt{\text{س}}$, جا, جتا, ظا, ظتا, قا, قتا, نها, لو, ط (π), نق, ن ق ر, ن ل ر, °.
  - **English STEM:** $x, y, z, t, n, \sin, \cos, \tan, \log, \ln, \lim, \sum, \int, \pi, \theta, e, i, \Delta$.
  - **رموز متقدمة (Advanced / Science):** $\alpha, \beta, \gamma, \lambda, \Omega, \mu, \rho, \rightarrow, \rightleftharpoons, ^\circ\text{C}, \Delta H, \cdot, \Leftarrow, \Rightarrow, \in, \notin, \subset, \cup, \cap$.
  Eliminates cryptic raw LaTeX/Markdown code dumps (`\sqrt{}`, `^{}`, `\times `, `\frac{}{}`, `\le `, etc.) from the input box, directly inserting student-friendly visual Unicode mathematical representations (`√( )`, `∛( )`, `²`, `³`, `^( )`, `×`, `÷`, `≠`, `±`, `≤`, `≥`, `س²`, `√س`, `س/ص`, etc.). Features contextual intelligence: smart text-selection wrapping (e.g. highlighting `16` and tapping `√x` yields `√(16)`), smart exponent attachment (typing `5` or `x` and clicking `x²` yields `5²` or `x²`; clicking with empty input yields `x²`), and intuitive bracket cursor placement. Coupled with a **Live Mathematical Formula Preview Strip (`.composer-math-preview`)** directly above the composer input that continuously renders equations in KaTeX typography with high contrast, and automatic rendering of student chat bubbles with `renderFormattedMath`.
- **English Word-to-Speech & Pronunciation (Text-to-Speech):** Zero-latency, browser-native speech synthesis (`window.speechSynthesis`, `speech_helpers.ts`) strictly on-demand (never auto-triggered or randomly spoken after sending a message). Incorporates active cancellation via `stopSpeech()` on message submission, session navigation, and subject switching to prevent queued utterance playback. Features granular, student-facing playback controls strictly gated to English-language content:
  - **Strict English Content Gating (`isEnglishSpeechEligible`):** Pronunciation controls (message action pill, listening passage triggers, and flashcard audio badges) evaluate readable content after completely stripping protocol tags (`[QUIZ_QUESTION]`, `[CREATE_EXAM]`), LaTeX formulas (`$$...$$`, `$...$`), and code fences. The controls strictly appear only when English constitutes the dominant readable language (>= 65% Latin characters, minimum length), preventing false-positive displays on Arabic explanations containing units (`km/h`), acronyms (`ATP`), or protocol markup.
  - **Symbol Vocalization Suppression (`sanitizeEnglishForSpeech`):** Thoroughly strips non-spoken and structural symbols before synthesis so the browser TTS engine never vocalizes punctuation characters as words. Slashes (`/`, `\`), hyphens/dashes (`-`, `–`, `—`, `−`), parentheses/brackets (`()`, `[]`, `{}`, `<>`, `«»`), math operators (`+`, `=`, `~`, etc.), and quotation marks are removed or replaced with natural spacing/pauses, while preserving valid English contraction apostrophes (`don't`, `it's`).
  - **Inline Vocabulary Audio Badges:** Bold English vocabulary words (`**Word**` / `***Word***`) in AI explanations render with an inline, stylish pronunciation pill button (`<Volume2 />` / `<VolumeX />` + "نطق") in Vivid Cyan (`#00B4D8`) with amber active glow.
  - **Listening Passage Cards:** Structured English blockquotes and `[LISTEN_PASSAGE]` tags render as prominent listening comprehension cards with a `<Headphones />` badge, crisp English typography (`fontFamily: var(--font-english)`), and a dedicated 36px "استمع للمقطع" / "إيقاف الاستماع" audio trigger.
  - **Sentence & List Item Speech:** English bullet points and sentences feature individual on-demand speech triggers (`<Volume2 />` + "استماع") strictly when the sentence text is verified English.
  - **Message-Level High-Visibility Pill:** AI chat message bubbles provide an upgraded 36px high-contrast pill button (`minHeight: 36px`, `borderRadius: 9999px`) beneath verified English responses for complete passage listening. Also available on front and back faces of English flashcards when the specific face contains English text.
- **Exam Simulator Overhauls:**
  - **Question Navigation Matrix (`.exam-nav-matrix`):** Interactive numbered badge grid with real-time color indicators for answered, unanswered, and flagged questions, with smooth scrolling to question cards.
  - **Star Flagging:** Students can flag questions for later review (`flaggedExamQuestions`).
  - **Flexible Submission & Confirmation Modal (`showUnansweredConfirmModal`):** Submit buttons are never disabled; clicking submit with unanswered questions triggers an informative confirmation modal allowing students to review skipped items or submit immediately.
  - **1-Click Remedial Practice Quiz Generator:** Evaluated exams with unmastered diagnostic concepts feature an instant 1-click button generating a targeted 3-question remedial practice exam (`mode: 'remedial'`) to reinforce struggling concepts.
- **Smart Study Notebook Upgrades:**
  - **Live Search & Category Filtering:** Instant search input (`notebookSearchQuery`) and category chips (`notebookCategoryFilter`) across all saved notes (formulas, definitions, solutions).
  - **Printable A4 Cheat-Sheet Export:** 1-click print button (`window.print()`) coupled with dedicated print stylesheets (`@media print`) that strip all application chrome and format saved formulas and notes into an elegant, high-contrast A4 summary sheet.
  - **Multi-Tier Permanent Persistence & Local Cache:** Backed by Node.js runtime (`/api/user/study-notebook`) with atomic asynchronous disk flushing (`db_data.json`) and resilient Supabase retries. Client initializes synchronously from `localStorage` (`egs_study_notebook`) for zero-latency availability across reloads and offline scenarios.
  - **Synchronized Bidirectional Chat Bookmark Toggle:** Chat message action buttons (`Bookmark` / `BookmarkCheck`) dynamically reflect saved status via `isMessageBookmarked` matching against `notebookItems` by `message_id` and content hash. Tapping a saved note toggles it off via `handleDeleteNote`, preventing duplicates.
- **Parent WhatsApp Progress Share:** 1-click export button formatting student academic achievements (quest completion, study streak, ranking points, and curriculum mastery) into a polite Arabic WhatsApp message for parents.
- **Stream Retry Action:** Integrated retry button (`<RotateCcw />`) on interrupted or errored message bubbles to resend failed queries with a single tap.
- **In-Chat Educational Font Sizer:** Interactive header toggle (`<Type />`) allowing students to cycle chat font sizing between normal (`0.94rem`), large (`1.08rem`), and extra-large (`1.22rem`).
- **Streak Protection Shields:** Default 1 streak protection shield in `profiles` (`streak_shields`), consumed automatically in `checkAndResetDailyCoins` when a student misses 1 day, preserving their active study streak.

---

## 13. Theming and Design System

Brand identity: **Educational Tech Palette — Neon Amber/Yellow CTA, Deep Tech Blue, Medium Slate Blue, Snow Grey, Vivid Cyan, and Digital Violet**, Arabic-first typography with **Tajawal / Cairo / Readex Pro**, tactile layered buttons, glassmorphic surfaces, and zero emojis in UI chrome (Lucide icons on web). Designed to maximize focus, contrast, and visual clarity for students.

### 13.1 Brand colors & Component Color Mapping Guide

#### Light Mode Palette & Component Distribution
* **Main Background (`#F8F9FA`):** App body, central chat canvas, and global layout wrapper.
* **Sidebar Background (`#EFF3F6`):** Soft cool grayish-blue sidebar surface providing subtle contrast with the main content area.
* **Card & Content Background (`#FFFFFF`):** Lesson cards, prompt dock container, modal sheets, and header bar.
* **Headings & Body Text (`#0D1B2A`):** Primary headings (`h1`–`h6`), subject titles, action card titles, table headers, and body copy.
* **Platform Primary Color (`#00B4D8` / Sky Blue):** Primary color of the platform for all chrome, active links, nav items, icons, borders, avatars, chips, and tech highlights.
  - **Logo & AI Avatar Frames:** Pastel cyan / blue surface (`#E1F6FB`), `1.5px solid #00B4D8` border, and soft glow (`.brand-logo-frame`, `.message-avatar-ai`).
  - **Sidebar Active Nav Item:** Pastel cyan surface (`#E1F6FB`), `1.5px solid #00B4D8` border, and `#00B4D8` text and icon. Inactive items use `#0D1B2A` text and `#0D1B2A` icons.
  - **Selected Subject Card:** Pastel cyan surface (`#E1F6FB`), `2px solid #00B4D8` border, and a solid filled `#00B4D8` icon container with a pure white icon inside.
  - **Quick Study Feature Cards & Prompt Tags:** `#FFFFFF` card surface in light mode (`#1E2E3D` in dark mode), `#0D1B2A` title, pastel icon containers with Vivid Cyan `#00B4D8` and Digital Violet `#7209B7` badges, and dedicated action CTAs with outward-pointing arrows (`←`) for wide cards, alongside tactile prompt pills (`.composer-prompt-tag`) directly above the composer text box.
  - **Header Subscriptions Button:** Pastel cyan surface (`#E1F6FB`), `1px solid #00B4D8` border, and `#00B4D8` text and card icon.
* **Platform Secondary Color (`#FFB703` / Yellow):** Dedicated secondary color used exclusively for action/CTA buttons (`.btn-primary`), button highlights, and alert indicators.
* **Button Text (on Yellow CTA) (`#0D1B2A`):** High-contrast Deep Blue text and icons on primary yellow CTA buttons.
* **Low-Coin Balance Alert (`#EF4444`):** Soft coral pill (`#FDE8E8` background, `rgba(239, 68, 68, 0.35)` border, and `#EF4444` text and icon).
* **Logo Branding:** Dual-tone / cyan-to-violet gradient (`#00B4D8` to `#7209B7`) for "EGS AI".

#### Dark Mode Palette
* **Main Background:** `#0D1B2A` (Deep Tech Blue) — app body, page background, and sidebar wrapper.
* **Card & Content Background:** `#1E2E3D` (Medium Slate Blue) — card surfaces, prompt input container, modal dialogs, and secondary buttons.
* **Headings & Body Text:** `#F8F9FA` (Snow Gray) — primary titles, section headings, body text, and table content.
* **Call to Action (CTA) & Alerts:** `#FFB703` (Neon Amber / Yellow) — primary CTA buttons, alerts, and notice indicators.
* **Button Text (on Yellow CTA):** `#0D1B2A` (Deep Blue Text) — high-contrast text and icons on primary yellow CTA buttons.
* **Tech Accents & Gradients:** `#7209B7` (Digital Violet) — border glow on hero card, focus rings, AI mode pill highlights (`تفكير عميق`), and digital gradients.

### 13.2 Typography
- **Primary Arabic Font:** `Tajawal`, `Cairo`, `Readex Pro` — modern, highly legible geometric Arabic typography.
- **Latin, Math & Code Font:** `Outfit`, KaTeX.

### 13.3 Tactile Button System
- `.btn-primary`: Action/CTA button background (`#FFB703` / `--btn-primary-bg`), Deep Blue text (`#0D1B2A`), hover lift `-1px` with expanded glow `0 6px 20px rgba(255, 183, 3, 0.45)`, active spring scale `0.97`. In Light Mode, yellow serves as the dedicated secondary color for buttons, while sky blue (`#00B4D8`) acts as the platform primary color.
- `.btn-secondary`: Light Mode `#FFFFFF` with `1.5px solid rgba(13,27,42,0.12)` border; Dark Mode `#1E2E3D` with `1.5px solid rgba(248,249,250,0.15)` border, active scale `0.97`.

### 13.4 Web dark tokens (`:root, html[data-theme='dark']` in globals.css)
bg `#0D1B2A`, elevated `#1E2E3D`, sidebar `#0D1B2A`, header `#0D1B2A`, card `#1E2E3D`, card-hover `#26384A`, input `#1E2E3D`; text `#F8F9FA` / `#C5D1DE` / muted `#8899A6`; primary `#FFB703`, text-on-primary `#0D1B2A`, secondary (accent) `#7209B7`, btn-primary-bg `#FFB703`, info `#00B4D8`, send-btn `linear-gradient(135deg, #00B4D8 0%, #7209B7 100%)`.

### 13.5 Web light tokens (`html[data-theme='light']`)
bg `#F8F9FA`, elevated `#FFFFFF`, sidebar `#EFF3F6`, header `#FFFFFF`, card `#FFFFFF`, card-hover `#F8F9FA`, input `#FFFFFF`; text `#0D1B2A` / `#2A3B4C` / muted `#5C6F84`; primary (platform) `#00B4D8`, secondary (buttons) `#FFB703`, btn-primary-bg `#FFB703`, text-on-primary `#FFFFFF`, icon & active links `#00B4D8`, info `#00B4D8`, send-btn `#00B4D8`.

### 13.6 Score colors
≥80 green (ممتاز جداً), ≥50 orange (جيد — يحتاج تحسين), <50 red (ضعيف).

---

## 14. Responsive Design Requirements

These are hard product requirements (see `CODING_GUIDELINES.md` rule 2):

**Web** must render correctly with no missing/cut elements on all screen sizes:
- Breakpoints: `max-width: 768px` (mobile viewport: 62px bottom nav with active pill & scale-down feedback, overlay sidebar, 16px input font to prevent iOS auto-zoom, scrollable tables/pre/math, swipeable `.composer-features-toolbar` with gradient edge masks, compact Study Hub with horizontal swipeable subject rail, Top 3 Podium + mobile leaderboard ranking cards, sticky exam taking action dock, single-column exams grid), `480px`, `360px` (ultra-compact mobile rules with scaled-down text and badges), `hover:none` (drop hover lifts), `prefers-reduced-motion`.
- JS `isMobile = window.innerWidth < 768` gates conditional rendering and modal sheet interactions.
- Safe-area insets: Both `env(safe-area-inset-top)` on the responsive `<header class="header-responsive">` (height `calc(58px + env(safe-area-inset-top, 0px))` on mobile) and `env(safe-area-inset-bottom)` on bottom nav, composer, sheets, and sticky exam bar; `100dvh` body.
- Mobile Top Bar Layout Optimization: Deduplicates and organizes controls on mobile screens (<768px) to prevent horizontal overcrowding while keeping essential educational features immediately discoverable. Retains drawer toggle + subject capsule (max-width 130px with ellipsis truncation) on the right; left cluster displays compact Coins (14px icon) + Points (14px icon) status pill alongside compact touch targets for Notebook, Notifications, and Theme toggle. Redundant Subscriptions CTA, Tasks pill, and Profile avatar are hidden from the mobile header to prevent clutter, as Subscriptions is directly elevated into the 5-tab Mobile Bottom Navigation bar at the student's thumb (Chat, Subscriptions [الاشتراك], Exams, Smart Coach, Profile).
- Icon Visibility & Touch Ergonomics: All interactive controls satisfy minimum touch targets ≥38px-48px with clear visual icons:
  - Header icon buttons: 38px x 38px with 17px-20px icons.
  - Composer image attach & send buttons: 42px x 42px on mobile with 18px-19px icons.
  - Composer feature pills: 36px min-height with 15px icons.
  - Message bubble action pills: 36px min-height with 16px icons (Copy, Notebook bookmark, Report).
  - ThoughtBlock reasoning: 16px Brain icon, 15px Chevron.
  - SearchStepsPanel: 16px search step icons, 15px Chevron.
  - ImageEditorModal tools: 38px min-height with 16px tool icons.
  - Subject Selector Bar: Styled with `justifyContent: flex-start` on mobile to ensure all subject pills can be scrolled to without first-item clipping in RTL.
  - Prompt Sparks Rail: `.composer-prompt-tags-wrapper` rendered as a sleek single-row horizontally swipeable rail on mobile instead of stacking in multiple rows.
- Smart Floating Scroll-to-Bottom Button & Non-Intrusive Auto-Scroll: `.scroll-bottom-fab` floats cleanly above the composer dock (`bottom: calc(145px + env(safe-area-inset-bottom, 0px))` on mobile), showing only when scrolled up (>160px from bottom), with pulse animation when generating new answers. Complementing the manual FAB, `autoScrollChatToBottom` automatically and smoothly scrolls to the bottom once immediately upon sending a message (only if `distanceFromBottom > 10px`); if the student is already at the bottom or content fits without scrollbar, auto-scroll is skipped to avoid jitter, and it is strictly suppressed across all AI response streaming updates.
- Mobile Full-Width AI Response Box Ergonomics: On mobile viewports (<768px), AI message bubbles (`.message-row-ai`, `.message-bubble-ai`) expand to 100% full width with symmetric 10px outer margins matching the bottom composer dock. Suppresses the side avatar (`.message-row-ai .message-avatar { display: none !important; }`), sets `.message-content-ai` to 100% width with `align-items: stretch`, and gives the bubble a uniform 16px border-radius, completely eliminating left-side offset bias and the empty right gutter for maximal reading comfort and full utilization of narrow phone displays. Desktop viewports (≥769px) retain the full avatar row layout without regression.
- Depleted coin / rate-limit flow: Automatically triggers psychological paywall card (`MotivationalPaywallCard`) and mobile slide-up sheet (`renderUpgradeSheet`) highlighting student achievement, Kashier e-wallet options (Vodafone Cash, InstaPay, Meeza, Visa/Mastercard), and 3-day money-back guarantee.

---

## 15. Admin Panel

Web only (`activeTab==='admin'`, `role==='admin'`). Seven primary organized sections:
1. **Overview & Analytics (الإحصائيات والتحليلات المتقدمة):** Complete real-time financial and academic performance dashboard:
   - **Key Metric KPIs:** Total Registered Students, Active Paid Subscribers (with Crown badge), Free Plan Students (with conversion potential), Total Revenue in EGP (computed directly from successful transactions), Active Students Today (past 24h), Total Completed Exams, Total AI Messages Exchanged, **Total Flashcards Created** (with deck counts and today's creation count), and **PWA App Adoption** (total installed students count, adoption percentage of student body, platform split across Android and iOS).
   - **Visual Free vs Subscribed Ratio Bar:** Segmented gradient progress bar displaying live percentage split and platform conversion rate.
   - **Plan Distribution Breakdown:** Cards detailing active subscriptions across `pro_1m` (30 days / 60 EGP / 80 coins), `pro_2m` (60 days / 110 EGP / 90 coins), `pro_3m` (90 days / 140 EGP / 120 coins), and Expired Subscriptions requiring renewal.
   - **Academic Engagement Cards:** Grade level distribution progress bars, most active student profile, and most active grade level.
   - **Flashcards Creation Analytics Section (إحصائيات إنشاء بطاقات الاستذكار):** Dedicated analytics module featuring 4 summary metric chips (Total Decks Created, Total Flashcards Saved, Average Cards per Deck, Decks Created Today in Cairo Time), alongside visual distribution progress bars breaking down flashcards creation by academic subject and grade level.
   - **PWA Adoption & Installation Analytics Section (إحصائيات تطبيق الويب التقدمي PWA وتثبيتات الطلاب):** Dedicated module featuring 4 summary metric chips (Total PWA Students, Adoption Rate %, Android Installs, iOS Installs), visual OS platform breakdown progress bars (Android Chrome vs iOS Safari vs Desktop), grade level distribution progress bars, and a **Direct Student Roster** (`pwaUsersList`) identifying exactly who downloaded the PWA (student name, grade badge, email/phone, OS platform badge, installation timestamp) with a 1-click shortcut to inspect their dossier directly in the Students Directory.
   - **Performance:** Backed by 30-second in-memory server cache with automatic invalidation upon subscription updates.
2. **Students & Subscriptions Directory (الطلاب والاشتراكات):** Dedicated master-detail student management directory:
   - **Segmented Filter Pills:** Real-time counters and filter tabs for `الكل` (All), `المشتركون` (Subscribers with gold crown), `الطلاب المجانيون` (Free), `الاشتراكات المنتهية` (Expired), and `مستخدمو PWA` (PWA app users with cyan smartphone icon).
   - **Search, Stage & Privacy Filters:** Instant text search across name, phone, email, coupled with grade-level dropdown filter (`1_middle`, `2_middle`, `3_middle`, `1_high`, `2_high`), and the **AI Privacy Opt-In Filter** (`adminStudentOptInFilter`: All, Opted-in, Opted-out).
   - **Live Academic Activity Counters & Privacy Badges:** Student cards and dossier feature live indicators for total messages sent, **PWA Installation Status (`pwa_installed`, `pwa_platform`, `pwa_installed_at`)**, **AI Privacy Opt-In Status (`improve_ai_opt_in` — `تحسين AI: مفعل` / `تحسين AI: معطل`)**, **AI Interaction Days (`active_chat_days_count` — distinct days student sent messages to the AI in Cairo time)**, **Flashcard Decks & Cards Created (`flashcard_decks_count`, `flashcards_created_count`)**, and exams created/completed.
   - **Excel Export:** One-click CSV export with UTF-8 BOM (`\uFEFF`) ensuring full Arabic character compatibility in Microsoft Excel, including dedicated columns for PWA installation status (`تطبيق PWA مثبت`), platform (`منصة PWA`), install date (`تاريخ تثبيت PWA`), AI active interaction days, and flashcard creation counts.
   - **Flicker-Free Live Directory:** Non-destructive background updates that maintain student list visibility and scroll position without full-page loading spinners.
   - **Detailed Student Dossier:** Name, contact info, grade, track, role badge, status badge (نشط / منتهي / مجمد), AI improvement privacy badge and key metric card (`تحسين AI: مفعل` vs `تحسين AI: معطل (محمي)`), coins balance, merit ranking points, active devices count (x/3), PWA app status badge and metric card, complete academic activity row (Messages, AI Active Days, Flashcards, Exams Created, Exams Completed), and subscription timeline.
   - **Opt-Out Privacy Protection Shield:** When a student opts out of AI response quality improvement (`improve_ai_opt_in === false`), the dossier displays a prominent red Privacy Protection Banner, the action button switches to "المحادثات محجوبة (Opt-out)", and any attempt to view their conversation history strictly renders a Privacy Shield card backed by HTTP 403 Forbidden enforcement on `/api/admin/users/conversations`.
   - **Comprehensive Admin Control Operations (5 Modal Controllers):**
     * **Grant Subscription Modal (`csGrantSubModal`):** Immediate manual activation of 1-month, 2-month, or 3-month plans with custom days, admin notes, daily coin cap allocation, transaction audit record, and targeted congratulatory student notification.
     * **Edit Profile Modal (`csEditProfileModal`):** Instant editing of student name, phone, email, grade level, and Baccalaureate track.
     * **Send Direct Notification Modal (`csDirectNotifModal`):** Sends personalized in-app notifications directly to the student's notification bell.
     * **AI Conversation History Viewer Modal (`csConversationsModalOpen`):** Action 5 button "سجل محادثات الذكاء الاصطناعي" opening a full-featured inspection modal for opted-in students, complete with sessions list, transcript bubbles (student vs smart teacher), subject filters, and keyword search.
     * **Freeze / Unfreeze Account Toggle:** Immediate 1-click ban/unban mechanism setting status to `'suspended'` / `'inactive'`.
     * **Coins Management Panel:** Recalculate daily coins to plan cap, add arbitrary coins (+25, +50, +100, +200 presets or custom amount), and deduct coins.
     * **Subscription Cancellation & Refund:** Evaluates 72-hour and 0-coin-spent refund eligibility with confirmation modal.
     * **Multi-Device Session Reset:** Single-click logout from all connected student devices.
     * **Permanent Account Deletion:** Confirmation modal purging student account and cascades.
3. **Curriculum & Content (المناهج والمحتوى):** Dedicated section for academic curricula:
   - Grade level activation checkboxes.
   - Baccalaureate Specialization Tracks activation toggles (Medicine & Life Sciences, Engineering & CS, Business, Arts & Literature).
   - Curriculum upload with mode switch (File upload vs Placeholder subject without file, with track selector and elective flag for `2_high`).
   - System settings (`website_link`).
   - Curriculum table: inline rename, publish toggle, placeholder badges with file-attachment modal, manual units & lessons index editor modal ("الوحدات والدروس"), full Markdown editor modal ("تعديل المحتوى" backed by pristine `curriculums.content` storage guaranteeing 100% exact markdown fidelity with zero title mutation or lesson loss), dedicated progressive vector embeddings modal ("المتجهات") with live percentage progress bar, failure recovery, and deletion.
   - **Zero-Delay Synchronization:** Any modification (upload, attachment, rename, unit indexing, markdown edits, deletion, or progressive vector embedding batches) triggers immediate `syncCurriculumStateMutation`, bumping `curriculum_version`, clearing both server caches (`cachedCurriculums`, `cachedPublicConfig`, `structureCache`), auto-appending new curriculum IDs to `active_curriculum_ids`, and dispatching cross-tab `BroadcastChannel('egs_curriculum_sync')` events so that newly uploaded curricula, modified content, and completed semantic vectors are instantly reflected across student and admin views without reload or delay.
4. **Customer Service & Support (خدمة العملاء والدعم الفني):** Dedicated to student issues and inquiries:
   - **AI Response Complaints (شكاوى ردود الذكاء الاصطناعي):** Displays flagged AI answers and student queries with status filtering (`pending`, `action_taken`, `reviewed`, `dismissed`) and action logging modal.
   - **Technical Support (صفحة الدعم الفني):** Central inbox for messages submitted via `/contact`, category and status filtering, direct communication triggers (Phone `tel:`, WhatsApp `https://wa.me/`, Email `mailto:`), and resolution notes logging modal.
   - Direct navigation card linking to the Students & Subscriptions Directory.
5. **Notifications (الإشعارات):** Broadcast creation (title/body/type/target), activation toggle, deletion.
6. **Reports (البلاغات):** AI and content reports moderation, status filtering, resolution notes.
7. **Versions (إصدارات التطبيق):** Release management, mandatory update flags, release notes.

---

## 16. Deployment and Environments

- **Production Hosting:** Vercel (`web/`). Deployed via `vercel --prod` to `https://www.egsaiedu.com` (`https://web-ndzlkrz8c-sohaib5.vercel.app`).
- **Target:** Next.js on Vercel platform. Build pipeline uses Next.js Turbopack compiler (`next build`).
- Nearly all API routes are configured with Edge Runtime (`runtime = 'edge'`), including chat (`/api/chat`), flashcards (`/api/flashcards/*`), and notebook (`/api/user/study-notebook`).
- Node.js Serverless runtime (`maxDuration = 60`) on Vercel Fluid Compute is strictly reserved for heavy binary/file compilation and batch processing: image analysis (`chat/upload-image`), and curriculum batch processing (`admin/curriculum`, `admin/curriculum/detail`, `admin/curriculum/embed`).
- Local dev: `npm run dev` in `web/` (works without Supabase using `db_data.json`).
- Vercel project link configured in `web/.vercel/`.
- **No CI/CD, no tests on web, no cron jobs** — all periodic behavior (guest coin reset, etc.) is lazy-on-read.

---

## 17. Environment Variables

| Name | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web `db.ts` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | web `db.ts` | Service-role key (bypasses RLS; server only) |
| `JWT_SECRET` | web `auth_helpers.ts` | HMAC session-token secret; prod refuses to run unset |
| `DEEPSEEK_API_KEY` | web `deepseek.ts`, `exams/*` | DeepSeek LLM (server-side only) |
| `ALIBABA_API_KEY` | web `gemini.ts`, scripts | Alibaba Cloud DashScope `text-embedding-v4` (768 dims) |
| `EDENAI_API_KEY` | web `gemini.ts`, `chat/upload-image`, `chat/transcribe` | Gemini chat + embeddings fallback + VQA + STT via EdenAI |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | web `auth/register` | OTP email |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | web google route + GSI button | Google OAuth (hardcoded fallback ID exists in source) |
| `NEXT_PUBLIC_SITE_URL` | layout/sitemap/robots | Canonical URL (fallback `https://egsaiedu.com`) |
| `KASHIER_MERCHANT_ID` | web `kashier.ts`, API routes | Kashier Merchant ID (`MID-47766-857`) |
| `KASHIER_SECURITY_KEY` | web `kashier.ts`, webhook | Kashier Webhook & Callback HMAC Security Key |
| `KASHIER_API_KEY` | web `kashier.ts`, initialize | Kashier Payment API Key (Order Hash calculation) |
| `KASHIER_MODE` | web `kashier.ts` | Kashier Environment Mode (`live` / `test`) |
| `NEXT_PUBLIC_KASHIER_MERCHANT_ID` | web `page.tsx` | Kashier public merchant identifier |
| `NEXT_PUBLIC_KASHIER_MODE` | web `page.tsx` | Kashier client mode (`live`) |

`web/.env.example` documents these environment variables. Never commit real values.

---

## 18. Seed / Default Data

- **SQL default admin:** id `a3e0f065-9856-424d-8dc8-b4b3cf0b89cf`, phone `01147814652`, name `مدير النظام`, role admin, plan max, coins 1000, unlimited_credit.
- **External Testing / Payment Gateway Test Account:** id `f0000000-0000-4000-a000-000000000001`, email `test@egsaiedu.com`, password `TestAccount2026!`, phone `01000000000`, name `حساب اختباري (Test Account)`, grade `1_high`, role `admin`, plan `max`, `unlimited_credit: true`, `coins: 10000`. Present in production Supabase database and `db_data.json`.
- **Content Creator Showcase & Review Account:** id `c0000000-0000-4000-a000-000000000002`, email `creator@egsaiedu.com`, password `EgsCreator2026`, phone `01000000088`, name `صانع محتوى (حساب تجريبي)`, grade `1_high`, role `student`, plan `pro_3m`, `subscription_status: 'active'`, `unlimited_credit: true`, `coins: 10000`, `points: 50`, `study_streak: 5`. Fully unlocked for filming, deep thinking reasoning mode, image OCR problem solving, exam generation, and flashcards. Seed script: `web/supabase_seed_creator_account.sql`. Present in production Supabase database and `db_data.json`.
- **Local-dev seeds (`db_data.json` / `db.ts` init):** admin `admin@egsaiedu.com` (id `admin-id-1234567890`) and test account `test@egsaiedu.com` (id `f0000000-0000-4000-a000-000000000001`).
- `system_settings.website_link = http://localhost:3000`.
- **Uploaded Curricula (28 curricula across 1_middle, 2_middle, 3_middle, 1_high, & 2_high):** All national curricula are populated with structured units and lessons, 768-dim vector embeddings, and active IDs in `system_settings.active_curriculum_ids`.

---

## 19. Known Issues and Technical Debt

(Keep this list current. Fix opportunistically when touching the affected area, per guideline 7.)

**Web:**
1. `console.log("RENDERING APP messages:", ...)` fires every render (page.tsx ~3531) — leaks chat content.
2. SSE `error` events swallowed by the partial-JSON catch.
3. `--card-border` self-referential var in dark mode (code blocks lose their border).
4. Typo "الاصعتاعي" in exam-generation error; two English error strings shown to Arabic users.
5. Admin + exams grids not responsive (section 14); hover-only session delete; `maximumScale:1`.
6. `page.module.css` dead code; guest-messaging plumbing built but guests fully gated (inconsistent product state).
7. Deleted-exam history view fabricates a mock exam with current subject metadata.
8. Native `alert()`/`confirm()` used throughout; no error boundary.

**Backend:**
9. **RESOLVED — Dashboard stats memory scaling risk:** Replaced full-table in-memory chat history load with fast head-count queries, revenue computation from `payment_transactions`, conversion rates, and 30-second in-memory caching (`cachedDashboardStats`, `invalidateDashboardStatsCache`).
10. Dead guest branches in chat route; `gpt-tokenizer` in config but never imported; `countTokens` is a x1.4 word-count approximation.
11. No rate limiting, no middleware.ts, no CORS config anywhere.
12. `[CREATE_EXAM]` chat tag still carries `correct_answer`/`explanation` inline in the stored AI message (protocol-level leak readable in raw chat history); the `/api/exams*` payloads are stripped, but chat-emitted exams need server-side generation to close this fully.
13. **RESOLVED — Elimination of repetitive background requests, unconstrained polling & bandwidth waste:** Eliminated the unconditional 60-second `sessionHeartbeat` background interval and throttled `visibilitychange` to 30 minutes in `page.tsx`. Implemented client-side SWR caching (5-minute freshness window for system config, 3-minute for notifications) with on-demand fetching when the user opens the notification center. Added conditional HTTP caching with deterministic ETags returning `HTTP 304 Not Modified` (0 body bytes) on `/api/config` and `/api/notifications?target=web`, removing `no-store` from Cache-Control headers to permit browser caching. Extended in-memory database caching in `db.ts` to 15 minutes for public config and curriculums (`PUBLIC_CONFIG_CACHE_TTL_MS`, `CURRICULUMS_CACHE_TTL_MS`) with instant admin mutation invalidation, and added per-user in-memory notification caching (`cachedUserNotifications`, 60s TTL). Replaced auxiliary 51 KB `/api/config` fetches after exam generation with direct local coin balance updates.

---

## 20. Security Posture and Required Fixes

Per guideline 6, code must be free of critical vulnerabilities. Current state, ordered by severity — do not reintroduce any of these patterns, and fix them when working in the affected area:

1. **HIGH — plaintext admin password formerly in a source comment** (removed from `db.ts`); its sha256 hash remains committed in `supabase_schema.sql` + `db_data.json`. Rotate the credential and purge from git history.
2. **HIGH — no RLS on any table** (compounds database exposure risk).
3. **MEDIUM — no rate limiting** on login/OTP/register (brute-forceable; OTPs now crypto-random with 10-min expiry, which mitigates but does not eliminate this).
4. **MEDIUM — admin users search interpolates user input into a PostgREST `.or()` filter** (filter injection).
5. **RESOLVED — `x-device-id` client-supplied guest quota bypass** — Cancelled free trial before registration; `/api/chat` and pedagogical AI services now strictly enforce user authentication (`login_required`), eliminating guest token and quota abuse.
6. **LOW — hardcoded Google client ID fallback; sessions non-revocable for 30 days; `check-profiles.js` dumps password hashes to console; legacy sha256 password hashes persist for users who have not logged in since the PBKDF2 migration.**

Fixed:
- Cancelled the free trial before registration: deprecated the 2-turn guest sandbox and enforced strict `login_required` authentication on `/api/chat`. Unregistered visitors can no longer consume DeepSeek or EdenAI quotas using spoofed `x-device-id` headers. Free trial credits (exactly 20.0 coins — no more, no less) are granted strictly upon verified user registration via `checkAndRecordTrialGrant` with multi-factor anti-abuse controls (IP, browser fingerprint, device ID, and email).
- Enforced mandatory cryptographic HMAC SHA-256 signature verification on all Kashier payment callbacks, webhooks, and verification endpoints; removed hardcoded secret fallbacks and insecure paymentStatus-only bypasses.
- Closed IDOR vulnerabilities in flashcards API (`/api/flashcards/card`, `/api/flashcards/review`) by validating user ownership of decks before all update, delete, and review operations.
- Implemented sliding-window rate limiting (`rate_limiter.ts`) across authentication endpoints (`login`, `register`, `otp`, `delete-account`) and resource-intensive endpoints (`upload-image`).
- Sanitized admin user search input against PostgREST filter injection.
- Patched path traversal vulnerability in Curriculum Generator download handler.
- Fixed infinite hang in Curriculum Generator PDF parser where unresolved page resources (`page.objs.get`) blocked extraction indefinitely; added 2000ms object resolution timeout, `commonObjs` check, sequential mutex for `PDFDocumentProxy`, 90s per-page safety timeouts, and digital text bypass for non-text OCR in EdenAI. Validated by extracting all 88 pages of 2nd Year Secondary Egyptian History textbook without errors.
- Fixed heading hierarchy, address order, and hallucinated sections in Curriculum Generator output for 2nd Year Secondary Egyptian History (`Egyptian History.md`, `التاريخ المصري.md`, `تاريخ  مصري.md`); restored full structure into 3 Units and 12 complete Lessons, clamped false lesson numbers > 8 in `curriculum_cleaner.ts`, prevented subheadings from overriding active lessons, and replaced sparse OCR hallucinated content with authentic textbook material.
- Fixed cross-curriculum cache contamination in Curriculum Generator: resolved issue where any uploaded curriculum defaulted to Egyptian History (2nd Year Secondary) in the homepage preview. PyMuPDF batch pre-rendering script execution previously failed on Windows due to newline replacement syntax errors, triggering a fallback to `page_images_cache/page_${pageNumber}.jpg` where 88 historical page images of the Egyptian History book resided. Replaced the flawed command-line string execution with robust Python `stdin` process streaming with JSON-deserialized paths, removed the un-scoped `legacyCachePath` fallback entirely to guarantee strict isolation in per-document hash directories (`page_images_cache/${baseName}_${fileHash}/`), and purged legacy loose images.
- Fixed cross-student exam visibility and unauthorized submission: enforced strict `user_id`/`device_id` scoping in `db.getExams` and `db.getExamSubmissions`, added ownership verification in `/api/exams/submit` (403 Forbidden), added `exams_user_id_idx` and `exams_device_id_idx` database indexes, and updated web client `loadExamsData` to retrieve all student exams in their grade level.
- Fixed 1st-Year Secondary Science (العلوم المتكاملة) curriculum extraction and generator resilience: resolved critical issues where lessons were missing, demoted to subtitles, or misnumbered in `1_high/العلوم.md`. Fixed `curriculum_cleaner.ts` by eliminating the arbitrary `lNum > 6` demotion rule (Egyptian science units have 10+ lessons), expanded number words support up to 25, prevented lessons with distinct titles from being demoted when sharing corrupted OCR numbers, and added recovery logic for lesson headers mislabeled as unit headers. Enhanced `deepseek_organizer.ts` prompt with strict rules forbidding the use of internal subtitles (e.g. `الكثافة`) as lesson titles (e.g. `الخواص الفيزيائية للماء`), distinguishing Unit cover pages from Lesson opening pages, and properly parsing Egyptian graphic badge OCR layouts (`10 الدرس`, `1 الدرس`, `31 الدرس`). Updated `queue_processor.ts` with sequential page completeness checks and error reporting. Synchronized database records, `web/db_data.json`, and uploaded all 1,000 vector chunks (471 parents, 529 children) to Supabase.
- **Fixed Curriculum Generator Delay and High Skip/Bypass Rate:** Upgraded Curriculum Generator to unified multimodal DeepSeek 4.1 engine (`deepseek-flash` / DeepSeek-V4.1-Flash). Resolved critical issue where page processing took 170+ seconds per page with an 80%+ false empty-page bypass rate (80/97 pages skipped). Diagnosed root cause: `pdf_parser.ts` rendered raw 180 DPI uncompressed images of 1.6MB to 3.7MB (>5MB base64 payload), causing API roundtrips to exceed the internal 35s timeout. When timed out, the organizer previously returned empty strings, which `queue_processor.ts` treated as blank pages (`isBlank = true`) and recorded permanently in checkpoints as `status: 'success'`. Implemented in-memory dynamic image compression using `sharp` (downsampling to max 1200x1600 at 80% JPEG quality, reducing payloads to ~180KB and processing time to 3.82 seconds — a 44x speedup), tuned default concurrency batchSize to 3 to prevent provider rate limits, extended DeepSeek fetch timeout to 90s and worker timeout to 120s, ensured DeepSeek organizer throws explicit exceptions on failure rather than returning blank text, upgraded `retryFailed` to automatically purge failed and false-empty pages from checkpoints, and auto-healed existing checkpoints.
- Fixed continuous student and admin page refreshing bug: eliminated 1-second interval root re-renders by extracting `RenewalCountdownDisplay` into an isolated memoized component (`React.memo`), removing the top-level `renewalCountdown` state and root interval, replacing object `user` dependencies in `useEffect` hooks with primitive scalars (`user?.grade_level`, `user?.role`), and implementing non-destructive silent background data loading in the Students Directory (`loadCsStudents(..., silent = true)`), preventing UI unmounting and full-screen spinner flashing.
- Fixed missing admin page data and PostgREST schema cache rejection: resolved error where `getDashboardStats()` and `getUsers()` returned zeroed data and empty student arrays due to referencing `subscription_status` when the column had not been migrated in Supabase (PostgREST 42703). Replaced fixed column lists with safe wildcard `select('*')`, derived dynamic subscription fields from `plan_type` and `payment_transactions`, harmonized revenue casing (`totalRevenueEGP` and `totalRevenueEgp`), added resilient Supabase update fallbacks in `grantUserSubscription` and `toggleUserBan`, and updated `page.tsx` lifecycle hooks to trigger `loadCsStudents()` when the `users` tab is active with automated first-student dossier selection.
- Added student academic engagement metrics: integrated real-time counts for student-sent chat messages (`messages_sent_count`), exams created (`exams_created_count`), and exams completed (`exams_completed_count`) across `db.getUsers()`, `/api/admin/customer-service?action=student_detail`, student cards in the directory, interactive student dossier panel (with completion percentage), and student Excel CSV export.
- Uploaded and synchronized complete curriculum index (فهرس الوحدات والدروس) for 2nd Year Secondary Egyptian History (`2_high` - التاريخ المصري) into Supabase cloud database and local fallback `db_data.json`: structured into 3 Units and 12 complete Lessons with comprehensive pedagogical subtopics, enabling full functionality for curriculum roadmap modals, AI exam/quiz generation, smart flashcard creation, and lesson-level student progress tracking. Added seamless alias normalization between "التاريخ" and "التاريخ المصري" in `curriculum_structure.ts` and `db.ts` for zero-friction student access.
- Added automated security & integrity verification test suite (`scripts/verify_security_integrity.mjs`): 20 automated tests validating PBKDF2 password cryptography (100k iter, salt, legacy sha256 upgrade detection, timing attacks), session token HMAC SHA-256 signatures and anti-tampering, sliding-window rate limiter engine and IP isolation, HTTP security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS 2-year duration, `Permissions-Policy`, `Referrer-Policy`), zero server secrets leaked in client code, KaTeX `trust: false` + DOMPurify SVG sanitization, and session/role checks across all 12 Admin API endpoints.
- **High Concurrent User Load Testing & Architecture Hardening (`scripts/test_concurrent_load.mjs`):** Resolved database file I/O race conditions and zero-reset risk under concurrency by establishing an in-memory master data store in `db.ts` with serialized, atomic queued disk flushing (`.tmp` + rename). Decoupled authentication rate limiting into per-email (5 attempts/10m) and expanded per-network-IP (60 attempts/10m) rules, enabling simultaneous registrations across shared classroom Wi-Fi and Egyptian mobile carrier CGNAT networks without triggering false 429 lockouts. Added in-memory caching for broadcast notifications (30s TTL in `db.ts`), curriculum structure extraction (60s TTL in `curriculum_structure.ts`), and leaderboard top ranks (15s TTL in `db.ts`). Verified via automated high-concurrency load suite: 13/13 tests passed, achieving 235.8 registrations/sec (p95 = 209ms) for 50 simultaneous registrations, 230.4 logins/sec (p95 = 199ms) for 50 concurrent logins, and 31,250 requests/sec (p95 = 12ms) across 500 parallel storm requests with zero dropped registrations or database corruption.
- **Production HTTP High-Load & High-Traffic Benchmark Suite (`scripts/http_load_test.mjs`):** Benchmarked Next.js 16 production server under 6,050 HTTP requests across 80 concurrent workers with persistent connection pooling. Reached 100.00% success rate (6,050 / 6,050 requests succeeded, 0 failures, 0 timeouts, 0 connection drops). Peak scenario throughput reached 562.48 req/sec on landing page SSR / asset delivery (p50 = 69.92ms, p95 = 84.31ms), 273.42 req/sec on broadcast notifications API, 220.77 req/sec on curriculum hierarchy extraction, and 94.06 req/sec during a 2,000-request multi-endpoint storm burst. Authenticated student endpoints (Leaderboard and Daily Quests) maintained 100% reliability under 40 concurrent workers. Validated rate-limiting resilience under rapid login bursts (45/50 throttled with HTTP 429 in ~10ms). Tested production edge domain `https://www.egsaiedu.com` confirming 100% availability. Fixed Next.js Edge Runtime bundler compatibility in `db.ts` by guarding `process.on` behind runtime environment checks.
- **Architecture Hardening, Distributed Rate Limiting & Edge CDN Optimization:**
  1. *Promise-Serialized Non-Blocking Disk Flush & Zero Orphaned Temporary Files:* Implemented a strict Promise-chain serialization queue (`flushQueuePromise`) in `db.ts` that captures the latest in-memory master state at the instant of writing. Coupled with `try...finally` failure-cleanup and process startup/exit hooks (`cleanupOrphanedTmpFiles`), this completely eliminates race conditions where stale snapshots overwrite newer data, as well as zero-byte/orphaned `db_data.json.tmp.*` file leaks.
  2. *Relational Database Shielding from Rate Limiting Contention:* Completely removed PostgreSQL and SQL RPC calls from the rate-limiting hot path in `rate_limiter.ts`. The rate limiter operates on a resilient 2-tier architecture: Tier 1 Upstash Redis REST (edge/serverless native, zero-TCP overhead) and Tier 2 high-speed in-memory sliding window fallback. This eliminates transactional database connection pool exhaustion and query starvation under brute-force attacks. Created focused `supabase_migration_claimed_daily_quests.sql` to persist daily quests without rate-limit DB artifacts.
  3. *Elimination of Split-Brain Cache Divergence via Single-Flight Request Coalescing:* Replaced multi-second process-memory mutable TTL caches (`cachedDailyQuestsMap`, `cachedUserRankMap`) with Single-Flight Request Coalescing maps (`inFlightDailyQuests`, `inFlightUserRank`). Concurrent requests for the same student (e.g. 40 parallel requests during a page reload storm) coalesce into a single pending execution, deduplicating DB operations while ensuring that subsequent requests always read canonical state across multi-instance or serverless deployments.
  4. *Next.js Route Segment Edge Caching (`export const revalidate`):* Configured standard Next.js route segment configs (`export const revalidate = ...`) and RFC-compliant `Cache-Control` headers with `s-maxage` across `/api/config` (300s), `/api/curriculum/structure` (3600s), `/api/notifications` (180s), and `/api/version` (3600s). This enables Vercel Edge Network and CDN POPs to serve cached responses globally with sub-30ms latency, eliminating cold-start round-trips to origin servers.
  5. *Benchmark Verification Under Load:* Verified 100% success across 6,050 HTTP requests in `scripts/http_load_test.mjs` (peak throughput 585.9 req/sec, zero failed requests, zero orphaned temporary files). All 13/13 concurrent stress test suites in `scripts/test_concurrent_load.mjs` passed cleanly.
- **Reviewed, Hardened and Deployed 2nd Year Baccalaureate Physics Curriculum & Index (`2_high` - الفيزياء):** Audited and corrected official physics textbook markdown (`الفيزياء.md`). Removed non-instructional front matter (pages 1-7: covers, copyright, pedagogical preface, "how to use this book", table of contents) and back matter (page 164: author/reviewer credits hallucinated as a fake intro chapter). Structured into 2 primary Units (`# الفصل الأول: الميكانيكا [القوى والحركة]` and `# الفصل الثاني: الحركة الاهتزازية والموجات`) and exactly 23 sequentially numbered Lessons (`## الدرس 1..12` in Unit 1, `## الدرس 1..11` in Unit 2). Corrected all OCR misrecognitions (`دقيقة أساسية` -> `حقيقة أساسية`, `منطقة الحل` -> `منطقية الحل`, `طبعة/طبيعة العالم` -> `طبيعة العلم`, `مطارين العرب` -> `مطار برج العرب`, `عيّارة` -> `عبّارة`) and fixed corrupted questions and unclosed brackets. Purged 100% of emojis to comply with coding guidelines. Enhanced `curriculum_cleaner.ts` and `deepseek_organizer.ts` with chapter-level unit detection, compound lesson numbering (`1-3`, `6-2`), automated front/back matter filters, and OCR autocorrect. Created automated curriculum validation tool (`scripts/verify_curriculum.mjs`) passing all unit, lesson, LaTeX, bracket, and emoji integrity checks. Uploaded and synchronized the full curriculum index (فهرس الوحدات والدروس - 2 units, 23 lessons with complete subtopics and start pages) directly to Supabase cloud database (`curriculums` table row `6b4f496b-cb4b-4bbb-82c5-60d28430c959`) along with raw text preservation (`content`), updated `web/db_data.json`, and added alias normalization for `فيزياء` / `الفيزياء` across `web/src/lib/db.ts` and `web/src/lib/curriculum_structure.ts`.
- **Audited, Hardened and Deployed 2nd Year Baccalaureate Mathematics Curriculum & Index (`2_high` - الرياضيات / رياضيات):** Audited official mathematics curriculum markdown (`الرياضيات.md`). Identified and diagnosed 4 systematic root causes: (1) JavaScript regex word boundary `\b` failing on non-ASCII Arabic words, preventing Table of Contents detection and allowing TOC listings to be parsed as active units/chapters; (2) `skipUntilNextHeading` resetting on page comments `<!-- بداية الصفحة`, causing multi-page front matter leakage; (3) DeepSeek system prompt strictly prohibiting `# الفصل` on lesson opening pages, causing chapter titles to be omitted in Egyptian curricula where the chapter header is printed above the first lesson; and (4) compound lesson numbering (`a-b`) falling into default chapter assignment when unit numbers were misaligned. Hardened `curriculum_cleaner.ts` by replacing ASCII boundaries with non-ASCII boundaries `(?:$|[\s:])`, adding robust front-matter/TOC state tracking, adding back-cover/SPRIX suppression, detecting chapter transitions, and adding OCR autocorrect dictionary entries (`الأعداد المركبة والمعادلات`, `الهندسة والمعادلات`, `المستقيمات`). Enhanced `deepseek_organizer.ts` prompt rules to permit `# الفصل` on chapter openings. Structured `الرياضيات.md` into 4 Units/Chapters (`# الفصل 1: البراهين الجبرية`, `# الفصل 2: المتتابعات`, `# الفصل 3: الأعداد المركبة والمعادلات`, `# الفصل 4: الهندسة والمعادلات`) and 17 sequentially numbered Lessons across 199 instructional pages (pp. 6 to 204), with 0 emojis, 231 block LaTeX formulas, and 463 inline LaTeX formulas. Uploaded and synchronized the full curriculum index (فهرس الوحدات والدروس - 4 units, 17 lessons with comprehensive subtopics and start pages) directly to Supabase cloud database (`curriculums` table row `2066fe2d-b612-4095-99ad-557ba087a616`), populated `content` in `web/db_data.json`, added `رياضيات` / `الرياضيات` alias normalization across `web/src/lib/db.ts` and `web/src/lib/curriculum_structure.ts`, and verified full Next.js production build passing with 0 errors. Passed all automated validation checks (`scripts/verify_curriculum.mjs`).
- **Resolved Flashcard Leitner Recall Assessment & Universal LaTeX Math Formula Rendering:**
  1. *Flashcard Leitner Recall Assessment Engine:* Resolved broken recall rating buttons (Leitner 1 to 5) across both Standard Review Mode (Grid view) and Interactive Review Mode (Stack view). Converted `submitSubjectCardReview` into an async/await handler posting to `/api/flashcards/review` with full authentication headers, safe `res.text()` + `JSON.parse` inspection preventing client-side `SyntaxError` on non-JSON/500 responses, and error handling. In **Standard Grid View**, updating a card's rating immediately increments/updates the Leitner box badge (`صندوق 1..5`) in real time, highlights the chosen rating button, displays a persistent confirmation badge (`✓ تم الحفظ`), and avoids phantom card dealing. In **Interactive Stack View**, reviewing a card records it in `doneCards`, smoothly slides to the next card with dealing animations, and upon session completion, the "خلط وإعادة المراجعة" action performs genuine random shuffling of the card deck (`sort(() => Math.random() - 0.5)`). Hardened `db.reviewFlashcard` with strict deck ownership checks and admin bypass without false 403 rejections. Migrated flashcard endpoints (`/api/flashcards`, `/api/flashcards/card`, `/api/flashcards/subject`, `/api/flashcards/review`) from Edge isolate runtime to standard Node.js server runtime, eliminating edge chunk compilation overhead and file tracing warnings.
  2. *Universal LaTeX Math Formula Typography & KaTeX Engine:* Eliminated raw symbol dumps (`$`, `$$`, `\frac`, `\sqrt`) across Exams, Flashcards, and Chat. Configured `MathRenderer` with `throwOnError: false` (conforming to PRD §3) and expanded macros for Egyptian curriculum notation (`\degree`, `\degreeC`, `\celsius`, `\Delta`, `\alpha`, `\beta`, `\gamma`, `\theta`, `\pi`, trigonometric and Arabic functions `\ga`, `\gta`, `\za`, `\zota`, etc.). Enhanced `parseInlineText` regex to support inline math with spaces (`$ x = 5 $`), display blocks, and bare LaTeX expressions (`\frac`, `\sqrt`, `\xrightarrow`, `\sin`, `\cos`, `\tan`, `\log`, `\ln`, `\to`, `\rightarrow`, etc.). Enhanced `cleanFormula` with comprehensive Arabic Unicode block isolation (`[\u0600-\u06FF]`) to ensure seamless BiDi rendering with `\text{}` wrappers. Added `renderFormattedMath` universal helper and integrated it throughout: Active Exam questions and multiple-choice options; Exam Results review (questions, student answers, model answers, explanations, and diagnostic concept pills); Flashcards Grid View questions and revealed answers; and Flashcards Interactive Stack View cards.
- **Resolved AI Mathematical Symbol Generation, Notation Classification & KaTeX Rendering Architecture:**
  1. *Curriculum & Query Math Notation Classification Engine (`subject_helpers.ts`):* Created `determineMathNotationContext(subjectName, gradeLevel, queryText)` returning `{ notation: 'arabic' | 'english', isExplicitQueryOverride, confidence, languageSchool, reasons }`. Reliably classifies Secondary Stage (`1_high`, `2_high`) Sciences (Physics, Chemistry, Biology, Integrated Sciences) and Language/Experimental school tracks as English notation (LTR, Latin variables $v, a, t, F, m, \lambda, \theta$, Western digits $0-9$), while classifying General Mathematics (Algebra, Geometry, Calculus, Trigonometry) and Preparatory stage sciences as Arabic notation (RTL, Arabic variables $س, ص, ع$, Eastern Arabic digits $٠-٩$, Egyptian combinations $ن \text{ ق } ر$). Dynamically detects query-level overrides when Latin formulas (e.g. $V_f = V_i + a t$) or Arabic questions are asked in cross-disciplinary inquiries.
  2. *Adaptive AI Prompt Directives (`deepseek.ts`):* Dynamically injects mutually exclusive mathematical notation directives into `buildSystemPrompt`. Completely eliminates confusion between the Latin letter 'V' and Eastern Arabic numeral 7 ('٧'), mandates standard grouping braces for powers (`^{\text{...}}`), prohibits unbraced function arguments, forbids mixing Markdown bold asterisks `**` inside LaTeX equations, and enforces curriculum-accurate combination formatting ($ن \text{ ق } ر$).
  3. *Formula Sanitization & Error Recovery Pipeline (`page.tsx` & `globals.css`):* Overhauled `cleanFormula` to strip stray internal delimiters (`$`), normalize Latin 'V'/'v' to '٧' in Arabic math context, brace all unbraced superscripts/subscripts (`^{\text{...}}`), collapse double exponents (`^{a}\,^{b}`), and normalize combination notations. Hardened `MathRenderer` to intercept `.katex-error` spans, attempt secondary automated repair, and fall back to clean, un-inverted text representations without dumping raw broken LaTeX syntax. Hardened `MarkdownMessage` to prevent false standalone math hijacking of markdown lines containing bold markers (`**`), inline delimiters, or Arabic prose introduction words (`معامل`, `إذن`, `بما أن`, `المعادلة:`). Added CSS BiDi protection (`direction: ltr !important; unicode-bidi: embed !important; text-align: left;`) to `.katex-error` spans to guarantee zero RTL inversion in browser display.
  4. *Automated Mathematical Test Suite (`scripts/test_math_system.mjs`):* Created a 29-test comprehensive test suite covering 5 critical suites: Notation Classification (7 tests), Formula Cleaning & Error Repair (7 tests), Arabic Math Symbols (5 tests), English STEM Symbols (5 tests), and Markdown Message Anti-Hijacking (5 tests). All 29/29 tests pass with 100% success rate.
- **Resolved Camera & Microphone Permissions & Production DashScope Speech-to-Text Architecture:**
  1. *Permissions-Policy Header Correction:* Fixed HTTP `Permissions-Policy` header in `web/next.config.ts`. The previously configured restrictive value `camera=(), microphone=(), geolocation=()` completely blocked browser access to media devices, preventing browsers from prompting for permission and immediately throwing `NotAllowedError`. Updated to `camera=(self), microphone=(self), geolocation=()`, allowing first-party camera and microphone hardware requests while maintaining zero-trust protection against geolocation and third-party iframe snooping.
  2. *Enhanced Camera & Audio Client Error Handling (`page.tsx`):* Added explicit `window.isSecureContext` validation to notify students when accessing via insecure HTTP contexts (where browsers omit `navigator.mediaDevices`). Added granular error diagnostics and Arabic guidance for `NotAllowedError` / `PermissionDeniedError` (directing students to browser site settings), `NotFoundError` (no hardware camera/mic), `NotReadableError` (hardware in use by another app), and native camera fallback on mobile.
  3. *Production Alibaba Cloud DashScope Speech-to-Text Migration (`alibaba_asr.ts` & `/api/chat/transcribe`):* Resolved 404 error caused by calling non-existent multimodal chat model `qwen2-audio-instruct`. Migrated integration to official Alibaba Cloud DashScope asynchronous file ASR service (`qwen-audio-3.0-asr-flash-filetrans`) on `https://dashscope-intl.aliyuncs.com/api/v1/services/audio/asr/transcription` with task polling (`/api/v1/tasks/{taskId}`) and automated transcription retrieval. Handles base64 Data URLs natively (`audio/webm`, `audio/mp4`, `audio/wav`), accurately detects silent speech fragments (`SUCCESS_WITH_NO_VALID_FRAGMENT`), and transcribes Egyptian Arabic and English voice messages in under 3 seconds.
- **Resolved AI Improvement Privacy Toggle Persistence & Disabling Failure:**
  1. *Root Cause:* The option to allow AI improvement via chat sharing on the student profile page failed to disable when deselected. The underlying PostgREST database query in `db.updateImproveAiOptIn` called `supabase.from('profiles').update({ improve_ai_opt_in: optIn })`, which was rejected with error code 42703 (`column profiles.improve_ai_opt_in does not exist`) because the migration had not been executed on the live database. This returned HTTP 500 from `/api/auth/update-profile`, triggering the client-side optimistic rollback to revert the toggle back to enabled. Furthermore, `db.getProfile` defaulted `improve_ai_opt_in` to `true` whenever the column was missing, causing page reloads and `/api/config` fetches to overwrite any local preference.
  2. *Resilient Multi-Tier Persistence:* Enhanced `db.ts` with transparent fallback storage using the existing `system_settings` key-value table (`privacy_opt_out:${userId}`) and high-performance in-memory cache (`cachedOptedOutUserIds`). If `profiles.improve_ai_opt_in` is present, it updates the column directly; if the column is absent (PostgREST 42703), it persists the opt-out preference in `system_settings` without throwing any error.
  3. *End-to-End System Synchronization:* Updated `db.getProfile`, `db.getProfileByPhone`, `db.getProfileByEmail`, `db.getUsers`, and `db.updateStudentProfile` to cross-reference `getAllOptedOutUserIds()`, ensuring that opted-out students reliably retain `improve_ai_opt_in: false` across page refreshes, session checks, and admin directory views. The strict conversation privacy shield (`/api/admin/users/conversations` HTTP 403 Forbidden) and redaction badges remain fully enforced.
  4. *Enhanced In-Card User Experience:* Added dedicated in-card visual feedback banner (`privacyCardMessage`) directly beneath the toggle switch on the student profile page in `page.tsx`, confirming immediate status changes (`تم إيقاف مشاركة المحادثات لتحسين الذكاء الاصطناعي وحجبها بنجاح` vs `تم تفعيل خيار المساعدة في تحسين استجابات الذكاء الاصطناعي بنجاح`) with appropriate icon states (`CheckCircle` / `AlertCircle`) and zero layout shift.
- **Resolved Immediate Curriculum & Semantic Vector Synchronization Across Students & Admin:**
  1. *Root Cause:* Uploading or modifying curricula and completing progressive vector embeddings incurred significant delays before appearing for students or administrators due to: (1) `cachedCurriculums` in `db.ts` caching data for 15 minutes (`CURRICULUMS_CACHE_TTL_MS = 900000`) and not being cleared on curriculum mutations; (2) Next.js route segment configs caching responses (`revalidate = 3600` on `/api/curriculum/structure` and `revalidate = 300` on `/api/config`) with HTTP headers permitting up to 24h browser/proxy caching; (3) in-memory `structureCache` in `curriculum_structure.ts` with 5-minute TTL without active invalidator wiring; (4) progressive embedding completion in `page.tsx` only calling `loadCurriculums()`, omitting system configuration and student state updates; and (5) newly uploaded curriculum IDs not automatically appended to `system_settings.active_curriculum_ids`.
  2. *Multi-Layer Backend Invalidation & Dynamic Execution:* Implemented `syncCurriculumStateMutation(curriculumId, isNew, isDelete)` in `db.ts` to atomically bump `system_settings.curriculum_version`, synchronize `active_curriculum_ids` (adding new curricula and removing deleted ones), and trigger registered invalidators. Connected `registerCurriculumInvalidator` across `db.ts` and `curriculum_structure.ts`. Configured `export const dynamic = 'force-dynamic'` and `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` across `/api/curriculum/structure`, `/api/config`, `/api/admin/curriculum`, `/api/admin/curriculum/detail`, and `/api/admin/curriculum/embed`.
  3. *Client-Side Cross-Tab Synchronization:* Added cross-tab synchronization via `BroadcastChannel('egs_curriculum_sync')` and `localStorage` storage events in `page.tsx`. Upon curriculum upload, attachment, deletion, unit editing, or progressive vector embedding completion, the client immediately reloads both admin curricula and public config (`cache: 'no-store'`), invalidates client-side `curriculumStructures` state, updates `localStorage`, and broadcasts synchronization to all open tabs. Reduced background config synchronization interval to 45 seconds using HTTP 304 ETags.

Mitigations already in place (preserve them): PBKDF2 password hashing with transparent legacy upgrade; crypto-random expiring OTPs; server-side Google ID-token signature verification; constant-time HMAC token comparison; DOMPurify + prompt-level SVG whitelisting on web; payload caps on report/log/notification fields; admin role checks on all admin routes; session ownership checks; self-delete prevention; KaTeX `trust:false`; exam answers withheld until submission; auth + metering on the image-analysis proxy.

---

## 21. Coding Guidelines

The mandatory rules live in **[CODING_GUIDELINES.md](CODING_GUIDELINES.md)** in this folder. Summary: no emojis in design; web responsive on all screen sizes with nothing missing; concise clean code with sparse comments and no emojis in code; latest stable technologies; zero critical vulnerabilities; when a change touches a feature linked to other pages/screens/layers, update those too so the feature works end-to-end — even when not explicitly asked (unless told not to); and after every completed task, update this PRD to reflect the change (rule 8).

Cross-cutting change map (what "linked" means in this project):
- **Chat protocol tags** (section 11): backend prompt (`deepseek.ts`) + web parser (`page.tsx`).
- **API contract:** any route change → web fetch calls in `page.tsx`.
- **DB schema:** SQL migration + `db.ts` interfaces/queries + `db_data.json` local shape.
- **Theming:** web `globals.css` tokens.
- **Grades/subjects/plans enums:** `GRADE_NAMES` (web), validation whitelists (auth routes), SQL comments.

