import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePizzeriaDto {
  @ApiProperty({ example: 'Pizzaria do João' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  tradeName: string;

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

  @ApiProperty({ example: '11999999999' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ example: 'contato@pizzaria.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Endereço da pizzaria',
    example: {
      street: 'Rua das Flores',
      number: '123',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-000',
    },
  })
  @IsObject()
  address: Record<string, unknown>;
}
