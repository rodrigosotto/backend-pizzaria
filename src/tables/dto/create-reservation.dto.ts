import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ description: 'ID da mesa' })
  @IsUUID()
  tableId!: string;

  @ApiProperty({ example: 'Carlos Ferreira', description: 'Nome do cliente' })
  @IsString()
  @Length(1, 100)
  customerName!: string;

  @ApiProperty({ example: '41977776666', description: 'Telefone do cliente' })
  @IsString()
  @Length(1, 20)
  customerPhone!: string;

  @ApiProperty({ example: '2026-05-10T20:00:00Z', description: 'Data e hora da reserva (ISO 8601)' })
  @IsDateString()
  reservedAt!: string;

  @ApiPropertyOptional({ example: 'Aniversário, mesa com vista' })
  @IsOptional()
  @IsString()
  notes?: string;
}
