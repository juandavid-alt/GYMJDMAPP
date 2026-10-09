-- =====================================================================
-- BRUTAL OS — Modelo de datos de producción (PostgreSQL / Supabase)
-- Módulos completos: EMPLEADOS y NÓMINA. Los demás quedan previstos
-- (todas las tablas cuelgan de empleados.id = 'LB0001').
-- Soft delete en todo · historial por registro · RLS por rol.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Roles y usuarios ----------
create type rol_app as enum ('ADMINISTRADOR', 'COORDINACION', 'EMPLEADO', 'CONSULTA');

create table perfiles (
  user_id      uuid primary key references auth.users(id),
  correo       text not null unique,
  rol          rol_app not null default 'CONSULTA',
  empleado_id  text,                       -- perfil propio cuando rol = EMPLEADO
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

create or replace function rol_actual() returns rol_app
language sql stable security definer as $$
  select rol from perfiles where user_id = auth.uid() and activo
$$;

create or replace function empleado_actual() returns text
language sql stable security definer as $$
  select empleado_id from perfiles where user_id = auth.uid()
$$;

-- ---------- LISTAS MAESTRAS (única fuente de los menús) ----------
create table listas_maestras (
  id        bigserial primary key,
  lista     text not null,                 -- AREA, EPS, AFP, ARL, BANCO, TIPO_CUENTA, PARENTESCO, CAUSAL_RETIRO, ...
  valor     text not null,
  padre     text,                          -- para CARGO: el área
  activo    boolean not null default true, -- false = obsoleto (p. ej. contrato PS): conserva históricos, bloquea nuevos
  orden     int not null default 0,
  unique (lista, valor)
);

-- ---------- PARÁMETROS por año ----------
create table parametros (
  anio                         int primary key,
  smmlv                        numeric(14,2) not null,
  aux_transporte               numeric(14,2) not null,
  tope_aux_transporte_smmlv    numeric(6,2)  not null default 2,
  uvt                          numeric(14,2) not null,
  aux_no_prest_pct_general     numeric(7,5)  not null default 0.35,
  aux_no_prest_pct_minimo      numeric(7,5)  not null default 0.25,
  tope_no_salarial_pct         numeric(7,5)  not null default 0.40,
  salud_empleado_pct           numeric(7,5)  not null default 0.04,
  pension_empleado_pct         numeric(7,5)  not null default 0.04,
  fsp                          jsonb         not null,           -- [{desdeSmmlv, pct}]
  salud_empleador_pct          numeric(7,5)  not null default 0.085,
  salud_empleador_desde_smmlv  numeric(6,2)  not null default 10,
  pension_empleador_pct        numeric(7,5)  not null default 0.12,
  ccf_pct                      numeric(7,5)  not null default 0.04,
  icbf_pct                     numeric(7,5)  not null default 0.03,
  sena_pct                     numeric(7,5)  not null default 0.02,
  exoneracion_icbf_sena_smmlv  numeric(6,2)  not null default 10,
  arl_pct                      jsonb         not null,           -- {"1":0.00522,...}
  cesantias_pct                numeric(7,5)  not null default 0.0833,
  prima_pct                    numeric(7,5)  not null default 0.0833,
  intereses_cesantias_pct      numeric(7,5)  not null default 0.12,
  vacaciones_pct               numeric(7,5)  not null default 0.0417,
  incapacidad_pct              numeric(7,5)  not null default 0.6667,
  horas_mes                    int           not null default 210,
  recargos                     jsonb         not null,           -- {hed, hen, nocturno, dominical}
  cuenta_provisiones           jsonb         not null,           -- {banco, tipo, numero (cifrado)}
  dia_habil_pila               int           not null,
  festivos                     date[]        not null default '{}',
  incremento_smmlv_proyeccion  numeric(7,5)  not null default 0.07,
  incremento_general_proyeccion numeric(7,5) not null default 0,
  variacion_alerta_pct         numeric(7,5)  not null default 0.05
);

-- ---------- EMPLEADOS (BBDD maestra) ----------
create sequence empleado_seq start 1;

create table empleados (
  id                     text primary key default ('LB' || lpad(nextval('empleado_seq')::text, 4, '0')),
  estatus                text not null check (estatus in ('ACTIVO','RETIRADO')),
  es_socio               boolean not null default false,
  tipo_contrato          text not null check (tipo_contrato in ('FIJO','INDEFINIDO','PS')),
  inicio_contrato        date not null,
  duracion_meses         int check (duracion_meses in (6,12)),
  terminacion_contrato   date,                              -- solo FIJO (calculada)
  renovaciones           int not null default 0,
  nombre_completo        text not null check (nombre_completo = upper(nombre_completo)),
  fecha_nacimiento       date not null,
  tipo_documento         text not null check (tipo_documento in ('CC','CE','PPT')),
  numero_documento       text not null unique,
  genero                 text not null,
  celular                text not null check (celular ~ '^\d{10}$'),
  correo                 text not null,
  direccion              text not null,
  area                   text not null,
  cargo                  text,
  clase_riesgo_arl       int not null default 1 check (clase_riesgo_arl between 1 and 5),
  eps                    text not null,
  arl                    text not null,
  afp                    text not null,
  banco                  text not null,
  tipo_cuenta            text not null check (tipo_cuenta in ('AHORROS','CORRIENTE')),
  numero_cuenta_cifrado  bytea not null,                    -- pgp_sym_encrypt; solo ADMINISTRADOR descifra
  numero_cuenta_ultimos4 text not null,
  emergencia_nombre      text not null,
  emergencia_parentesco  text not null,
  emergencia_celular     text not null check (emergencia_celular ~ '^\d{10}$'),
  autorizacion_datos     boolean not null,                  -- Ley 1581 de 2012
  autorizacion_fecha     date,
  carpeta_storage        text,                              -- "LB0012 – NOMBRE COMPLETO"
  creado_en              timestamptz not null default now(),
  archivado_en           timestamptz,                       -- soft delete (nunca se borra)
  constraint fijo_tiene_duracion check (tipo_contrato <> 'FIJO' or duracion_meses is not null)
);

create table retiros (
  empleado_id          text primary key references empleados(id),
  fecha_notificacion   date not null,
  causal               text not null,
  fecha_salida         date not null,
  valor_liquidacion    numeric(14,2) not null default 0,
  estado_liquidacion   text not null check (estado_liquidacion in ('PENDIENTE','PAGADA'))
);

create table examenes_medicos (
  id               bigserial primary key,
  empleado_id      text not null references empleados(id),
  tipo             text not null check (tipo in ('INGRESO','EGRESO')),
  estatus          text not null check (estatus in ('PENDIENTE CITAR','AGENDADO','REALIZADO','APROBADO','APTO CON RESTRICCIONES','NO APTO')),
  desde            date not null default current_date,
  cita             timestamptz,
  restricciones    text,
  certificado_id   bigint,
  check (estatus <> 'AGENDADO' or cita is not null),
  check (estatus <> 'APTO CON RESTRICCIONES' or restricciones is not null)
);

create table archivos (
  id            bigserial primary key,
  empleado_id   text references empleados(id),
  tipo          text not null,         -- CEDULA, CERTIFICADO_BANCARIO, AFILIACION_EPS, ...
  subcarpeta    text not null,         -- Documentos personales | Contrato | Exámenes médicos | Seguridad social | Retiro
  nombre        text not null,         -- LB0012_CEDULA.pdf
  ruta_storage  text not null,         -- bucket privado; se sirve con URL firmada temporal
  mime          text not null,
  tamano        bigint not null,
  vence         date,
  version       int not null default 1,
  subido_por    uuid references auth.users(id),
  subido_en     timestamptz not null default now(),
  archivado_en  timestamptz
);

-- ---------- BBDD SALARIO NÓMINA (separada, enlazada por ID) ----------
create table salarios (
  id                     bigserial primary key,
  empleado_id            text not null references empleados(id),
  base                   numeric(14,2) not null,
  aux_no_prest_pct       numeric(7,5),          -- null = regla de PARÁMETROS
  deducciones_asumidas   boolean not null default false,
  retencion_modo         text not null default 'MANUAL' check (retencion_modo in ('MANUAL','AUTO')),
  retencion_manual       numeric(14,2) not null default 0,
  vigente_desde          date not null,
  motivo                 text not null,
  propuesta_id           bigint,
  unique (empleado_id, vigente_desde)
);

create table plantilla_cargos (
  cargo              text primary key,
  area               text not null,
  base               numeric(14,2) not null,
  aux_no_prest_pct   numeric(7,5)
);

create table propuestas (
  id                bigserial primary key,
  tipo              text not null check (tipo in ('AUMENTO_PERSONA','AUMENTO_CARGO','NUEVO_CARGO')),
  empleado_id       text references empleados(id),
  cargo             text not null,
  area              text not null,
  base_antes        numeric(14,2) not null,
  base_despues      numeric(14,2) not null,
  justificacion     text not null,
  comentarios       text,
  fecha_aplicacion  date not null,
  estado            text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APROBADA','RECHAZADA','DEVUELTA')),
  creado_por        uuid references auth.users(id),
  creado_en         timestamptz not null default now(),
  resuelto_por      uuid references auth.users(id),
  resuelto_en       timestamptz,
  comentario_resolucion text
);

-- ---------- NÓMINA MENSUAL ----------
create table periodos_nomina (
  id            text primary key,              -- '2026-10'
  anio          int not null,
  mes           int not null check (mes between 1 and 12),
  estado        text not null check (estado in ('BORRADOR','CARGADO','EN APROBACIÓN','APROBADO','ENVIADO A PAGOS')),
  aprobado_por  uuid references auth.users(id),
  aprobado_en   timestamptz,
  unique (anio, mes)
);

create table filas_nomina (
  periodo_id      text not null references periodos_nomina(id),
  empleado_id     text not null references empleados(id),
  es_socio        boolean not null,
  snapshot        jsonb not null,     -- nombre, área, cargo, banco, cuenta (últimos 4), clase ARL al momento de generar
  base            numeric(14,2) not null,
  condiciones     jsonb not null,     -- aux %, deducciones asumidas, retención
  novedades       jsonb not null,     -- días, incapacidades, licencias, vacaciones, horas extra, bonos, descuentos
  calculo         jsonb,              -- se congela al aprobar (todos los rubros)
  cargada         boolean not null default false,
  devuelta_comentario text,
  primary key (periodo_id, empleado_id)
);

create table reaperturas_nomina (
  id          bigserial primary key,
  periodo_id  text not null references periodos_nomina(id),
  por         uuid references auth.users(id),
  en          timestamptz not null default now(),
  motivo      text not null
);

-- Código de verificación de un solo uso (aprobación y reapertura)
create table codigos_verificacion (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id),
  proposito   text not null,                 -- 'aprobar-2026-10'
  hash        text not null,                 -- crypt(codigo, gen_salt('bf'))
  expira      timestamptz not null,
  usado_en    timestamptz
);

