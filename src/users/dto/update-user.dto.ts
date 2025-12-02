import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { USER_ROLES, USER_STATES } from '../users.constants';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  rut?: string;

  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  apellidoPaterno?: string;

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
  @IsOptional()
  role?: (typeof USER_ROLES)[number];

  @IsEmail()
  @IsOptional()
  emailInstitucional?: string;

  @IsIn(USER_STATES)
  @IsOptional()
  estado?: (typeof USER_STATES)[number];

  @IsDateString()
  @IsOptional()
  fechaNacimiento?: string;
}
