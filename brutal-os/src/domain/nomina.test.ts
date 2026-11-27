import { describe, expect, it } from "vitest";
import { PARAMETROS_2026 as P } from "./catalogos";
import { calcularNomina, retencionProcedimiento1 } from "./nomina";
import { calcularTerminacion, duracionesPermitidas, prorrogasAutomaticas, renovar } from "./empleados";
import { diaHabil, diasVigentesEnMes } from "./fechas";
import type { Empleado } from "./types";

const base = (b: number, extra: Partial<Parameters<typeof calcularNomina>[0]> = {}) =>
  calcularNomina(
    { base: b, auxNoPrestPct: null, deduccionesAsumidas: false, retencionModo: "MANUAL", retencionManual: 0, claseRiesgoArl: 1, ...extra },
    P,
  );

describe("fórmulas de la hoja BBDD SALARIOS NOMINA", () => {
  it("replica la fila EJECUTIVA DE CUENTAS (base 2.900.000, 35 %)", () => {
    const c = base(2_900_000);
    expect(c.auxNoPrestacional).toBeCloseTo(1_015_000);
    expect(c.auxTransporte).toBeCloseTo(249_095);
    expect(c.ingresoBruto).toBeCloseTo(4_164_095);
    expect(c.saludEmpleado).toBeCloseTo(116_000);
    expect(c.pensionEmpleado).toBeCloseTo(116_000);
    expect(c.fsp).toBe(0);
    expect(c.neto).toBeCloseTo(3_932_095);
    expect(c.cesantias).toBeCloseTo((2_900_000 + 249_095) * 0.0833);
    expect(c.prima).toBeCloseTo(c.cesantias);
    expect(c.interesesCesantias).toBeCloseTo(c.cesantias * 0.12);
    expect(c.vacaciones).toBeCloseTo(2_900_000 * 0.0417);
    expect(c.pensionEmpleador).toBeCloseTo(348_000);
    expect(c.ccf).toBeCloseTo(116_000);
    expect(c.arl).toBeCloseTo(15_138);
    expect(c.saludEmpleador).toBe(0);
    expect(c.aporteEmpleador).toBeCloseTo(479_138);
    expect(c.totalPlanilla).toBeCloseTo(711_138);
    expect(c.costoTotal).toBeCloseTo(4_164_095 + c.totalProvisiones + 479_138);
    expect(c.netoConProvisiones).toBeCloseTo(c.neto + c.totalProvisiones);
  });

  it("usa 25 % de auxilio no prestacional para el mínimo", () => {
    const c = base(P.smmlv);
    expect(c.auxNoPrestacional).toBeCloseTo(P.smmlv * 0.25);
    expect(c.alertas).toHaveLength(0);
  });

  it("respeta el % de auxilio definido por cargo (0 %)", () => {
    expect(base(P.smmlv, { auxNoPrestPct: 0 }).auxNoPrestacional).toBe(0);
  });

  it("no paga auxilio de transporte desde 2 SMMLV (=IF(C<SMMLV*2))", () => {
    expect(base(P.smmlv * 2).auxTransporte).toBe(0);
    expect(base(P.smmlv * 2 - 1).auxTransporte).toBeCloseTo(249_095);
  });

  it("aplica FSP 1 % desde 4 SMMLV y retención manual (fila socios)", () => {
    const c = base(10_100_000, { retencionManual: 712_000 });
    expect(c.fsp).toBeCloseTo(101_000);
    expect(c.totalDeducciones).toBeCloseTo(404_000 + 404_000 + 101_000 + 712_000);
    expect(c.saludEmpleador).toBe(0);
    expect(c.totalPlanilla).toBeCloseTo(c.aporteEmpleador + 404_000 + 404_000 + 101_000);
  });

  it("aplica salud empleador, ICBF y SENA desde 10 SMMLV", () => {
    const c = base(P.smmlv * 10);
    expect(c.saludEmpleador).toBeCloseTo(P.smmlv * 10 * 0.085);
    expect(c.icbf).toBeCloseTo(P.smmlv * 10 * 0.03);
    expect(c.sena).toBeCloseTo(P.smmlv * 10 * 0.02);
  });

  it("suma las deducciones asumidas al costo sin cambiar el neto", () => {
    const a = base(P.smmlv);
    const b = base(P.smmlv, { deduccionesAsumidas: true });
    expect(b.neto).toBeCloseTo(a.neto);
    expect(b.costoTotal - a.costoTotal).toBeCloseTo(a.totalDeducciones);
  });

  it("alerta bases inferiores al SMMLV", () => {
    expect(base(1_000_000).alertas[0]).toMatch(/inferior al SMMLV/);
  });
});

