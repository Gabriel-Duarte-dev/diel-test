import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { EnvironmentsService } from "../services/environments.service";
import { SeriesQuery } from "./dto/series.query";

@Controller("environments")
@UseGuards(AuthGuard)
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Get(":id/summary")
  async getSummary(
    @Param("id") id: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() req: { user: AuthUser },
  ) {
    return this.environmentsService.getSummary(id, req.user, from, to);
  }

  @Get(":id/series")
  async getSeries(@Param("id") id: string, @Query() query: SeriesQuery, @Req() req: { user: AuthUser }) {
    return this.environmentsService.getSeries(id, query, req.user);
  }
}
