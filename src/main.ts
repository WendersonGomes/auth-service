import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT || 3002;

  app.enableCors({
    origin: 'http://localhost:3001',
    credentials: true,
  });

  console.log(`Auth-Service rodando na porta ${port}`);

  await app.listen(port);
}

bootstrap();
