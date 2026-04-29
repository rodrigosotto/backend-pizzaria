import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportFiltersDto {
  @ApiPropertyOptional({
    example: '2026-04-01',
    description: 'Data inicial do período (ISO 8601). Padrão: início do mês atual.',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-04-30',
    description: 'Data final do período (ISO 8601). Padrão: hoje.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class ReportFiltersWithLimitDto extends ReportFiltersDto {
  @ApiPropertyOptional({ example: 20, description: 'Máximo de itens retornados. Padrão: 20, máx: 100.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
