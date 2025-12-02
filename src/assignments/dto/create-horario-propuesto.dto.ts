import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateHorarioPropuestoDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 100)
  nombre: string;

  @IsDateString()
  periodoInicio: string;

  @IsDateString()
  periodoFin: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
