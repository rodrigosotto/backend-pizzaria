import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateDelivererDto {
  @ApiProperty({ example: 'João Silva', description: 'Nome do entregador' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: '41988887777', description: 'Telefone do entregador' })
  @IsString()
  @Length(1, 20)
  phone!: string;

  @ApiPropertyOptional({ example: '111.222.333-44' })
  @IsOptional()
  @IsString()
  @Length(1, 14)
  cpf?: string;

  @ApiPropertyOptional({ example: 'Moto Honda CG 160' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  vehicle?: string;

  @ApiPropertyOptional({ example: 'ABC-1234' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  plate?: string;

  @ApiPropertyOptional({ example: '11988887777', description: 'Chave PIX para repasse' })
  @IsOptional()
  @IsString()
  @Length(1, 150)
  pixKey?: string;

  @ApiPropertyOptional({ description: 'ID do usuário da plataforma vinculado ao entregador' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
