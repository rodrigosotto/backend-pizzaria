import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PizzeriaInRoleDto {
  @ApiProperty({ example: 'uuid-da-pizzaria' })
  id: string;

  @ApiProperty({ example: 'Pizzaria do João' })
  tradeName: string;

  @ApiPropertyOptional({ example: 'https://cdn.exemplo.com/logo.jpg', nullable: true })
  logoUrl: string | null;

  @ApiProperty({ example: 'active', enum: ['active', 'paused', 'inactive'] })
  status: string;
}

export class UserPizzeriaRoleDto {
  @ApiProperty({ example: 'admin', enum: ['admin', 'atendente', 'cozinha', 'entregador', 'caixa'] })
  role: string;

  @ApiProperty({ type: PizzeriaInRoleDto })
  pizzeria: PizzeriaInRoleDto;
}

export class UserDto {
  @ApiProperty({ example: 'uuid-do-usuario' })
  id: string;

  @ApiProperty({ example: 'João Silva' })
  name: string;

  @ApiProperty({ example: 'joao@email.com' })
  email: string;

  @ApiProperty({ example: 'owner', enum: ['owner', 'admin', 'atendente', 'cozinha', 'entregador', 'caixa', 'cliente'] })
  role: string;

  @ApiPropertyOptional({ example: '11999999999', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.exemplo.com/avatar.jpg', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-04-26T21:00:00.000Z' })
  createdAt: Date;
}

export class UserWithRolesDto extends UserDto {
  @ApiProperty({ type: [UserPizzeriaRoleDto] })
  pizzeriaRoles: UserPizzeriaRoleDto[];
}

export class AuthResponseDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  token: string;
}

export class ChangePasswordResponseDto {
  @ApiProperty({ example: 'Senha alterada com sucesso' })
  message: string;
}
