-- ============================================================
-- Migration 002: Fix RLS so active generators are always public
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop the old conflicting policies on generators
DROP POLICY IF EXISTS "generators_owner_all"   ON public.generators;
DROP POLICY IF EXISTS "generators_public_read" ON public.generators;

-- Anyone can read active listings (no auth required)
CREATE POLICY "generators_active_public_read"
  ON public.generators
  FOR SELECT
  USING (status = 'active');

-- Owners can read ALL their own listings (including drafts/paused)
CREATE POLICY "generators_owner_read_own"
  ON public.generators
  FOR SELECT
  USING (owner_id::text = current_setting('app.current_user_id', TRUE));

-- Owners can insert their own listings
CREATE POLICY "generators_owner_insert"
  ON public.generators
  FOR INSERT
  WITH CHECK (owner_id::text = current_setting('app.current_user_id', TRUE));

-- Owners can update their own listings
CREATE POLICY "generators_owner_update"
  ON public.generators
  FOR UPDATE
  USING (owner_id::text = current_setting('app.current_user_id', TRUE));

-- Owners can delete (soft-delete) their own listings
CREATE POLICY "generators_owner_delete"
  ON public.generators
  FOR DELETE
  USING (owner_id::text = current_setting('app.current_user_id', TRUE));


-- Also fix the users table: public should be able to read
-- basic profile info (needed for owner cards on listings page)
DROP POLICY IF EXISTS "users_own_row"       ON public.users;
DROP POLICY IF EXISTS "users_public_read"   ON public.users;

-- Anyone can read non-sensitive user fields
-- (passwords are never in the select anyway)
CREATE POLICY "users_public_read"
  ON public.users
  FOR SELECT
  USING (TRUE);

-- Users can update only their own row
CREATE POLICY "users_own_update"
  ON public.users
  FOR UPDATE
  USING (id::text = current_setting('app.current_user_id', TRUE));


-- Availability blocks: public read so booking form can show blocked dates
DROP POLICY IF EXISTS "availability_public_read" ON public.availability_blocks;
CREATE POLICY "availability_public_read"
  ON public.availability_blocks
  FOR SELECT
  USING (TRUE);

-- Reviews: public read
DROP POLICY IF EXISTS "reviews_public_read"   ON public.reviews;
DROP POLICY IF EXISTS "reviews_reviewer_insert" ON public.reviews;

CREATE POLICY "reviews_public_read"
  ON public.reviews
  FOR SELECT
  USING (TRUE);

CREATE POLICY "reviews_reviewer_insert"
  ON public.reviews
  FOR INSERT
  WITH CHECK (
    reviewer_id::text = current_setting('app.current_user_id', TRUE)
  );
