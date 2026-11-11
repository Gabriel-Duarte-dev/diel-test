import { IsDateString, IsIn, IsOptional } from "class-validator";

export class DateRangeQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(["last_day", "last_week", "last_30_days"])
  period?: "last_day" | "last_week" | "last_30_days";
}
