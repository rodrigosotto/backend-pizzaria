import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Casa' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ example: 'Rua das Flores' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  street: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @MaxLength(20)
  number: string;

  @ApiPropertyOptional({ example: 'Apto 42' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  complement?: string;

  @ApiProperty({ example: 'Centro' })
  @IsString()
  @MaxLength(100)
  neighborhood: string;

  @ApiProperty({ example: 'Sao Paulo' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: '01310-000' })
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP invalido' })
  zipCode: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
