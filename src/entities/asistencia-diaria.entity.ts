import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'asistencias_diarias' })
export default class AsistenciaDiaria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'curso_id', type: 'uuid' })
  cursoId: string;

  @Column({ name: 'alumno_vinculo_id', type: 'uuid' })
  alumnoVinculoId: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ length: 20 })
  estado: 'presente' | 'ausente' | 'tardanza';

  @Column({ name: 'registrador_vinculo_id', type: 'uuid', nullable: true })
  registradorVinculoId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', nullable: true })
  createdAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt: Date | null;
}
