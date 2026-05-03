import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpdateDelivererDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 14)
  cpf?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  vehicle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  plate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 150)
  pixKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
