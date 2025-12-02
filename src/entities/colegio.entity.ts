import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'colegios' })
export default class Colegio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre_institucion', length: 150 })
  nombreInstitucion: string;

  @Column({
    name: 'rut_institucion',
    type: 'varchar',
    length: 12,
    nullable: true,
  })
  rutInstitucion: string | null;

  @Column({ type: 'text', nullable: true })
  direccion: string | null;

  @Column({ length: 20, nullable: true, type: 'varchar' })
  telefono: string | null;

  @Column({ name: 'fecha_suscripcion', type: 'date', nullable: true })
  fechaSuscripcion: Date | null;

  @Column({ length: 20, default: 'activo', type: 'varchar' })
  estado: string;
}