-- ---------- Conexión con PAGOS (módulo próximo) ----------
create table cuentas_por_pagar (
  id             bigserial primary key,
  periodo_id     text references periodos_nomina(id),
  tipo           text not null check (tipo in ('NOMINA','PROVISIONES','PLANILLA','PRESTACIONES','PROVEEDOR','IMPUESTO')),
  beneficiario   text not null,
  empleado_id    text references empleados(id),
  banco          text,
  tipo_cuenta    text,
  numero_cuenta_cifrado bytea,
  valor          numeric(14,2) not null,
  fecha_limite   date not null,
  estado         text not null default 'PENDIENTE' check (estado in ('PENDIENTE','PAGADO','RECHAZADO')),
  fecha_pago     date,
  soporte_id     bigint references archivos(id)
);

create table movimientos_provisiones (
  id          bigserial primary key,
  fecha       date not null,
  periodo_id  text references periodos_nomina(id),
  tipo        text not null check (tipo in ('APORTE','PAGO PRIMA','PAGO CESANTÍAS','PAGO INTERESES','PAGO VACACIONES')),
  valor       numeric(14,2) not null,   -- + aporte / − pago
  detalle     text
);

create table ingresos_mensuales (
  mes    text primary key,              -- '2026-01' (se conectará a Facturación)
  valor  numeric(16,2) not null
);

