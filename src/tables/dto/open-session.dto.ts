import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class OpenSessionDto {
  @ApiPropertyOptional({ example: 'Maria Souza', description: 'Nome do cliente (opcional)' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  customerName?: string;

  @ApiPropertyOptional({ example: '41988887777' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  customerPhone?: string;

  @ApiPropertyOptional({ example: '111.222.333-44' })
  @IsOptional()
  @IsString()
  @Length(1, 14)
  customerCpf?: string;
}
