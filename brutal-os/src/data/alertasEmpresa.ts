import { alertasEmpleados, estadoDocumentos, serieMensual } from "../domain/empleados";
import { cuentaEnFacturado, valorVigente } from "../domain/facturacion";
import { hoy, MESES } from "../domain/fechas";
import type { DB } from "../domain/types";
import { pct, pesosCortos } from "../lib/format";
import { cartera, contratosPorVencer, facturasCalc, mesCausado, type FilaPyG } from "./selectorsFin";
import type { AlertaIndice } from "../pages/inicio/piezas";

/** Alertas priorizadas de toda la empresa (comerciales, costos, caja, personas, cumplimiento). */
export function alertasEmpresa(db: DB, mes: string, filas: FilaPyG[]): AlertaIndice[] {
  const out: AlertaIndice[] = [];
  const ref = hoy();
  const fila = filas.find((f) => f.mes === mes)!;
  const fs = facturasCalc(db);
  const cs = cartera(db);
  const anio = Number(mes.slice(0, 4));
  for (const v of contratosPorVencer(db, 90)) out.push({ grupo: "Comerciales", nivel: v.dias <= 30 ? "rojo" : v.dias <= 60 ? "amarillo" : "azul", texto: `${v.cli?.nombreComercial} vence en ${v.dias} días · ${pesosCortos(v.valor)}/mes en riesgo`, ruta: `/clientes/${v.c.clienteId}` });
  const sinFin = db.contratos.filter((c) => c.estado === "ACTIVO" && !c.fin);
  if (sinFin.length) out.push({ grupo: "Comerciales", nivel: "amarillo", texto: `${sinFin.length} contratos sin duración definida`, ruta: "/clientes?tab=contratos" });
  const pausados = db.clientes.filter((c) => c.estado === "EN PAUSA" || c.estado === "POR CONFIRMAR");
  if (pausados.length) out.push({ grupo: "Comerciales", nivel: "azul", texto: `${pausados.length} clientes en pausa o por confirmar`, ruta: "/clientes" });
  const congelado = db.contratos.filter((c) => c.estado === "EN PAUSA").reduce((s, c) => s + valorVigente(c, mes), 0);
  if (congelado) out.push({ grupo: "Comerciales", nivel: "amarillo", texto: `${pesosCortos(congelado)}/mes congelados en contratos en pausa`, ruta: "/clientes?tab=contratos" });
  const ingCli = new Map<string, number>();
  for (const x of fs) if (cuentaEnFacturado(x.f) && mesCausado(x.f) === mes) ingCli.set(x.cli?.nombreComercial ?? "—", (ingCli.get(x.cli?.nombreComercial ?? "—") ?? 0) + x.c.ingresoPropio);
  for (const [n, v] of ingCli) if (fila.ingresos && v / fila.ingresos > db.configIndice.umbralConcentracion) out.push({ grupo: "Comerciales", nivel: "amarillo", texto: `${n} concentra ${pct(v / fila.ingresos, 0)} del ingreso del mes`, ruta: "/facturacion" });
  const prev3 = filas.filter((f) => f.mes < mes).slice(-3);
  for (const [cat, v] of Object.entries(fila.costosGastos)) {
    const prom = prev3.length ? prev3.reduce((s, f) => s + (f.costosGastos[cat] ?? 0), 0) / prev3.length : 0;
    if (prom && (v - prom) / prom > db.configIndice.umbralSobrecosto) out.push({ grupo: "Costos y gastos", nivel: "rojo", texto: `Sobrecosto en ${cat}: +${pct((v - prom) / prom, 0)} vs promedio 3 meses`, ruta: "/gastos" });
  }
  for (const g of db.gastos.filter((x) => x.fecha.startsWith(mes) && !x.recurrente && x.valor > db.configIndice.topeGastoAbrupto)) out.push({ grupo: "Costos y gastos", nivel: "amarillo", texto: `Gasto abrupto: ${g.proveedor} ${pesosCortos(g.valor)}`, ruta: "/gastos" });
  if (fila.ingresos && fila.nominaRegistrada && (fila.nominaOperativa + fila.nominaAdministrativa) / fila.ingresos > db.configIndice.metaNominaPctIngresos) out.push({ grupo: "Costos y gastos", nivel: "amarillo", texto: `Nómina en ${pct((fila.nominaOperativa + fila.nominaAdministrativa) / fila.ingresos, 0)} del ingreso`, ruta: "/nomina" });
  if (fila.ingresos && fila.margenOperacional < db.configIndice.metaMargenOperacional) out.push({ grupo: "Costos y gastos", nivel: "amarillo", texto: `Margen operacional ${pct(fila.margenOperacional, 0)} bajo la meta`, ruta: "/" });
  if (!fila.nominaRegistrada) out.push({ grupo: "Costos y gastos", nivel: "azul", texto: `${MESES[Number(mes.slice(5, 7)) - 1]} sin nómina registrada`, ruta: "/nomina" });
  if (!db.gastos.length) out.push({ grupo: "Costos y gastos", nivel: "azul", texto: "Sin gastos no salariales registrados", ruta: "/gastos" });
  const vencida = cs.filter((x) => (x.dias ?? 0) < 0).reduce((s, x) => s + x.c.saldo, 0);
  if (vencida) out.push({ grupo: "Caja y cartera", nivel: "rojo", texto: `Cartera vencida ${pesosCortos(vencida)} en ${cs.filter((x) => (x.dias ?? 0) < 0).length} facturas`, ruta: "/cartera" });
  const pauta = fs.filter((x) => x.f.tipo === "PAUTA" && x.f.estado !== "PAGADA" && x.f.estado !== "ANULADA" && x.f.estado !== "EN PAUSA").reduce((s, x) => s + x.c.reembolsoPauta, 0);
  if (pauta > db.configIndice.topeCapitalPauta) out.push({ grupo: "Caja y cartera", nivel: "rojo", texto: `Capital en pauta ${pesosCortos(pauta)} supera el tope`, ruta: "/cartera" });
  const sinEmitir = db.facturas.filter((f) => f.estado === "PROGRAMADA" && f.fechaProgramada <= ref).length;
  if (sinEmitir) out.push({ grupo: "Caja y cartera", nivel: "amarillo", texto: `${sinEmitir} facturas del ciclo sin emitir`, ruta: "/facturacion?tab=lote" });
  const sinNum = db.facturas.filter((f) => f.datoIncompleto && f.estado !== "ANULADA").length;
  if (sinNum) out.push({ grupo: "Caja y cartera", nivel: "amarillo", texto: `${sinNum} facturas sin número`, ruta: "/facturacion?tab=migracion" });
  const emp = db.empleados.filter((e) => !e.esSocio);
  const contratos = alertasEmpleados(emp).filter((a) => a.tipo === "CONTRATO").length;
  if (contratos) out.push({ grupo: "Personas", nivel: "amarillo", texto: `${contratos} contratos laborales por vencer`, ruta: "/empleados" });
  if (db.periodos.some((p) => p.estado === "EN APROBACIÓN")) out.push({ grupo: "Personas", nivel: "rojo", texto: "Nómina pendiente de aprobación", ruta: "/nomina/mes" });
  const mov = serieMensual(db.empleados, [{ anio, mes: Number(mes.slice(5, 7)) }])[0];
  if (mov.ingresos || mov.retiros) out.push({ grupo: "Personas", nivel: "azul", texto: `${mov.ingresos} ingresos y ${mov.retiros} retiros en el mes`, ruta: "/empleados" });
  const docs = emp.filter((e) => e.estatus === "ACTIVO" && estadoDocumentos(e).semaforo === "rojo").length;
  if (docs) out.push({ grupo: "Cumplimiento", nivel: "rojo", texto: `${docs} empleados con documentos vencidos`, ruta: "/empleados" });
  const orden = { rojo: 0, amarillo: 1, azul: 2 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
