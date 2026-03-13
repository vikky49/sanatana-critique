-- Migration: Add enhanced analysis fields
-- Date: 2026-03-09
-- Description: Adds new analytical perspectives and quality metrics to analyses table

-- Add new perspective columns
ALTER TABLE analyses 
ADD COLUMN IF NOT EXISTS scientific_accuracy TEXT,
ADD COLUMN IF NOT EXISTS logical_consistency TEXT,
ADD COLUMN IF NOT EXISTS power_dynamics TEXT,
ADD COLUMN IF NOT EXISTS cultural_context TEXT;

-- Add quality metric columns
ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS confidence REAL,
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create index for filtering verses that need review
CREATE INDEX IF NOT EXISTS idx_analyses_needs_review ON analyses(needs_review) WHERE needs_review = TRUE;

-- Create index for version tracking
CREATE INDEX IF NOT EXISTS idx_analyses_version ON analyses(verse_id, version);

-- Comments
COMMENT ON COLUMN analyses.scientific_accuracy IS 'Evaluation of factual/scientific claims against modern knowledge';
COMMENT ON COLUMN analyses.logical_consistency IS 'Deep analysis of internal logical contradictions';
COMMENT ON COLUMN analyses.power_dynamics IS 'Examination of authority, obedience, and power structures';
COMMENT ON COLUMN analyses.cultural_context IS 'Analysis of universal vs culturally-bound teachings';
COMMENT ON COLUMN analyses.confidence IS 'LLM confidence score (0-1) for the analysis quality';
COMMENT ON COLUMN analyses.needs_review IS 'Flag indicating analysis needs human review';
COMMENT ON COLUMN analyses.version IS 'Analysis version number for tracking improvements';
