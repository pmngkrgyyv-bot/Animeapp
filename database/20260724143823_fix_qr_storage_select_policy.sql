-- Allow authenticated users to read (SELECT) objects in the qr-codes bucket.
-- Without this, uploads succeed but the public URL returns 400/auth error
-- and the QR image never displays.
CREATE POLICY "qr_read_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'qr-codes');
