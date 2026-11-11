import { IsIn, IsInt, IsOptional, IsString, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class ListStoresQuery {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsIn(["CONFORTAVEL", "FORA_FAIXA", "SEM_DADOS"])
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["nome", "cidade", "comfortPercent"]) 
  sortBy?: "nome" | "cidade" | "comfortPercent";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDir?: "asc" | "desc";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(["last_day", "last_week", "last_30_days"])
  period: "last_day" | "last_week" | "last_30_days" = "last_day";
}
