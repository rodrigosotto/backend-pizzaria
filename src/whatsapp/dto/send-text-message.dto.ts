import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendTextMessageDto {
  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  body!: string;

  @IsOptional()
  @IsBoolean()
  previewUrl?: boolean;
}
