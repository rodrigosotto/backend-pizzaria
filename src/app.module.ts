import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './infra/database/prisma.module';
import { SupabaseModule } from './infra/supabase/supabase.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PizzeriaModule } from './pizzeria/pizzeria.module';
import { HubModule } from './hub/hub.module';
import { CardapioModule } from './cardapio/cardapio.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { EstoqueModule } from './estoque/estoque.module';
import { CaixaModule } from './caixa/caixa.module';
import { ChatModule } from './chat/chat.module';
import { ReportsModule } from './reports/reports.module';
import { ConfigPizzeriaModule } from './config-pizzeria/config-pizzeria.module';
import { CouponsModule } from './coupons/coupons.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { DeliverersModule } from './deliverers/deliverers.module';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SupabaseModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PizzeriaModule,
    HubModule,
    CardapioModule,
    CustomersModule,
    OrdersModule,
    EstoqueModule,
    CaixaModule,
    ChatModule,
    ReportsModule,
    ConfigPizzeriaModule,
    CouponsModule,
    LoyaltyModule,
    DeliverersModule,
    DeliveryZonesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
