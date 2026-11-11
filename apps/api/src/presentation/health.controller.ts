import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../services/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Liveness: the process is running.
  @Get()
  getHealth() {
    return { status: "ok", service: "diel-api", timestamp: new Date().toISOString() };
  }

  // Readiness: dependencies needed to serve requests are available.
  @Get("ready")
  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", service: "diel-api", timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ status: "not_ready", service: "diel-api" });
    }
  }
}
