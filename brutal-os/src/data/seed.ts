import { LISTAS_INICIALES, PARAMETROS_2026, PLANTILLA_INICIAL } from "../domain/catalogos";
import { CONFIG_INDICE_INICIAL, SERVICIOS_INICIALES, TRIBUTARIOS_2026 } from "../domain/catalogosFin";
import type { Cliente, Contrato, Factura } from "../domain/facturacion";
import type { CargoPlantilla, DB, Empleado, Historial, Salario } from "../domain/types";

// Datos iniciales = la BBDD real de LA BRUTAL (hoja "BBDD EMPLEADOS" y "BBDD SALARIOS NOMINA").
// Por Habeas Data (Ley 1581 de 2012) ese archivo vive en src/data/privado/ y NUNCA se sube al
// repositorio (está en .gitignore). Documento y cuenta bancaria se guardan con solo los últimos
// 4 dígitos; los números completos se cargan con el importador de Excel y quedan en el navegador.
// Sin el archivo privado, la plataforma arranca vacía y pide importar la BBDD.

interface BBDDPrivada {
  fuente: string;
  empleados: Empleado[];
  salarios: Salario[];
  plantilla: CargoPlantilla[];
}

interface FacturacionPrivada {
  fuente: string;
  clientes: Cliente[];
  contratos: Contrato[];
  facturas: Factura[];
  notasMigracion: string[];
}

const privados = import.meta.glob<BBDDPrivada>("./privado/bbdd.json", { eager: true, import: "default" });
export const BBDD_PRIVADA: BBDDPrivada | undefined = Object.values(privados)[0];
const privadosFin = import.meta.glob<FacturacionPrivada>("./privado/facturacion.json", { eager: true, import: "default" });
export const FACTURACION_PRIVADA: FacturacionPrivada | undefined = Object.values(privadosFin)[0];

export function crearSeed(): DB {
  const empleados = structuredClone(BBDD_PRIVADA?.empleados ?? []);
  const salarios = structuredClone(BBDD_PRIVADA?.salarios ?? []);
  const plantilla = structuredClone(BBDD_PRIVADA?.plantilla ?? PLANTILLA_INICIAL);

  // Historial inicial derivado de las fechas de la hoja (fuente de las gráficas mensuales)
  const historial: Historial[] = [];
  let n = 0;
  for (const e of empleados) {
    historial.push({ id: `h${++n}`, ts: `${e.inicioContrato}T09:00:00.000Z`, usuario: "Migración", modulo: "EMPLEADOS", evento: "INGRESO", empleadoId: e.id, nombre: e.nombreCompleto, campo: "estatus", anterior: "", nuevo: "ACTIVO", detalle: `${e.cargo || "Sin cargo"} · ${e.tipoContrato}` });
    if (e.retiro) {
      historial.push({ id: `h${++n}`, ts: `${e.retiro.fechaSalida}T17:00:00.000Z`, usuario: "Migración", modulo: "EMPLEADOS", evento: "RETIRO", empleadoId: e.id, nombre: e.nombreCompleto, campo: "estatus", anterior: "ACTIVO", nuevo: "RETIRADO", detalle: "Fecha migrada desde “Terminación del contrato”. Causal y liquidación por registrar." });
    }
  }

  const listas = structuredClone(LISTAS_INICIALES);
  for (const e of empleados) {
    if (e.emergenciaParentesco && !listas.parentescos.includes(e.emergenciaParentesco)) listas.parentescos.push(e.emergenciaParentesco);
  }

  return {
    version: 3,
    empleados,
    salarios,
    historial,
    parametros: [PARAMETROS_2026],
    plantilla,
    propuestas: [],
    periodos: [],
    cuentasPorPagar: [],
    provisiones: [],
    ingresos: [],
    listas,
    clientes: structuredClone(FACTURACION_PRIVADA?.clientes ?? []),
    contratos: structuredClone(FACTURACION_PRIVADA?.contratos ?? []),
    facturas: structuredClone(FACTURACION_PRIVADA?.facturas ?? []),
    notasCredito: [],
    servicios: structuredClone(SERVICIOS_INICIALES),
    tributarios: [TRIBUTARIOS_2026],
    gastos: [],
    configIndice: structuredClone(CONFIG_INDICE_INICIAL),
    notasMigracion: [...(FACTURACION_PRIVADA?.notasMigracion ?? [])],
  };
}
