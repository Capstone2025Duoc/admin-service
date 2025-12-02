import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';
import Role from './role.entity';

@Entity({ name: 'vinculos_institucionales' })
export class VinculoInstitucional {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'persona_id', type: 'uuid' })
  personaId: string;

  @Column({ name: 'colegio_id', type: 'uuid' })
  colegioId: string;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'rol_id' })
  role: Role;

  @Column({ name: 'email_institucional', nullable: true })
  emailInstitucional: string;
}

export default VinculoInstitucional;
