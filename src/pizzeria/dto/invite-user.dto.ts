import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { PizzeriaUserRole } from '@prisma/client';

export class InviteUserDto {
  @ApiProperty({ example: 'colaborador@email.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: PizzeriaUserRole, example: PizzeriaUserRole.atendente })
  @IsEnum(PizzeriaUserRole)
  role: PizzeriaUserRole;
}
