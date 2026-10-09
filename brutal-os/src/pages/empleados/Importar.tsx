import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { agregarCargo, importarEmpleados, useDB } from "../../data/store";
import { SOCIOS_NOMBRES } from "../../domain/catalogos";
import { calcularTerminacion, siguienteId, validarCelular } from "../../domain/empleados";
import { hoy, iso } from "../../domain/fechas";
import type { Empleado, ListasMaestras } from "../../domain/types";
import { fecha } from "../../lib/format";
import { Badge, Empty, Modal, useToast } from "../../components/ui";

// Importa la hoja "BBDD EMPLEADOS" tal como existe hoy en Google Sheets (Archivo → Descargar → .xlsx).
// Previsualiza y valida contra las listas maestras antes de cargar.

const ALIAS_CARGO: Record<string, string> = {
  "DIRECTOR COMERCIAL Y ADM": "DIRECTOR ADMINISTRATIVO Y COMERCIAL",
  "DIRECTOR DE MKT": "DIRECTOR DE MARKETING",
  "DIRECTOR DE DISEÑO": "DIRECTOR DISEÑO",
  "FOTOGRAFO BRUTAL": "FOTÓGRAFO BRUTAL",
  "FOTOGRAFO PRO": "FOTÓGRAFO PRO",
};

interface Fila { e: Empleado; errores: string[]; avisos: string[]; existe: boolean; }

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

function aFecha(v: unknown): string {
  if (v instanceof Date) return iso(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())));
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : "";
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

function digitos(v: unknown) {
  return String(v ?? "").replace(/\.0$/, "").replace(/\D/g, "");
}

