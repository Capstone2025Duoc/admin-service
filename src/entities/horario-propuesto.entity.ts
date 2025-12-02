import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'horarios_propuestos' })
export default class HorarioPropuesto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'colegio_id', type: 'uuid' })
  colegioId: string;

  @Column({ length: 100 })
  nombre: string;

  @Column({ name: 'periodo_inicio', type: 'date' })
  periodoInicio: Date;

  @Column({ name: 'periodo_fin', type: 'date' })
  periodoFin: Date;

  @Column({ length: 20, default: 'borrador', type: 'varchar' })
  estado: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
