export type Cadastro = {
  clientes: Array<{ id: string; nome: string; segmento: string }>;
  lojas: Array<{
    id: string;
    cliente_id: string;
    nome: string;
    tipo: string;
    cidade: string;
    uf: string;
    latitude: number;
    longitude: number;
    fuso_horario: string;
    horario_funcionamento: unknown;
  }>;
  ambientes: Array<{
    id: string;
    loja_id: string;
    nome: string;
    faixa_conforto_c: { min: number; max: number };
    horario_funcionamento: unknown;
    dev_id: string;
  }>;
  usuarios: Array<{
    id: string;
    nome: string;
    email: string;
    perfil: "admin_diel" | "gestor_cliente" | "gerente_loja";
    cliente_id?: string | null;
    lojas?: string[] | null;
  }>;
};

const WEEKDAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;
const USER_PROFILES = new Set(["admin_diel", "gestor_cliente", "gerente_loja"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`cadastro.json: ${field} must be a non-empty string`);
  }
}

function requireUnique(values: string[], field: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`cadastro.json: duplicate ${field}`);
  }
}

function validateSchedule(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`cadastro.json: ${field} must be an object with weekday schedules`);
  }

  for (const [day, window] of Object.entries(value)) {
    if (!WEEKDAYS.includes(day as (typeof WEEKDAYS)[number])) {
      throw new Error(`cadastro.json: invalid weekday ${field}.${day}`);
    }
    if (window === null) continue;
    if (!Array.isArray(window) || window.length !== 2) {
      throw new Error(`cadastro.json: ${field}.${day} must be null or [HH:mm, HH:mm]`);
    }
    const startValue: unknown = window[0];
    const endValue: unknown = window[1];
    const validStart = typeof startValue === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(startValue);
    const validEnd = typeof endValue === "string" &&
      (/^([01]\d|2[0-3]):[0-5]\d$/.test(endValue) || endValue === "24:00");
    if (!validStart || !validEnd) {
      throw new Error(`cadastro.json: ${field}.${day} must be [HH:mm, HH:mm]; 24:00 is valid only as the end time`);
    }
    if (startValue === endValue) {
      throw new Error(`cadastro.json: ${field}.${day} cannot have equal start and end times`);
    }
  }
}

function validateTimezone(value: string, field: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
  } catch {
    throw new Error(`cadastro.json: ${field} must be a valid IANA time zone`);
  }
}

export function parseCadastro(value: unknown): Cadastro {
  if (!isRecord(value)) throw new Error("cadastro.json must contain an object");
  for (const key of ["clientes", "lojas", "ambientes", "usuarios"] as const) {
    if (!Array.isArray(value[key])) throw new Error(`cadastro.json: ${key} must be an array`);
  }

  const cadastro = value as unknown as Cadastro;
  for (const [index, client] of cadastro.clientes.entries()) {
    requireString(client?.id, `clientes[${index}].id`);
    requireString(client?.nome, `clientes[${index}].nome`);
    requireString(client?.segmento, `clientes[${index}].segmento`);
  }
  requireUnique(cadastro.clientes.map((item) => item.id), "client ids");

  for (const [index, store] of cadastro.lojas.entries()) {
    for (const key of ["id", "cliente_id", "nome", "tipo", "cidade", "uf", "fuso_horario"] as const) {
      requireString(store?.[key], `lojas[${index}].${key}`);
    }
    if (!Number.isFinite(store.latitude) || store.latitude < -90 || store.latitude > 90) {
      throw new Error(`cadastro.json: lojas[${index}].latitude is invalid`);
    }
    if (!Number.isFinite(store.longitude) || store.longitude < -180 || store.longitude > 180) {
      throw new Error(`cadastro.json: lojas[${index}].longitude is invalid`);
    }
    validateTimezone(store.fuso_horario, `lojas[${index}].fuso_horario`);
    validateSchedule(store.horario_funcionamento, `lojas[${index}].horario_funcionamento`);
  }
  requireUnique(cadastro.lojas.map((item) => item.id), "store ids");

  const clientIds = new Set(cadastro.clientes.map((item) => item.id));
  for (const store of cadastro.lojas) {
    if (!clientIds.has(store.cliente_id)) {
      throw new Error(`cadastro.json: store ${store.id} references unknown client ${store.cliente_id}`);
    }
  }

  for (const [index, environment] of cadastro.ambientes.entries()) {
    for (const key of ["id", "loja_id", "nome", "dev_id"] as const) {
      requireString(environment?.[key], `ambientes[${index}].${key}`);
    }
    if (!isRecord(environment.faixa_conforto_c) ||
      typeof environment.faixa_conforto_c.min !== "number" ||
      !Number.isFinite(environment.faixa_conforto_c.min) ||
      typeof environment.faixa_conforto_c.max !== "number" ||
      !Number.isFinite(environment.faixa_conforto_c.max) ||
      environment.faixa_conforto_c.min > environment.faixa_conforto_c.max) {
      throw new Error(`cadastro.json: ambientes[${index}].faixa_conforto_c is invalid`);
    }
    validateSchedule(environment.horario_funcionamento, `ambientes[${index}].horario_funcionamento`);
  }
  requireUnique(cadastro.ambientes.map((item) => item.id), "environment ids");
  requireUnique(cadastro.ambientes.map((item) => item.dev_id), "device ids");

  const storeIds = new Set(cadastro.lojas.map((item) => item.id));
  for (const environment of cadastro.ambientes) {
    if (!storeIds.has(environment.loja_id)) {
      throw new Error(`cadastro.json: environment ${environment.id} references unknown store ${environment.loja_id}`);
    }
  }

  for (const [index, user] of cadastro.usuarios.entries()) {
    requireString(user?.id, `usuarios[${index}].id`);
    requireString(user?.nome, `usuarios[${index}].nome`);
    requireString(user?.email, `usuarios[${index}].email`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      throw new Error(`cadastro.json: usuarios[${index}].email is invalid`);
    }
    if (!USER_PROFILES.has(user.perfil)) {
      throw new Error(`cadastro.json: usuarios[${index}].perfil is invalid`);
    }
    if (user.cliente_id != null && !clientIds.has(user.cliente_id)) {
      throw new Error(`cadastro.json: user ${user.id} references unknown client ${user.cliente_id}`);
    }
    if (user.lojas != null && (!Array.isArray(user.lojas) || !user.lojas.every((id) => typeof id === "string"))) {
      throw new Error(`cadastro.json: usuarios[${index}].lojas must be an array of store ids`);
    }
    for (const storeId of user.lojas ?? []) {
      if (!storeIds.has(storeId)) {
        throw new Error(`cadastro.json: user ${user.id} references unknown store ${storeId}`);
      }
    }
    if (user.perfil === "gestor_cliente" && !user.cliente_id) {
      throw new Error(`cadastro.json: client manager ${user.id} must have cliente_id`);
    }
    if (user.perfil === "gerente_loja" && !(user.lojas?.length)) {
      throw new Error(`cadastro.json: store manager ${user.id} must have at least one assigned store`);
    }
    if (user.perfil === "gerente_loja" && user.cliente_id) {
      const assignedStores = cadastro.lojas.filter((store) => (user.lojas ?? []).includes(store.id));
      if (assignedStores.some((store) => store.cliente_id !== user.cliente_id)) {
        throw new Error(`cadastro.json: store manager ${user.id} has a store outside cliente_id`);
      }
    }
  }
  requireUnique(cadastro.usuarios.map((item) => item.id), "user ids");
  requireUnique(cadastro.usuarios.map((item) => item.email.toLowerCase()), "user emails");

  return cadastro;
}
