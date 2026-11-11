import { IsBooleanString, IsIn, IsOptional } from "class-validator";
import { DateRangeQuery } from "./date-range.query";

export class SeriesQuery extends DateRangeQuery {
  @IsOptional()
  @IsIn(["raw", "5min", "hourly", "daily"])
  aggregation: "raw" | "5min" | "hourly" | "daily" = "hourly";

  @IsOptional()
  @IsBooleanString()
  includeExternal?: string;
}