-- ---------- HISTORIAL / AUDITORÍA ----------
create table historial (
  id           bigserial primary key,
  ts           timestamptz not null default now(),
  usuario      uuid references auth.users(id),
  modulo       text not null,
  evento       text not null,           -- INGRESO, RETIRO, REACTIVACIÓN, RENOVACIÓN, RENOVACIÓN AUTOMÁTICA, CAMBIO DE CARGO...
  empleado_id  text references empleados(id),
  campo        text,
  anterior     text,
  nuevo        text,
  detalle      text
);
create index on historial (empleado_id, ts desc);

-- Trigger genérico: registra cambio de estatus, cargo, área o tipo de contrato
create or replace function log_empleado() returns trigger language plpgsql as $$
declare c text;
begin
  foreach c in array array['estatus','cargo','area','tipo_contrato','terminacion_contrato'] loop
    if (to_jsonb(old)->>c) is distinct from (to_jsonb(new)->>c) then
      insert into historial (usuario, modulo, evento, empleado_id, campo, anterior, nuevo)
      values (auth.uid(), 'EMPLEADOS', 'CAMBIO DE ' || upper(c), new.id, c, to_jsonb(old)->>c, to_jsonb(new)->>c);
    end if;
  end loop;
  return new;
end $$;
create trigger trg_log_empleado after update on empleados for each row execute function log_empleado();