function convertir(row: Record<string, unknown>, listas: ListasMaestras, idFallback: string): Fila {
  const g = (k: string) => {
    const key = Object.keys(row).find((x) => norm(x) === norm(k));
    return key ? row[key] : "";
  };
  const errores: string[] = [];
  const avisos: string[] = [];
  const enLista = (valor: string, lista: string[], campo: string) => {
    if (!valor) return "";
    const v = lista.find((x) => norm(x) === valor || norm(x).normalize("NFD").replace(/[̀-ͯ]/g, "") === valor.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    if (!v) errores.push(`${campo} “${valor}” no está en la lista`);
    return v ?? valor;
  };
  const estatus = norm(g("ESTATUS")) === "RETIRADO" ? "RETIRADO" : "ACTIVO";
  const tipo = (["FIJO", "INDEFINIDO", "PS"].includes(norm(g("TIPO DE CONTRATO"))) ? norm(g("TIPO DE CONTRATO")) : "PS") as Empleado["tipoContrato"];
  const inicio = aFecha(g("INICIO DEL CONTRATO"));
  const terminacionCol = aFecha(g("TERMINACION DEL CONTRATO"));
  const dur = Number(digitos(g("DURACIÓN DEL CONTRATO"))) as 6 | 12;
  const nombre = norm(g("NOMBRE COMPLETO"));
  let cargo = norm(g("CARGO"));
  cargo = ALIAS_CARGO[cargo] ?? cargo;
  const area = enLista(norm(g("AREA")), listas.areas, "Área");
  if (cargo && !listas.cargos.some((c) => c.cargo === cargo)) avisos.push(`Cargo “${cargo}” no existe: se agregará a la lista maestra`);
  const celular = digitos(g("CELULAR"));
  if (celular && !validarCelular(celular)) errores.push("Celular sin 10 dígitos");
  if (!inicio) errores.push("Sin fecha de inicio");
  if (!nombre) errores.push("Sin nombre");
  const duracion = tipo === "FIJO" ? (dur === 12 ? 12 : 6) : null;
  // La columna TERMINACIÓN se usa solo para FIJO; en retirados se migra a los campos de retiro.
  const salida = estatus === "RETIRADO" ? terminacionCol || hoy() : null;
  if (estatus === "RETIRADO") avisos.push(`Fecha de retiro migrada desde “Terminación”: ${fecha(salida)}`);
  const id = norm(g("ID unico de empleado")) || idFallback;
  const e: Empleado = {
    id,
    estatus,
    esSocio: SOCIOS_NOMBRES.includes(nombre),
    tipoContrato: tipo,
    inicioContrato: inicio || hoy(),
    duracionMeses: duracion,
    terminacionContrato: tipo === "FIJO" && estatus === "ACTIVO" ? terminacionCol || calcularTerminacion(inicio || hoy(), duracion ?? 6) : null,
    renovaciones: 0,
    nombreCompleto: nombre,
    fechaNacimiento: aFecha(g("F. NACIMIENTO")),
    tipoDocumento: (["CC", "CE", "PPT"].includes(norm(g("TIPO DE DOCUMENTO"))) ? norm(g("TIPO DE DOCUMENTO")) : "CC") as Empleado["tipoDocumento"],
    numeroDocumento: digitos(g("# DE DOCUMENTO")),
    genero: (norm(g("GENERO")) === "MASCULINO" ? "MASCULINO" : norm(g("GENERO")) === "FEMENINO" ? "FEMENINO" : "OTRO"),
    celular,
    correo: String(g("CORREO PERSONAL") ?? "").trim(),
    direccion: String(g("DIRECCION") ?? "").trim(),
    area,
    cargo,
    claseRiesgoArl: 1,
    eps: enLista(norm(g("EPS")), listas.eps, "EPS"),
    arl: enLista(norm(g("ARL")), listas.arl, "ARL"),
    afp: enLista(norm(g("FONDO DE PENSIONES")), listas.afp, "Pensión"),
    banco: enLista(norm(g("BANCO")), listas.bancos, "Banco"),
    tipoCuenta: norm(g("TIPO DE CUENTA")) === "CORRIENTE" ? "CORRIENTE" : "AHORROS",
    numeroCuenta: digitos(g("NUMERO DE CUENTA")),
    emergenciaNombre: norm(g("CONTACTO DE EMERGENCIA")),
    emergenciaParentesco: norm(g("PARENTESCO")),
    emergenciaCelular: digitos(g("CELULAR CONTACTO EMERGENCIA")),
    examen: { estatus: "PENDIENTE CITAR", desde: hoy() },
    autorizacionDatos: false,
    autorizacionFecha: "",
    archivos: [],
    retiro: salida ? { fechaNotificacion: salida, causal: tipo === "PS" ? "FIN DE PRESTACIÓN DE SERVICIOS" : "TERMINACIÓN POR VENCIMIENTO", fechaSalida: salida, valorLiquidacion: 0, estadoLiquidacion: "PAGADA" } : undefined,
    creadoEn: new Date().toISOString(),
  };
  if (!e.autorizacionDatos) avisos.push("Falta autorización Ley 1581 (se solicitará al empleado)");
  return { e, errores, avisos, existe: false };
}

export default function Importar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [archivo, setArchivo] = useState("");

  const leer = async (file: File) => {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const hoja = wb.SheetNames.find((n) => norm(n).includes("EMPLEADOS")) ?? wb.SheetNames[0];
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: "" });
    const hIdx = matriz.findIndex((r) => r.some((c) => norm(c).includes("ID UNICO")));
    if (hIdx < 0) {
      toast("No encontramos la fila de encabezados (columna “ID unico de empleado”)", "error");
      return;
    }
    const headers = matriz[hIdx].map((h) => String(h));
    const datos = matriz.slice(hIdx + 1).filter((r) => r.some((c) => String(c).trim()));
    let base = [...db.empleados];
    const out = datos.map((r) => {
      const obj = Object.fromEntries(headers.map((h, i) => [h, r[i]]));
      const f = convertir(obj, db.listas, siguienteId(base));
      base = [...base, f.e];
      f.existe = db.empleados.some((x) => x.id === f.e.id || x.numeroDocumento === f.e.numeroDocumento);
      return f;
    });
    setArchivo(`${file.name} · hoja “${hoja}”`);
    setFilas(out);
  };

  const validas = filas.filter((f) => !f.errores.length);
  const cargar = () => {
    for (const f of validas) {
      if (f.e.cargo && !db.listas.cargos.some((c) => c.cargo === f.e.cargo)) agregarCargo(f.e.cargo, f.e.area);
    }
    importarEmpleados(validas.map((f) => f.e));
    toast(<><b>{validas.length}</b> registros importados · {filas.length - validas.length} omitidos por errores</>);
    setFilas([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar desde Excel / Google Sheets"
      size="wide"
      footer={filas.length ? <><button className="btn" onClick={() => setFilas([])}>Elegir otro archivo</button><button className="btn primary" disabled={!validas.length} onClick={cargar}>Cargar {validas.length} registros</button></> : undefined}
    >
      {!filas.length ? (
        <Empty
          icon={<FileSpreadsheet />}
          title="Migra la BBDD actual sin digitar"
          text="En Google Sheets: Archivo → Descargar → Microsoft Excel (.xlsx). Leemos la hoja BBDD EMPLEADOS, validamos cada fila contra las listas maestras y te mostramos la previsualización antes de cargar. Si el ID o el documento ya existe, se actualiza en vez de duplicar."
          action={<><button className="btn primary" onClick={() => ref.current?.click()}><Upload />Elegir archivo .xlsx</button><input ref={ref} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} /></>}
        />
      ) : (
        <>
          <div className="row wrap" style={{ marginBottom: 12 }}>
            <span className="footnote">{archivo}</span>
            <span className="right row" style={{ gap: 6 }}>
              <Badge color="green">{validas.filter((f) => !f.existe).length} nuevos</Badge>
              <Badge color="blue">{validas.filter((f) => f.existe).length} actualizan</Badge>
              <Badge color="red">{filas.length - validas.length} con errores</Badge>
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: "56vh" }}>
            <table className="t">
              <thead><tr><th>Resultado</th><th>ID</th><th>Nombre</th><th>Estatus</th><th>Contrato</th><th>Área · Cargo</th><th>Observaciones</th></tr></thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className={f.errores.length ? "devuelta" : ""}>
                    <td>{f.errores.length ? <Badge color="red">Error</Badge> : f.existe ? <Badge color="blue">Actualiza</Badge> : <Badge color="green">Nuevo</Badge>}</td>
                    <td className="mono">{f.e.id}</td>
                    <td>{f.e.nombreCompleto}</td>
                    <td>{f.e.estatus}</td>
                    <td>{f.e.tipoContrato}</td>
                    <td>{f.e.area} · {f.e.cargo || "—"}</td>
                    <td className="footnote" style={{ whiteSpace: "normal", minWidth: 260 }}>
                      {f.errores.map((x) => <div key={x} style={{ color: "var(--red)" }}>{x}</div>)}
                      {f.avisos.map((x) => <div key={x}>{x}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
