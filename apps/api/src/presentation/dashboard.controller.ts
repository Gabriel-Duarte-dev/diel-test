import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { DashboardService } from "../services/dashboard.service";

class SnapshotQuery {
  @IsOptional()
  @IsIn(["last_day", "last_week", "last_30_days"])
  period: "last_day" | "last_week" | "last_30_days" = "last_day";
}

@Controller("dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("snapshot")
  async getSnapshot(@Query() query: SnapshotQuery, @Req() req: { user: AuthUser }) {
    return this.dashboardService.getSnapshot(query.period, req.user);
  }
}
