import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateTableDto {
  @ApiProperty({ example: 1, description: 'Número da mesa (único por pizzaria)' })
  @IsInt()
  @Min(1)
  number!: number;

  @ApiProperty({ example: 4, description: 'Capacidade de pessoas' })
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiPropertyOptional({
    example: 'mesa-01-token',
    description: 'Token do QR Code. Se omitido, é gerado automaticamente.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  qrCodeToken?: string;
}
