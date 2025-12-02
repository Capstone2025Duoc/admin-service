import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import HorarioPropuesto from './horario-propuesto.entity';

@Entity({ name: 'horarios_propuestos_detalle' })
export default class HorarioPropuestoDetalle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'propuesta_id', type: 'uuid' })
  propuestaId: string;

  @ManyToOne(() => HorarioPropuesto, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'propuesta_id' })
  propuesta: HorarioPropuesto;

  @Column({ name: 'profesor_vinculo_id', type: 'uuid' })
  profesorVinculoId: string;

  @Column({ name: 'curso_materia_id', type: 'uuid' })
  cursoMateriaId: string;

  @Column({ name: 'sala_id', type: 'uuid' })
  salaId: string;

  @Column({ name: 'dia_semana', type: 'smallint' })
  diaSemana: number;

  @Column({ name: 'hora_inicio', type: 'time' })
  horaInicio: string;

  @Column({ name: 'hora_fin', type: 'time' })
  horaFin: string;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;
}
