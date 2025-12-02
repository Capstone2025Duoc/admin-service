import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VinculoInstitucional])],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
