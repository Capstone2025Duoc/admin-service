import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import HorarioPropuesto from '../entities/horario-propuesto.entity';
import HorarioPropuestoDetalle from '../entities/horario-propuesto-detalle.entity';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VinculoInstitucional,
      HorarioPropuesto,
      HorarioPropuestoDetalle,
    ]),
  ],
  providers: [AssignmentsService],
  controllers: [AssignmentsController],
})
export class AssignmentsModule {}
