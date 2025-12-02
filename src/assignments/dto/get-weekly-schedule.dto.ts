import { IsIn, IsOptional, IsString, Matches, IsUUID } from 'class-validator';

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class GetWeeklyScheduleDto {
  @IsOptional()
  @IsUUID()
  salaId?: string;

  @IsOptional()
  @IsUUID()
  cursoId?: string;

  @IsOptional()
  @IsUUID()
  materiaId?: string;

  @IsOptional()
  @IsUUID()
  profesorVinculoId?: string;

  @IsOptional()
  @IsIn([1, 2, 3, 4, 5])
  diaSemana?: number;

  @IsOptional()
  @IsString()
  @Matches(timePattern)
  horaDesde?: string;

  @IsOptional()
  @IsString()
  @Matches(timePattern)
  horaHasta?: string;
}
