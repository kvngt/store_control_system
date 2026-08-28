-- ====================================================================================
-- RESTORIFY — Storage Buckets
-- ====================================================================================

-- 1. Insert bucket for vehicle photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehiculos_fotos', 'vehiculos_fotos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create Storage Policies for 'vehiculos_fotos'

-- Allow public read access to all photos
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'vehiculos_fotos');

-- Allow authenticated users to upload new photos
CREATE POLICY "Authenticated users can upload photos" 
ON storage.objects FOR INSERT 
WITH CHECK (
    bucket_id = 'vehiculos_fotos' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their own photos
CREATE POLICY "Authenticated users can update photos" 
ON storage.objects FOR UPDATE 
USING (
    bucket_id = 'vehiculos_fotos' 
    AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete photos
CREATE POLICY "Authenticated users can delete photos" 
ON storage.objects FOR DELETE 
USING (
    bucket_id = 'vehiculos_fotos' 
    AND auth.role() = 'authenticated'
);
