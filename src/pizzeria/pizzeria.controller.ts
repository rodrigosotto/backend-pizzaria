import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import type { JwtPayload } from './pizzeria.service';
import { PizzeriaService } from './pizzeria.service';
import { CreatePizzeriaDto } from './dto/create-pizzeria.dto';
import { UpdatePizzeriaDto } from './dto/update-pizzeria.dto';
import { RegisterPizzeriaUserDto } from './dto/register-pizzeria-user.dto';
import { UpdatePizzeriaUserDto } from './dto/update-pizzeria-user.dto';

@ApiTags('Pizzerias')
@ApiBearerAuth('access-token')
@Controller('pizzerias')
export class PizzeriaController {
  constructor(private readonly pizzeriaService: PizzeriaService) {}

  @Post()
  @Roles(UserRole.owner)
  @ApiOperation({ summary: 'Criar nova pizzaria' })
  @ApiResponse({ status: 201, description: 'Pizzaria criada com sucesso' })
  create(@Body() dto: CreatePizzeriaDto, @CurrentUser() user: JwtPayload) {
    return this.pizzeriaService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.owner)
  @ApiOperation({ summary: 'Listar pizzarias do proprietário' })
  @ApiResponse({ status: 200, description: 'Lista de pizzarias' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.pizzeriaService.findAll(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar pizzaria por ID' })
  @ApiResponse({ status: 200, description: 'Dados da pizzaria' })
  @ApiResponse({ status: 403, description: 'Sem acesso a esta pizzaria' })
  findById(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.pizzeriaService.findById(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar dados da pizzaria' })
  @ApiResponse({ status: 200, description: 'Pizzaria atualizada' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePizzeriaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pizzeriaService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.owner)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desativar pizzaria (soft delete)' })
  @ApiResponse({ status: 200, description: 'Pizzaria desativada' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.pizzeriaService.remove(id, user);
  }

  @Post(':id/logo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload do logo da pizzaria' })
  @ApiResponse({ status: 201, description: 'Logo atualizado com sucesso' })
  async uploadLogo(@Param('id') id: string, @CurrentUser() user: JwtPayload, @Req() req: any) {
    const data = await req.file();
    if (!data) throw new InternalServerErrorException('Nenhum arquivo enviado');

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);

    return this.pizzeriaService.uploadLogo(id, buffer, data.filename, data.mimetype, user);
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'Listar usuários vinculados à pizzaria' })
  @ApiResponse({ status: 200, description: 'Lista de vínculos ativos' })
  findUsers(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.pizzeriaService.findUsers(id, user);
  }

  @Post(':id/users')
  @ApiOperation({ summary: 'Cadastrar usuário na pizzaria' })
  @ApiResponse({ status: 201, description: 'Usuário cadastrado com sucesso' })
  @ApiResponse({ status: 409, description: 'Usuário já tem vínculo ativo' })
  registerUser(
    @Param('id') id: string,
    @Body() dto: RegisterPizzeriaUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pizzeriaService.registerUser(id, dto, user);
  }

  @Patch(':id/users/:userId')
  @ApiOperation({ summary: 'Atualizar role de um usuário na pizzaria' })
  @ApiResponse({ status: 200, description: 'Role atualizado' })
  updateUserRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdatePizzeriaUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pizzeriaService.updateUserRole(id, userId, dto, user);
  }

  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover usuário da pizzaria' })
  @ApiResponse({ status: 200, description: 'Vínculo removido' })
  removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pizzeriaService.removeUser(id, userId, user);
  }
}
