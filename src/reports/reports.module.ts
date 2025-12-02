import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import AsistenciaDiaria from '../entities/asistencia-diaria.entity';
import Curso from '../entities/curso.entity';
import Colegio from '../entities/colegio.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([AsistenciaDiaria, Curso, Colegio])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
