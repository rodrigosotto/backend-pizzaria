import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Distribuidora Paulista de Frios Ltda' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  companyName: string;

  @ApiPropertyOptional({ example: 'Dist. Paulista' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradeName?: string;

  @ApiPropertyOptional({ example: '12.345.678/0001-99' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @ApiPropertyOptional({ example: 'Carlos Mendes' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @ApiProperty({ example: '11988887777' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'contato@distpaulista.com.br' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({
    example: { street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo', zip_code: '01310-100' },
    description: 'Endereço estruturado do fornecedor',
  })
  @IsOptional()
  @IsObject()
  address?: Record<string, string>;

  @ApiPropertyOptional({
    example: ['frios', 'frutas'],
    description: 'Categorias de insumos fornecidos (free-text)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}
