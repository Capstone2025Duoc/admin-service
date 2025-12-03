// Ensure a global `crypto` exists for libraries that expect Web Crypto API
if (typeof (globalThis as any).crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto');
  (globalThis as any).crypto = nodeCrypto.webcrypto || nodeCrypto;
}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MainModule } from './main/main.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        // If a DATABASE_URL is provided, prefer it (works well with Docker and managed DBs)
        url: config.get('DATABASE_URL') ?? undefined,
        host: config.get('DATABASE_URL') ? undefined : config.get('DB_HOST', 'localhost'),
        port: config.get('DATABASE_URL') ? undefined : parseInt(config.get('DB_PORT', '5432')),
        username: config.get('DATABASE_URL') ? undefined : config.get('DB_USER'),
        password: config.get('DATABASE_URL') ? undefined : config.get('DB_PASS'),
        database: config.get('DATABASE_URL') ? undefined : config.get('DB_NAME'),
        synchronize: false,
        logging: false,
        entities: [path.join(__dirname, '**', '*.entity{.ts,.js}')],
        autoLoadEntities: true,
      }),
    }),
    MainModule,
    // Users module for admin user-related endpoints
    require('./users/users.module').UsersModule,
    // Assignments module for schedule/assignment endpoints
    require('./assignments/assignments.module').AssignmentsModule,
    // Analytics module for school-level metrics
    require('./analytics/analytics.module').AnalyticsModule,
    // Reports module (attendance, exportables)
    require('./reports/reports.module').ReportsModule,
    // Filters helpers (courses, materias, etc.)
    require('./filters/filters.module').FiltersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
