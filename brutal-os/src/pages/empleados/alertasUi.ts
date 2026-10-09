import { Bell, CalendarClock, Cake, FileWarning, Stethoscope, Wallet } from "lucide-react";
import type { Alerta } from "../../domain/empleados";

export const ALERTA_ICONO: Record<Alerta["tipo"], typeof Bell> = {
  CONTRATO: CalendarClock,
  DOCUMENTOS: FileWarning,
  LIQUIDACION: Wallet,
  CUMPLEAÑOS: Cake,
  EXAMEN: Stethoscope,
};
export const NIVEL_COLOR = { rojo: "var(--red)", amarillo: "var(--orange)", azul: "var(--blue)", verde: "var(--green)" };