describe("novedades", () => {
  it("prorratea ingresos a mitad de mes", () => {
    const c = base(3_000_000, { novedades: { diasContrato: 15 } });
    expect(c.salarioOrdinario).toBeCloseTo(1_500_000);
    expect(c.auxTransporte).toBeCloseTo(249_095 / 2);
  });

  it("paga incapacidad al 66,67 % sin bajar del SMMLV diario", () => {
    const c = base(P.smmlv, { novedades: { diasIncapacidad: 3 } });
    expect(c.incapacidad).toBeCloseTo((P.smmlv / 30) * 3);
    const d = base(6_000_000, { novedades: { diasIncapacidad: 3 } });
    expect(d.incapacidad).toBeCloseTo(200_000 * 0.6667 * 3);
  });

  it("suma horas extra y descuentos", () => {
    const c = base(2_100_000, { novedades: { hed: 10, prestamos: 100_000 } });
    expect(c.horasExtra).toBeCloseTo((2_100_000 / 210) * 1.25 * 10);
    expect(c.descuentos).toBe(100_000);
  });
});

describe("retención procedimiento 1", () => {
  it("es cero para salarios bajos", () => {
    expect(retencionProcedimiento1(3_000_000, 240_000, P)).toBe(0);
  });
  it("es positiva para salarios altos", () => {
    expect(retencionProcedimiento1(13_635_000, 909_000, P)).toBeGreaterThan(0);
  });
});

describe("contratos FIJO", () => {
  it("calcula la terminación", () => {
    expect(calcularTerminacion("2026-10-01", 6)).toBe("2027-03-31");
    expect(calcularTerminacion("2026-09-01", 12)).toBe("2027-08-31");
  });

  it("desde la cuarta renovación exige 12 meses", () => {
    expect(duracionesPermitidas(2)).toEqual([6, 12]);
    expect(duracionesPermitidas(3)).toEqual([12]);
  });

  const emp = { estatus: "ACTIVO", tipoContrato: "FIJO", duracionMeses: 6, renovaciones: 2, terminacionContrato: "2026-03-31" } as Empleado;

  it("renueva desde el día siguiente", () => {
    expect(renovar(emp, 6)).toEqual({ desde: "2026-04-01", hasta: "2026-09-30", meses: 6, numero: 3 });
    expect(() => renovar({ ...emp, renovaciones: 3 }, 6)).toThrow();
  });

  it("aplica prórrogas automáticas: mismo periodo hasta 3, luego 12 meses", () => {
    const r = prorrogasAutomaticas(emp, "2026-10-09");
    expect(r).toEqual([
      { desde: "2026-04-01", hasta: "2026-09-30", meses: 6, numero: 3 },
      { desde: "2026-10-01", hasta: "2027-09-30", meses: 12, numero: 4 },
    ]);
  });
});

describe("fechas", () => {
  it("cuenta días base 30", () => {
    expect(diasVigentesEnMes(2026, 10, "2026-10-16")).toBe(15);
    expect(diasVigentesEnMes(2026, 2, "2026-01-01", "2026-02-28")).toBe(30);
    expect(diasVigentesEnMes(2026, 10, "2026-01-01", "2026-10-15")).toBe(15);
    expect(diasVigentesEnMes(2026, 10, "2026-11-01")).toBe(0);
  });
  it("calcula día hábil PILA", () => {
    expect(diaHabil(2026, 11, 1, P.festivos)).toBe("2026-11-03");
  });
});
