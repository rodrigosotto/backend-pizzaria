import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PizzeriaUserRole } from '@prisma/client';

export class EmployeeProfileDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: '11999887766' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: '11144477735', description: 'CPF com 11 dígitos, sem pontuação' })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'CPF deve conter 11 dígitos numéricos' })
  cpf!: string;

  @ApiProperty({ example: 'Rua das Flores' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  street!: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  addressNumber!: string;

  @ApiProperty({ example: 'Centro' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  neighborhood!: string;

  @ApiProperty({ example: '01001000', description: 'CEP com 8 dígitos, sem pontuação' })
  @IsString()
  @Matches(/^\d{8}$/, { message: 'CEP deve conter 8 dígitos numéricos' })
  zipCode!: string;

  @ApiProperty({ example: 'São Paulo' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'SP' })
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'Estado deve ser a sigla com duas letras maiúsculas' })
  state!: string;

  @ApiProperty({ example: 'Brasil' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;
}

export class RegisterPizzeriaUserDto extends EmployeeProfileDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senha123' })
  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres' })
  @MaxLength(72)
  password!: string;

  @ApiProperty({ enum: PizzeriaUserRole, example: PizzeriaUserRole.atendente })
  @IsEnum(PizzeriaUserRole)
  role!: PizzeriaUserRole;
}
