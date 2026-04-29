import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PizzeriaUserRole } from '@prisma/client';

export class UpdatePizzeriaUserDto {
  @ApiProperty({ enum: PizzeriaUserRole, example: PizzeriaUserRole.cozinha })
  @IsEnum(PizzeriaUserRole)
  role!: PizzeriaUserRole;
}