-- ---------- Row Level Security ----------
alter table empleados          enable row level security;
alter table salarios           enable row level security;
alter table filas_nomina       enable row level security;
alter table periodos_nomina    enable row level security;
alter table propuestas         enable row level security;
alter table parametros         enable row level security;
alter table archivos           enable row level security;
alter table historial          enable row level security;

-- Empleados: ADMIN todo; COORDINACIÓN todo menos socios; EMPLEADO solo su fila
create policy emp_admin on empleados for all using (rol_actual() = 'ADMINISTRADOR');
create policy emp_coord on empleados for all using (rol_actual() = 'COORDINACION' and not es_socio);
create policy emp_self  on empleados for select using (rol_actual() = 'EMPLEADO' and id = empleado_actual());
create policy emp_self_upd on empleados for update using (rol_actual() = 'EMPLEADO' and id = empleado_actual());

-- Salarios y nómina: empleados sin acceso; coordinación sin socios
create policy sal_admin on salarios for all using (rol_actual() = 'ADMINISTRADOR');
create policy sal_coord on salarios for select using (
  rol_actual() = 'COORDINACION' and not exists (select 1 from empleados e where e.id = empleado_id and e.es_socio));

create policy per_ver   on periodos_nomina for select using (rol_actual() in ('ADMINISTRADOR','COORDINACION','CONSULTA'));
create policy per_coord on periodos_nomina for update using (rol_actual() = 'COORDINACION' and estado in ('BORRADOR','CARGADO'));
create policy per_admin on periodos_nomina for all using (rol_actual() = 'ADMINISTRADOR');

