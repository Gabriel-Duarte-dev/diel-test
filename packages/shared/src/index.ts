export type DeviceStatus = "ONLINE" | "OFFLINE" | "SEM_DADOS";
export type EnvironmentStatus = "CONFORTAVEL" | "FORA_FAIXA" | "SEM_DADOS";

export interface TimeRange {
  from: string;
  to: string;
}

export interface ComfortWindow {
  min: number;
  max: number;
}
