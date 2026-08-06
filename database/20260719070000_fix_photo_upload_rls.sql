/*
# Fix "new row violates row-level security policy" on photo upload

1. Problem
- The `qr-codes` storage bucket (used for both the payment QR and the new
  profile photo) only had INSERT and SELECT policies. Supabase Storage's
  `upload(..., { upsert: true })` can internally perform an UPDATE when an
  object at that path already exists, which was rejected because no UPDATE
  policy existed — surfacing as "new row violates row-level security
  policy".

2. Changes
- Add an UPDATE policy (`qr_update_own`) and a DELETE policy
  (`qr_delete_own`) on `storage.objects` for the `qr-codes` bucket, matching
  the existing INSERT policy's permissiveness.

## Important Notes
- Safe to re-run.
*/

DROP POLICY IF EXISTS "qr_update_own" ON storage.objects;
CREATE POLICY "qr_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'qr-codes')
  WITH CHECK (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_delete_own" ON storage.objects;
CREATE POLICY "qr_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'qr-codes');
