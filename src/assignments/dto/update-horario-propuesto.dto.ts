import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class UpdateHorarioPropuestoDto {
  @IsOptional()
  @IsString()
  @Length(3, 100)
  nombre?: string;

  @IsOptional()
  @IsDateString()
  periodoInicio?: string;

  @IsOptional()
  @IsDateString()
  periodoFin?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
