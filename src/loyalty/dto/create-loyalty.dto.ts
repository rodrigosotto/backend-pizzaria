import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateLoyaltyDto {
  @ApiProperty({ example: 'Cartão Fidelidade', description: 'Nome do programa' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: 10, description: 'Quantidade de selos para resgatar a recompensa' })
  @IsInt()
  @Min(1)
  stampsGoal!: number;

  @ApiProperty({ example: '1 pizza grátis', description: 'Descrição da recompensa' })
  @IsString()
  @Length(1, 255)
  reward!: string;

  @ApiPropertyOptional({ example: 365, description: 'Validade dos selos em dias (null = sem validade)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
