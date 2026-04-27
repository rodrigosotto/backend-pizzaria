import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDto, UserWithRolesDto } from '../auth/dto/auth-response.dto';
import { ApiErrorResponse } from '../../common/swagger/api-response.swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/auth.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── List ────────────────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.owner)
  @ApiOperation({
    summary: 'Listar usuários',
    description: 'Retorna todos os usuários cadastrados na plataforma. **Restrito a owners.**',
  })
  @ApiResponse({ status: 200, description: 'Lista de usuários.', type: [UserDto] })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.', type: ApiErrorResponse })
  @ApiResponse({ status: 403, description: 'Acesso negado — requer role owner.', type: ApiErrorResponse })
  findAll() {
    return this.usersService.findAll();
  }

  // ── Get by ID ───────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar usuário por ID',
    description: 'Retorna os dados de um usuário específico, incluindo suas pizzarias vinculadas.',
  })
  @ApiParam({ name: 'id', description: 'UUID do usuário', example: 'uuid-do-usuario' })
  @ApiResponse({ status: 200, description: 'Dados do usuário.', type: UserWithRolesDto })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.', type: ApiErrorResponse })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.', type: ApiErrorResponse })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Atualizar usuário',
    description: 'Atualiza nome, telefone ou avatar de um usuário. **Restrito a owner e admin.**',
  })
  @ApiParam({ name: 'id', description: 'UUID do usuário', example: 'uuid-do-usuario' })
  @ApiResponse({ status: 200, description: 'Usuário atualizado.', type: UserDto })
  @ApiResponse({ status: 400, description: 'Dados inválidos.', type: ApiErrorResponse })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.', type: ApiErrorResponse })
  @ApiResponse({ status: 403, description: 'Acesso negado — requer role owner ou admin.', type: ApiErrorResponse })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.', type: ApiErrorResponse })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, dto, user.sub);
  }

  // ── Deactivate ──────────────────────────────────────────────────────────────

  @Delete(':id')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary: 'Desativar usuário',
    description:
      'Desativa o usuário (soft delete — `isActive: false`). O registro permanece no banco. **Restrito a owner.**',
  })
  @ApiParam({ name: 'id', description: 'UUID do usuário', example: 'uuid-do-usuario' })
  @ApiResponse({ status: 200, description: 'Usuário desativado.', type: UserDto })
  @ApiResponse({ status: 401, description: 'Token ausente ou inválido.', type: ApiErrorResponse })
  @ApiResponse({ status: 403, description: 'Acesso negado — requer role owner.', type: ApiErrorResponse })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.', type: ApiErrorResponse })
  deactivate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.deactivate(id, user.sub);
  }
}
