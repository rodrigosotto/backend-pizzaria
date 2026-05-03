import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreatePrinterDto {
  @ApiProperty({ example: 'Impressora Cozinha', description: 'Nome da impressora' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: '192.168.1.100', description: 'Endereço IP da impressora' })
  @IsString()
  @Length(1, 50)
  ip!: string;

  @ApiProperty({
    example: 'kitchen',
    description: 'Setor: kitchen | cashier | bar',
    enum: ['kitchen', 'cashier', 'bar'],
  })
  @IsString()
  @IsIn(['kitchen', 'cashier', 'bar'])
  sector!: string;

  @ApiPropertyOptional({ example: 'Epson TM-T20', description: 'Modelo da impressora' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;
}
