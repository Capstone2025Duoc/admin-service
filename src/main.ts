import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Use require to import cookie-parser and morgan to avoid ESM interop issues
const cookieParser = require('cookie-parser');
let morgan: any;
try {
  morgan = require('morgan');
} catch (e) {
  morgan = null;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // enable CORS for local frontend on port 3004 (allow cookies)
  // Allow specific origins instead of wildcard when credentials are used.
  // Use `ALLOWED_ORIGINS` env var as comma-separated list, defaulting to http://localhost:3004
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3004')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({ origin: allowedOrigins, credentials: true });

  app.use(cookieParser());

  // use morgan in development if available
  const env = process.env.NODE_ENV || 'development';
  if (env !== 'production' && morgan) {
    app.use(morgan('dev'));
  }

  await app.listen(process.env.PORT ?? 3003);
}

bootstrap();
