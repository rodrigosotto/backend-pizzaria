import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { WhatsAppAccountStatus } from '@prisma/client';

export class UpsertWhatsAppAccountDto {
  @IsString()
  @Length(8, 32)
  @Matches(/^\+?[0-9 ()-]+$/, { message: 'Número WhatsApp inválido' })
  displayPhoneNumber!: string;

  @IsString()
  @Length(1, 255)
  phoneNumberId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  businessAccountId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  metaAppId?: string;

  @IsOptional()
  @IsEnum(WhatsAppAccountStatus)
  status?: WhatsAppAccountStatus;
}
