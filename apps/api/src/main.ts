import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";

async function bootstrap() {
  const { AppModule } = await import("./modules/app.module");
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({ origin: process.env.WS_CORS_ORIGIN ?? "http://localhost:5173" });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.setGlobalPrefix("api/v1");

  const config = new DocumentBuilder()
    .setTitle("Diel Celsius 360 API")
    .setDescription("API para monitoramento de telemetria IoT")
    .setVersion("0.1.0")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
}

bootstrap();
