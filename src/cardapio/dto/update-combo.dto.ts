import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateComboDto } from './create-combo.dto';

export class UpdateComboDto extends PartialType(OmitType(CreateComboDto, ['items'] as const)) {}
