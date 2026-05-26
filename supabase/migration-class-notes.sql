-- Añade campo de notas de sesión a clases
ALTER TABLE surf_classes ADD COLUMN IF NOT EXISTS notes text;
