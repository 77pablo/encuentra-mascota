-- Datos de contacto opcionales en el perfil (teléfono/WhatsApp y red social)
alter table public.profiles add column if not exists telefono text;
alter table public.profiles add column if not exists red_social text;
