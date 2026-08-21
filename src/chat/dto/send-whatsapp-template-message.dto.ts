import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendWhatsAppTemplateMessageDto {
  @ApiProperty({ example: 'uuid-do-template-oficial' })
  @IsUUID()
  templateId!: string;

  @ApiProperty({ example: 'pt_BR' })
  @IsString()
  @MaxLength(35)
  language!: string;

  @ApiPropertyOptional({ example: ['Maria', '25'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  parameters?: string[];
}
