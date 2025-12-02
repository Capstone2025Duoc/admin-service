import { IsIn, IsString } from 'class-validator';

export class UpdateHorarioPropuestoStatusDto {
  @IsString()
  @IsIn(['borrador', 'aprobado', 'rechazado'])
  estado: string;
}