create policy fil_admin on filas_nomina for all using (rol_actual() = 'ADMINISTRADOR');
create policy fil_coord on filas_nomina for all using (rol_actual() = 'COORDINACION' and not es_socio);

create policy prop_admin on propuestas for all using (rol_actual() = 'ADMINISTRADOR');
create policy prop_coord on propuestas for insert with check (rol_actual() = 'COORDINACION' and estado = 'PENDIENTE');
create policy prop_coord_ver on propuestas for select using (rol_actual() = 'COORDINACION');

create policy par_ver   on parametros for select using (auth.uid() is not null);
create policy par_admin on parametros for all using (rol_actual() = 'ADMINISTRADOR');

create policy arc_staff on archivos for all using (rol_actual() in ('ADMINISTRADOR','COORDINACION'));
create policy arc_self  on archivos for select using (rol_actual() = 'EMPLEADO' and empleado_id = empleado_actual());

create policy his_staff on historial for select using (rol_actual() in ('ADMINISTRADOR','COORDINACION'));

-- La aprobación del periodo se hace en una función SECURITY DEFINER que:
--  1) verifica rol ADMINISTRADOR, 2) valida el código (hash, expiración, un solo uso),
--  3) congela filas_nomina.calculo, 4) crea cuentas_por_pagar y movimientos_provisiones,
--  5) pasa el estado a 'ENVIADO A PAGOS' y escribe en historial. Todo en una transacción.

-- =====================================================================
-- CICLO DE FACTURACIÓN: CLIENTES → CONTRATOS → FACTURAS → CARTERA → INGRESOS
-- =====================================================================
alter type rol_app add value if not exists 'CONTADORA';

create table clientes (
  id                  text primary key,                 -- CB000001 (código interno único: llave de todo)
  nombre_comercial    text not null,
  razon_social        text,
  nit                 text unique,                      -- bloqueo de duplicados por NIT
  dv                  text,
  alias               text[] not null default '{}',     -- formas en que aparece en el histórico
  correos_facturacion text[] not null default '{}',
  correo_cartera      text,
  contacto            jsonb,
  perfil_tributario   jsonb not null,                   -- gran contribuyente, autorretenedor, ICA Bogotá, simple, pública
  requiere_oc         boolean not null default false,
  ciclo               int not null check (ciclo in (1, 15)),
  plazo_pago          int not null default 30,
  estado              text not null check (estado in ('ACTIVO','EN PAUSA','RETIRADO','POR CONFIRMAR')),
  proyectos           text[] not null default '{}',
  creado_en           timestamptz not null default now(),
  archivado_en        timestamptz
);

create table servicios (
  nombre              text primary key,
  categoria           text not null check (categoria in ('MENSUAL','ADICIONAL','PAUTA','TERCEROS')),
  concepto_retencion  text not null,
  base_iva            text not null check (base_iva in ('TOTAL','INCREMENTO')),
  activo              boolean not null default true
);

create table parametros_tributarios (
  anio int primary key, iva_pct numeric(7,5) not null, reteiva_pct numeric(7,5) not null,
  retefuente jsonb not null, reteica_por_mil numeric(8,4) not null, reteica_base_uvt numeric(6,2) not null, uvt numeric(14,2) not null
);

create table contratos (
  id                    text primary key,               -- CT-0001
  cliente_id            text not null references clientes(id),
  proyecto              text,
  inicio                date not null,
  duracion_meses        int,                            -- null = por definir
  fin                   date,
  renovacion_auto       boolean not null default false,
  valor_mensual         numeric(16,2) not null,         -- antes de IVA
  servicios             jsonb not null default '[]',    -- [{servicio, entregables}]
  incremento_pauta_pct  numeric(7,5) not null default 0,
  oc                    jsonb,
  estado                text not null check (estado in ('ACTIVO','EN PAUSA','TERMINADO'))
);

create table otrosies (
  id bigserial primary key, contrato_id text not null references contratos(id), desde date not null, valor_mensual numeric(16,2) not null, nota text
);

