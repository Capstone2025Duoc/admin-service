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

const parseOrigins = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const defaultFrontend = 'https://0r5lvz74-3004.brs.devtunnels.ms';
  const envOrigins = parseOrigins(process.env.FRONTEND_URLS);
  const allowedOrigins = [
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ...envOrigins,
    defaultFrontend,
    'http://localhost:3004',
    'http://127.0.0.1:3004',
  ];
  const originWhitelist = [...new Set(allowedOrigins.filter(Boolean))];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (originWhitelist.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy: Origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'Set-Cookie',
      'X-Requested-With',
    ],
    exposedHeaders: ['Set-Cookie'],
  });

  app.use(cookieParser());

  const env = process.env.NODE_ENV || 'development';
  if (env !== 'production' && morgan) {
    app.use(morgan('dev'));
  }

  await app.listen(process.env.PORT ?? 3003);
}

bootstrap();
