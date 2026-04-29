import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../modules/auth/decorators/public.decorator';
import { PrismaService } from '../infra/database/prisma.service';

/**
 * Cardápio público — acessado pelo cliente via QR Code, sem autenticação.
 * RF17: Visualização do cardápio digital (web/mobile) para autoatendimento via QR Code.
 */
@ApiTags('Cardápio Público')
@Controller('public/menu')
export class PublicMenuController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':pizzeriaId')
  @Public()
  @ApiOperation({
    summary: 'Cardápio digital público (QR Code)',
    description:
      'Retorna categorias ativas com seus produtos e tamanhos para exibição no cardápio digital do cliente. Não requer autenticação.',
  })
  @ApiParam({ name: 'pizzeriaId', description: 'ID da pizzaria' })
  @ApiResponse({ status: 200, description: 'Cardápio completo com categorias, produtos e bordas' })
  @ApiResponse({ status: 404, description: 'Pizzaria não encontrada ou inativa' })
  async getMenu(@Param('pizzeriaId') pizzeriaId: string) {
    const pizzeria = await this.prisma.db.pizzeria.findFirst({
      where: { id: pizzeriaId, status: { not: 'inactive' } },
      select: { id: true, tradeName: true, logoUrl: true, phone: true, address: true },
    });

    if (!pizzeria) {
      const { NotFoundException } = await import('@nestjs/common');
      throw new NotFoundException('Pizzaria nao encontrada');
    }

    const categories = await this.prisma.db.productCategory.findMany({
      where: { pizzeriaId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        sortOrder: true,
        availableFrom: true,
        availableTo: true,
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            isPizza: true,
            maxFlavors: true,
            flavorPriceRule: true,
            preparationTime: true,
            sizes: {
              where: { isActive: true },
              orderBy: { price: 'asc' },
              select: {
                id: true,
                sizeLabel: true,
                price: true,
                maxFlavors: true,
              },
            },
          },
        },
      },
    });

    const crusts = await this.prisma.db.crust.findMany({
      where: { pizzeriaId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        extraPriceS: true,
        extraPriceM: true,
        extraPriceL: true,
        extraPriceXl: true,
      },
    });

    const now = new Date();
    const combos = await this.prisma.db.combo.findMany({
      where: {
        pizzeriaId,
        isActive: true,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        price: true,
        validFrom: true,
        validTo: true,
        items: {
          select: {
            id: true,
            quantity: true,
            product: { select: { id: true, name: true } },
            productSize: { select: { id: true, sizeLabel: true } },
          },
        },
      },
    });

    return {
      pizzeria,
      categories,
      crusts,
      combos,
    };
  }
}
