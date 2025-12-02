import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  nombre: string;
}

export default Role;
