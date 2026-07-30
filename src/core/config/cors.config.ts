/**
 * Origens permitidas no CORS.
 *
 * `CORS_ORIGIN` aceita uma lista separada por vírgula. Cada item pode ser:
 * - uma origem exata: `https://app.exemplo.com`
 * - um curinga de subdomínio: `https://*.vercel.app` (cobre previews)
 * - `*` para liberar tudo (apenas desenvolvimento)
 */
export function parseCorsOrigins(
  raw = process.env.CORS_ORIGIN,
): Array<string | RegExp> | true {
  const patterns = (raw ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (patterns.includes('*')) return true;

  return patterns.map((pattern) =>
    pattern.includes('*')
      ? new RegExp(
          `^${pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^.]+')}$`,
        )
      : pattern,
  );
}

export function buildCorsOptions() {
  return {
    origin: parseCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Pizzeria-Id'],
    maxAge: 86400,
  };
}
