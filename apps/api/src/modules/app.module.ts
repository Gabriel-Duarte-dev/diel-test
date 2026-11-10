import { Module } from "@nestjs/common";
import { HealthController } from "../presentation/health.controller";
import { PrismaService } from "../services/prisma.service";
import { StoresController } from "../presentation/stores.controller";
import { EnvironmentsController } from "../presentation/environments.controller";
import { DashboardController } from "../presentation/dashboard.controller";
import { ClientsController } from "../presentation/clients.controller";
import { AuthController } from "../auth/auth.controller";
import { StoresService } from "../services/stores.service";
import { EnvironmentsService } from "../services/environments.service";
import { DashboardService } from "../services/dashboard.service";
import { WeatherService } from "../services/weather.service";
import { ClientsService } from "../services/clients.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RealtimePublisher } from "../realtime/realtime.publisher";
import { AuthService } from "../auth/auth.service";
import { AuthGuard } from "../auth/auth.guard";

@Module({
  imports: [],
  controllers: [HealthController, AuthController, StoresController, EnvironmentsController, DashboardController, ClientsController],
  providers: [
    PrismaService,
    AuthService,
    AuthGuard,
    ClientsService,
    StoresService,
    EnvironmentsService,
    DashboardService,
    WeatherService,
    RealtimeGateway,
    RealtimePublisher,
  ],
})
export class AppModule {}
