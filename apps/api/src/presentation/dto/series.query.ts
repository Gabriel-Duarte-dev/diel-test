import { IsBooleanString, IsDateString, IsIn, IsOptional } from "class-validator";

export class SeriesQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(["last_day", "last_week", "last_30_days"])
  period?: "last_day" | "last_week" | "last_30_days";

  @IsOptional()
  @IsIn(["raw", "5min", "hourly", "daily"])
  aggregation: "raw" | "5min" | "hourly" | "daily" = "hourly";

  @IsOptional()
  @IsBooleanString()
  includeExternal?: string;
}
