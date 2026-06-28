import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../modules/auth/decorators/current-user.decorator';
import { CurrentPizzeria } from '../modules/auth/decorators/current-pizzeria.decorator';
import { RequiresPizzeria } from '../modules/auth/decorators/require-pizzeria.decorator';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { CustomersService } from './customers.service';
import type { JwtPayload } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('Clientes')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Pizzeria-Id', required: true, description: 'ID da pizzaria ativa' })
@ApiResponse({ status: 401, description: 'Token não fornecido ou inválido' })
@ApiResponse({ status: 403, description: 'Sem permissão (role insuficiente ou sem vínculo com a pizzaria)' })
@Controller('customers')
@RequiresPizzeria()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // ── Customers ─────────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Listar clientes da pizzaria',
    description: 'Retorna todos os clientes com seus endereços. Use `?search=` para busca combinada por nome, telefone ou CPF (case-insensitive).',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Texto para filtrar por nome, telefone ou CPF' })
  @ApiResponse({ status: 200, description: 'Lista de clientes com endereços incluídos' })
  list(
    @CurrentPizzeria() pizzeriaId: string,
    @Query('search') search?: string,
  ) {
    return this.customersService.list(pizzeriaId, search);
  }

  @Get('by-phone/:phone')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Busca rápida por telefone',
    description: 'Busca um cliente pelo número de telefone exato. Use este endpoint ao abrir um novo pedido para identificar o cliente rapidamente sem listar todos (RF54). Retorna cliente com endereços.',
  })
  @ApiParam({ name: 'phone', description: 'Telefone do cliente (apenas dígitos, ex: 11999999999)' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado com endereços' })
  @ApiResponse({ status: 404, description: 'Nenhum cliente com este telefone nesta pizzaria' })
  findByPhone(@Param('phone') phone: string, @CurrentPizzeria() pizzeriaId: string) {
    return this.customersService.findByPhone(pizzeriaId, phone);
  }

  @Get('export')
  @Roles(UserRole.owner, UserRole.admin)
  @ApiOperation({
    summary: 'Exportar lista de clientes em CSV (RF55)',
    description: 'Retorna arquivo CSV com nome, telefone, CPF, email, selos e data de cadastro. Use `?search=` para filtrar.',
  })
  @ApiQuery({ name: 'search', required: false })
  async exportCsv(
    @CurrentPizzeria() pizzeriaId: string,
    @Res() reply: FastifyReply,
    @Query('search') search?: string,
  ) {
    const csv = await this.customersService.exportCsv(pizzeriaId, search);
    const filename = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send('\uFEFF' + csv); // BOM para UTF-8 no Excel
  }

  @Get(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Perfil completo do cliente',
    description: 'Retorna os dados do cliente com todos os endereços e os últimos 20 pedidos ordenados por data decrescente (RF51).',
  })
  @ApiParam({ name: 'id', description: 'UUID do cliente' })
  @ApiResponse({ status: 200, description: 'Cliente com endereços e últimos 20 pedidos' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado nesta pizzaria' })
  findById(@Param('id') id: string, @CurrentPizzeria() pizzeriaId: string) {
    return this.customersService.findById(pizzeriaId, id);
  }

  @Post()
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Cadastrar cliente',
    description: 'Cria um novo cliente na pizzaria. O telefone é a chave de identificação única por pizzaria — não é possível ter dois clientes com o mesmo telefone no mesmo estabelecimento (RF50).',
  })
  @ApiResponse({ status: 201, description: 'Cliente cadastrado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (e-mail inválido, campos obrigatórios ausentes)' })
  @ApiResponse({ status: 409, description: 'Já existe um cliente com este telefone nesta pizzaria' })
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.create(pizzeriaId, dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Atualizar dados do cliente',
    description: 'Atualiza parcialmente os dados do cliente. Use `isBlacklisted: true` para bloquear pedidos do cliente (RF53). Use `loyaltyStamps` para ajuste manual de selos de fidelidade (RF52).',
  })
  @ApiParam({ name: 'id', description: 'UUID do cliente' })
  @ApiResponse({ status: 200, description: 'Cliente atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado nesta pizzaria' })
  @ApiResponse({ status: 409, description: 'Telefone já em uso por outro cliente nesta pizzaria' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.update(pizzeriaId, id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.owner, UserRole.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover cliente',
    description: 'Remove o cliente permanentemente. A operação é bloqueada se o cliente possuir pedidos vinculados — use `PATCH` com `isBlacklisted: true` para bloquear sem remover.',
  })
  @ApiParam({ name: 'id', description: 'UUID do cliente' })
  @ApiResponse({ status: 200, description: 'Cliente removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado nesta pizzaria' })
  @ApiResponse({ status: 409, description: 'Cliente possui pedidos vinculados — use isBlacklisted para bloquear' })
  remove(
    @Param('id') id: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.remove(pizzeriaId, id, user);
  }

  // ── Addresses ─────────────────────────────────────────────────────────────

  @Get(':id/addresses')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Listar endereços do cliente',
    description: 'Retorna todos os endereços do cliente com o endereço padrão primeiro.',
  })
  @ApiParam({ name: 'id', description: 'UUID do cliente' })
  @ApiResponse({ status: 200, description: 'Lista de endereços (padrão primeiro)' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado nesta pizzaria' })
  listAddresses(@Param('id') id: string, @CurrentPizzeria() pizzeriaId: string) {
    return this.customersService.listAddresses(pizzeriaId, id);
  }

  @Post(':id/addresses')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Adicionar endereço de entrega',
    description: 'Adiciona um novo endereço ao cliente. Se `isDefault: true`, o endereço anterior padrão é desmarcado automaticamente em transação.',
  })
  @ApiParam({ name: 'id', description: 'UUID do cliente' })
  @ApiResponse({ status: 201, description: 'Endereço adicionado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos (CEP fora do formato, campos obrigatórios ausentes)' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado nesta pizzaria' })
  createAddress(
    @Param('id') id: string,
    @Body() dto: CreateAddressDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.createAddress(pizzeriaId, id, dto, user);
  }

  @Patch(':id/addresses/:addressId')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @ApiOperation({
    summary: 'Atualizar endereço',
    description: 'Atualiza parcialmente um endereço. Se `isDefault: true`, o endereço anterior padrão é desmarcado automaticamente.',
  })
  @ApiParam({ name: 'id', description: 'UUID do cliente' })
  @ApiParam({ name: 'addressId', description: 'UUID do endereço' })
  @ApiResponse({ status: 200, description: 'Endereço atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 404, description: 'Cliente ou endereço não encontrado' })
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.updateAddress(pizzeriaId, id, addressId, dto, user);
  }

  @Delete(':id/addresses/:addressId')
  @Roles(UserRole.owner, UserRole.admin, UserRole.atendente)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover endereço',
    description: 'Remove um endereço do cliente permanentemente.',
  })
  @ApiParam({ name: 'id', description: 'UUID do cliente' })
  @ApiParam({ name: 'addressId', description: 'UUID do endereço' })
  @ApiResponse({ status: 200, description: 'Endereço removido com sucesso' })
  @ApiResponse({ status: 404, description: 'Cliente ou endereço não encontrado' })
  removeAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @CurrentPizzeria() pizzeriaId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.customersService.removeAddress(pizzeriaId, id, addressId, user);
  }
}
