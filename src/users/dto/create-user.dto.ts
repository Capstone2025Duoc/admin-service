import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { USER_ROLES, USER_STATES } from '../users.constants';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  rut: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  apellidoPaterno: string;

  @IsString()
  @IsOptional()
  apellidoMaterno?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsIn(USER_ROLES)
  role: (typeof USER_ROLES)[number];

  @IsEmail()
  @IsOptional()
  emailInstitucional?: string;

  @IsIn(USER_STATES)
  @IsOptional()
  estado?: (typeof USER_STATES)[number];

  @IsDateString()
  @IsOptional()
  fechaNacimiento?: string;

  @IsUUID()
  @IsOptional()
  cursoId?: string;
}
