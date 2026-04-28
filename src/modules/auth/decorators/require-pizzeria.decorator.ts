import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PIZZERIA_KEY = 'requiresPizzeria';

/**
 * Marca o endpoint como exigindo contexto de pizzaria via header X-Pizzeria-Id.
 * O PizzeriaContextGuard valida o header e garante que o usuário tem vínculo ativo.
 * Após a validação, o controller pode acessar o pizzeriaId via @CurrentPizzeria().
 */
export const RequiresPizzeria = () => SetMetadata(REQUIRE_PIZZERIA_KEY, true);
