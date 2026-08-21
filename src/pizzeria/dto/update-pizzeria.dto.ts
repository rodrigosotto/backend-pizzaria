import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdatePizzeriaDto {
  @ApiPropertyOptional({ example: 'Pizzaria do João' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tradeName?: string;

  @ApiPropertyOptional({ example: 'João Silva ME' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  companyName?: string;

  @ApiPropertyOptional({ example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'contato@pizzaria.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Endereço da pizzaria' })
  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;
}
