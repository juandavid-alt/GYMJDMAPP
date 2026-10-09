import {
  Banknote, Building2, Calculator, FileText, FolderOpen, Gavel, HeartHandshake, House, Landmark,
  ReceiptText, Settings, ShieldCheck, Users, Wallet, UsersRound, type LucideIcon,
} from "lucide-react";

export interface Modulo {
  slug: string;
  nombre: string;
  ruta: string;
  color: string;
  gradiente: string;
  icono: LucideIcon;
  listo: boolean;
  grupo: "Inicio" | "Personas" | "Finanzas" | "Empresa" | "Sistema";
  descripcion: string;
  incluira?: string[];
}

export const MODULOS: Modulo[] = [
  { slug: "inicio", nombre: "Inicio", ruta: "/", color: "#1F4FFF", gradiente: "linear-gradient(145deg,#4C7DFF,#1534D6)", icono: House, listo: true, grupo: "Inicio", descripcion: "¿Cómo está la empresa este mes?" },
  { slug: "empleados", nombre: "Empleados", ruta: "/empleados", color: "#AF52DE", gradiente: "linear-gradient(145deg,#C77DFF,#7B2FBE)", icono: Users, listo: true, grupo: "Personas", descripcion: "BBDD maestra: ingresos, retiros, contratos, documentos y exámenes" },
  { slug: "nomina", nombre: "Nómina", ruta: "/nomina", color: "#30C759", gradiente: "linear-gradient(145deg,#4BE07A,#16994A)", icono: Banknote, listo: true, grupo: "Personas", descripcion: "Plantilla salarial, nómina mensual, aprobación con código y provisiones" },
  {
    slug: "rrhh", nombre: "RRHH", ruta: "/modulo/rrhh", color: "#FF2D55", gradiente: "linear-gradient(145deg,#FF6482,#D70F3C)", icono: HeartHandshake, listo: false, grupo: "Personas",
    descripcion: "Manuales de funciones, vacaciones, ausentismo, onboarding y certificados",
    incluira: ["Manual de funciones por cargo con firma electrónica del empleado y del representante legal", "Alerta automática cuando se crea un cargo sin manual", "Vacaciones: causadas, tomadas y disponibles", "Incapacidades y ausencias conectadas a novedades de nómina", "Reglamento interno, SG-SST y política de tratamiento de datos", "Certificados laborales autogenerados en PDF"],
  },
  {
    slug: "pagos", nombre: "Pagos", ruta: "/modulo/pagos", color: "#FF9500", gradiente: "linear-gradient(145deg,#FFB340,#E07800)", icono: Wallet, listo: false, grupo: "Finanzas",
    descripcion: "Cuentas por pagar, calendario y archivo de dispersión bancaria",
    incluira: ["Recibe automáticamente los pagos de la nómina aprobada (ya conectado)", "Provisión mensual a la cuenta de ahorros con saldo acumulado", "Proveedores, freelancers, impuestos y PILA", "Estados Pendiente → Aprobado → Pagado con soporte obligatorio", "Calendario de pagos y flujo semanal"],
  },
  {
    slug: "facturacion", nombre: "Facturación", ruta: "/modulo/facturacion", color: "#30B0C7", gradiente: "linear-gradient(145deg,#5AC8FA,#1A8BA6)", icono: ReceiptText, listo: false, grupo: "Finanzas",
    descripcion: "Ingresos de la agencia por cliente y por mes",
    incluira: ["Relación de facturas por cliente", "Reemplaza la hoja INGRESOS MENSUALES de nómina", "Proyección de cierre de año con contratos firmados"],
  },
  {
    slug: "impuestos", nombre: "Impuestos", ruta: "/modulo/impuestos", color: "#FFCC00", gradiente: "linear-gradient(145deg,#FFD84D,#E0A800)", icono: Landmark, listo: false, grupo: "Finanzas",
    descripcion: "Calendario tributario nacional y de Bogotá",
    incluira: ["Retención, IVA, ICA, renta y exógena según dígito del NIT", "Recibos y formularios adjuntos", "Semáforo de vencimientos", "Carga tributaria mensual y anual"],
  },
  {
    slug: "clientes", nombre: "Clientes", ruta: "/modulo/clientes", color: "#5856D6", gradiente: "linear-gradient(145deg,#7D7AFF,#3634A3)", icono: Building2, listo: false, grupo: "Empresa",
    descripcion: "Tarjetas de contacto de cada cliente",
    incluira: ["Tarjeta de contacto por cliente", "Contratos y fechas de terminación", "Embudo de clientes activos"],
  },
  {
    slug: "terceros", nombre: "Terceros", ruta: "/modulo/terceros", color: "#A2845E", gradiente: "linear-gradient(145deg,#C4A57E,#7D6243)", icono: UsersRound, listo: false, grupo: "Empresa",
    descripcion: "Proveedores, fotógrafos y freelancers",
    incluira: ["BBDD de terceros con datos tributarios y bancarios", "Pagos a terceros conectados a Pagos"],
  },
  {
    slug: "documentos", nombre: "Índice documental", ruta: "/modulo/documentos", color: "#0A7AFF", gradiente: "linear-gradient(145deg,#4DA3FF,#0058D6)", icono: FolderOpen, listo: false, grupo: "Empresa",
    descripcion: "Reemplaza el ARCHIVO MADRE LA BRUTAL",
    incluira: ["Ficha fija con la información de la empresa (NIT, cuentas, representante legal…)", "Documentos generales: RUT, cámara de comercio, certificación bancaria", "Se alimenta automáticamente de Empleados, Nómina, Pagos, Legal e Impuestos", "Alertas de vencimiento y búsqueda global", "Previsualización sin descargar"],
  },
  {
    slug: "legal", nombre: "Legal", ruta: "/modulo/legal", color: "#FF3B30", gradiente: "linear-gradient(145deg,#FF6961,#D70015)", icono: Gavel, listo: false, grupo: "Empresa",
    descripcion: "Contratos, plantillas, otrosíes y procesos",
    incluira: ["Plantillas de contratos laborales, de clientes y de arriendo", "Autollenado con datos del empleado", "NDA, pólizas y vencimientos", "Procesos disciplinarios (solo ADMINISTRADOR)"],
  },
  {
    slug: "reportes", nombre: "Reportes", ruta: "/modulo/reportes", color: "#8E8E93", gradiente: "linear-gradient(145deg,#AEAEB2,#636366)", icono: FileText, listo: false, grupo: "Sistema",
    descripcion: "Reportes descargables y auditoría completa",
    incluira: ["Log de auditoría con filtros", "Nómina por periodo, costo por área, headcount", "Rentabilidad por cliente y rendimiento por persona"],
  },
  { slug: "configuracion", nombre: "Configuración", ruta: "/configuracion", color: "#636366", gradiente: "linear-gradient(145deg,#8E8E93,#48484A)", icono: Settings, listo: true, grupo: "Sistema", descripcion: "Parámetros legales por año, listas maestras y roles" },
];

export const ICONOS_EXTRA = { Calculator, ShieldCheck };

export function moduloPorRuta(path: string): Modulo {
  if (path === "/") return MODULOS[0];
  return MODULOS.find((m) => m.ruta !== "/" && path.startsWith(m.ruta)) ?? MODULOS[0];
}
