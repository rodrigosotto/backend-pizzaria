import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PizzeriaUserRole } from '@prisma/client';
import { EmployeeProfileDto } from './register-pizzeria-user.dto';

export class UpdatePizzeriaUserDto extends PartialType(EmployeeProfileDto) {
  @ApiProperty({ enum: PizzeriaUserRole, example: PizzeriaUserRole.cozinha })
  @IsEnum(PizzeriaUserRole)
  role!: PizzeriaUserRole;
}
