import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCadastro } from "./seed-validation";

describe("seed cadastro validation", () => {
  const cadastro = JSON.parse(readFileSync(resolve(__dirname, "../../../dados/cadastro.json"), "utf8")) as unknown;

  it("accepts the provided challenge cadastro", () => {
    expect(parseCadastro(cadastro).lojas).toHaveLength(5);
  });

  it("rejects stores that reference an unknown client", () => {
    const invalid = structuredClone(cadastro) as { lojas: Array<{ cliente_id: string }> };
    invalid.lojas[0].cliente_id = "missing-client";
    expect(() => parseCadastro(invalid)).toThrow(/unknown client/);
  });

  it("rejects invalid time zones before seeding the database", () => {
    const invalid = structuredClone(cadastro) as { lojas: Array<{ fuso_horario: string }> };
    invalid.lojas[0].fuso_horario = "Mars/Olympus";
    expect(() => parseCadastro(invalid)).toThrow(/IANA time zone/);
  });

  it("accepts 24:00 only as the end of a full-day schedule", () => {
    const valid = structuredClone(cadastro) as {
      ambientes: Array<{ horario_funcionamento: Record<string, [string, string] | null> }>;
    };
    valid.ambientes[0].horario_funcionamento.seg = ["00:00", "24:00"];
    expect(() => parseCadastro(valid)).not.toThrow();

    const invalid = structuredClone(cadastro) as {
      ambientes: Array<{ horario_funcionamento: Record<string, [string, string] | null> }>;
    };
    invalid.ambientes[0].horario_funcionamento.seg = ["24:00", "24:00"];
    expect(() => parseCadastro(invalid)).toThrow(/24:00 is valid only as the end time/);
  });

  it("rejects duplicated device ids", () => {
    const invalid = structuredClone(cadastro) as { ambientes: Array<{ dev_id: string }> };
    invalid.ambientes[1].dev_id = invalid.ambientes[0].dev_id;
    expect(() => parseCadastro(invalid)).toThrow(/duplicate device ids/);
  });
});
