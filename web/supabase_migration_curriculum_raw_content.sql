-- ==============================================================================
-- EGS AI — Migration: Curriculum Raw Content Preservation
-- ==============================================================================
-- Stores original uploaded Markdown content alongside RAG vector chunks
-- to ensure 100% fidelity in admin content view and structural lesson indexing.

ALTER TABLE public.curriculums
  ADD COLUMN IF NOT EXISTS content TEXT;
