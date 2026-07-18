-- Permite ver reportes activos y no ocultos SIN iniciar sesión (para links compartidos).
create policy "reportes activos visibles publicamente"
  on public.pets for select to anon
  using (activo = true and oculto = false);