create table facturas (
  id                  uuid primary key default gen_random_uuid(),
  numero              text unique,                      -- normalizado (sin espacios, mayúsculas); nunca se reutiliza
  dato_incompleto     boolean not null default false,
  tipo                text not null check (tipo in ('FIJA','ADICIONAL','ONE SHOT','PAUTA')),
  cliente_id          text not null references clientes(id),
  proyecto            text,
  contrato_id         text references contratos(id),
  items               jsonb not null,                   -- [{servicio, cantidad, valor}]
  pauta               jsonb,                            -- {base, pct, fechaEjecucion}
  periodo             text not null,                    -- AAAA-MM del servicio
  descripcion         text not null,
  observaciones       text,
  estado              text not null check (estado in ('PROGRAMADA','EMITIDA','ABONADA','PAGADA','EN PAUSA','ANULADA')),
  fecha_programada    date not null,
  emision             date,
  vencimiento         date,
  oc                  text,
  link                text,
  pago                jsonb,                            -- {fecha, valorRecibido, banco, diferencia, retencionesReales}
  ajuste_nc           numeric(16,2) not null default 0,
  reemite_a           uuid references facturas(id),
  fecha_pago_comprometida date,
  constraint emitida_con_numero check (estado in ('PROGRAMADA','EN PAUSA') or numero is not null or dato_incompleto),
  constraint vencimiento_valido check (vencimiento is null or emision is null or vencimiento >= emision)
);

create table abonos (id bigserial primary key, factura_id uuid not null references facturas(id), fecha date, valor numeric(16,2) not null, banco text, nota text);
create table envios_cobro (id bigserial primary key, factura_id uuid not null references facturas(id), fecha timestamptz not null default now(), destinatario text not null, tipo text);

create table notas_credito (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas(id),
  motivo text not null, alcance text not null check (alcance in ('TOTAL','PARCIAL')), valor numeric(16,2) not null, detalle text,
  estado text not null check (estado in ('SOLICITADA','APROBADA','RECHAZADA')),
  numero text unique, solicitada_por uuid references auth.users(id), resuelta_por uuid references auth.users(id), comentario text
);

create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null, proveedor text not null, valor numeric(16,2) not null, iva numeric(16,2) not null default 0,
  tipo text not null check (tipo in ('COSTO','GASTO','SOCIOS','FUERA')), categoria text not null, subcategoria text,
  recurrente boolean not null default false, cliente_id text references clientes(id), area text, soporte text
);

create table config_indice (id int primary key default 1, datos jsonb not null);  -- metas, presupuesto, umbrales, supuestos, plantilla de correo

alter table clientes enable row level security;
alter table facturas enable row level security;
alter table notas_credito enable row level security;
alter table gastos enable row level security;
create policy fin_admin on facturas for all using (rol_actual() = 'ADMINISTRADOR');
create policy fin_coord on facturas for all using (rol_actual() = 'COORDINACION');
create policy fin_conta on facturas for select using (rol_actual() = 'CONTADORA');
create policy nc_conta on notas_credito for update using (rol_actual() in ('CONTADORA','ADMINISTRADOR'));   -- solo contadora aprueba
create policy nc_coord on notas_credito for insert with check (rol_actual() in ('COORDINACION','ADMINISTRADOR'));
create policy nc_ver on notas_credito for select using (rol_actual() in ('ADMINISTRADOR','COORDINACION','CONTADORA'));
create policy cli_staff on clientes for all using (rol_actual() in ('ADMINISTRADOR','COORDINACION'));
create policy cli_conta on clientes for select using (rol_actual() = 'CONTADORA');
create policy gas_admin on gastos for all using (rol_actual() in ('ADMINISTRADOR','COORDINACION'));
create policy gas_conta on gastos for select using (rol_actual() = 'CONTADORA');
