import { PartialType } from '@nestjs/swagger';
import { CreateCrustDto } from './create-crust.dto';

export class UpdateCrustDto extends PartialType(CreateCrustDto) {}
