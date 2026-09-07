# Food SaaS V1 Starter

Base inicial para el sistema gastronómico multi-cliente.

## Arquitectura
- Next.js + TypeScript
- Supabase Auth
- PostgreSQL
- RLS por `business_id`
- PWA
- Un solo motor para múltiples comercios

## Primer comercio modelo
Black Bull.

## Inicio local
1. Copiar `.env.example` a `.env.local`.
2. Crear un proyecto en Supabase.
3. Ejecutar `supabase/schema.sql` en SQL Editor.
4. Completar URL y anon key.
5. Ejecutar `npm install`.
6. Ejecutar `npm run dev`.

## Seguridad
La separación de clientes no depende de la interfaz. Las tablas operativas llevan `business_id` y RLS.

## Próximo bloque
- Alta del primer negocio.
- Login Dueño/Encargado y Cadete.
- Carga de carta Black Bull.
- Flujo de pedidos.
