import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'cursos' })
export default class Curso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'colegio_id', type: 'uuid' })
  colegioId: string;

  @Column({ length: 50 })
  nombre: string;

  @Column({ name: 'nivel', type: 'varchar', length: 50, nullable: true })
  nivel: string | null;

  @Column({ type: 'int' })
  annio: number;

  @Column({ name: 'sala_id', type: 'uuid', nullable: true })
  salaId: string | null;

  @Column({ name: 'profesor_jefe_vinculo_id', type: 'uuid', nullable: true })
  profesorJefeVinculoId: string | null;
}
