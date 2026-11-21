// Fastify app (PLAN.md §11). Built by a factory so tests can inject an in-process database.
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';

import { createProvider } from './agent/llm';
import { createLithic, type CardIssuer } from './card/lithic';
import type { LlmProvider } from './agent/llm/provider';
import type { Config } from './config';
import type { Db } from './db/client';
import { recommendations, users } from './db/schema';
import { ApiError } from './lib/errors';
import { parseLang, render, t, type Lang } from './i18n';
import { agentRoutes } from './routes/agent';
import { auditRoutes } from './routes/audit';
import { authRoutes } from './routes/auth';
import { bankRoutes } from './routes/bank';
import { cardRoutes } from './routes/card';
import { familyRoutes } from './routes/family';
import { lithicRoutes } from './routes/lithic';
import { meRoutes } from './routes/me';
import { permissionRoutes } from './routes/permissions';
import { summaryRoutes } from './routes/summary';
import { telegramRoutes } from './routes/telegram';
import { transactionRoutes } from './routes/transactions';
import { createGroqStt, type SttProvider } from './stt/groq';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    llm: LlmProvider;
    /** Null when GROQ_API_KEY is empty: voice input answers 503 STT_UNAVAILABLE. */
    stt: SttProvider | null;
    /** Null when LITHIC_API_KEY is empty: the FeMate card is off. */
    cards: CardIssuer | null;
    config: Config;
  }
  interface FastifyRequest {
    userId: string;
    /** From Accept-Language (uz, ru or en); English when the client names none of them. */
    lang: Lang;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export interface AppOptions {
  db: Db;
  config: Config;
  llm?: LlmProvider;
  stt?: SttProvider | null;
  cards?: CardIssuer | null;
  logger?: boolean;
}

export async function buildApp({ db, config, llm, stt, cards, logger = false }: AppOptions) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 1024 * 1024 });
  app.decorate('db', db);
  app.decorate('llm', llm ?? createProvider(config));
  app.decorate('stt', stt === undefined ? createGroqStt(config.GROQ_API_KEY) : stt);
  app.decorate('cards', cards === undefined ? createLithic(config.LITHIC_API_KEY, config.LITHIC_ENV) : cards);
  app.decorate('config', config);
  app.decorateRequest('userId', '');
  app.decorateRequest('lang', 'en');
  app.addHook('onRequest', async (req) => {
    req.lang = parseLang(req.headers['accept-language']) ?? 'en';
  });
  // POST endpoints without a body (approve, kill switch) must not fail when a client still sends a JSON content type.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || !String(body).trim()) return done(null, undefined);
    try {
      done(null, JSON.parse(String(body)));
    } catch {
      done(new ApiError(400, 'INVALID_JSON', 'The request body is not valid JSON.'), undefined);
    }
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((o) => o.trim()),
    // The default is GET,HEAD,POST; the web app also sends PATCH /me and PUT /permissions.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: '7d' } });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Behind Cloudflare the client can put anything in X-Forwarded-For; CF-Connecting-IP is set by Cloudflare itself.
    keyGenerator: (req) => {
      const cf = req.headers['cf-connecting-ip'];
      return (Array.isArray(cf) ? cf[0] : cf) ?? req.ip;
    },
    errorResponseBuilder: (_req, ctx) => new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again in {after}.', { after: ctx.after }),
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) {
      // String values that are themselves keys ("User" in "{what} not found.") are translated too.
      return reply.status(err.statusCode).send({ error: { code: err.code, message: render({ key: err.message, params: err.params }, req.lang) } });
    }
    const e = err as { statusCode?: number; code?: string; message?: string; cause?: { code?: string } };
    // 22003 = numeric value out of range: a total grew past the int4 money columns.
    if (e.code === '22003' || e.cause?.code === '22003') {
      return reply.status(400).send({ error: { code: 'AMOUNT_TOO_LARGE', message: t('That amount is too large.', undefined, req.lang) } });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: e.code ?? `HTTP_${e.statusCode}`, message: e.message ?? 'Bad request.' } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'INTERNAL', message: t('Something went wrong on our side. Try again.', undefined, req.lang) } });
  });
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: t('No route {route}.', { route: `${req.method} ${req.url}` }, req.lang) } }),
  );

  async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
    try {
      await req.jwtVerify();
    } catch {
      throw new ApiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
    }
    const [u] = await db.select({ id: users.id, language: users.language }).from(users).where(eq(users.id, req.user.sub));
    if (!u) throw new ApiError(401, 'UNAUTHORIZED', 'Your account no longer exists. Sign in again.');
    req.userId = u.id;
    // The app sends its language with every request; remember it for pushes, Telegram and the daily report.
    const asked = parseLang(req.headers['accept-language']);
    if (asked && asked !== u.language) {
      await db.update(users).set({ language: asked }).where(eq(users.id, u.id));
      // Untouched suggestions are text in the old language: they are rebuilt on the next read.
      await db.delete(recommendations).where(and(eq(recommendations.userId, u.id), eq(recommendations.status, 'new')));
    }
  }

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true }));
      await api.register(authRoutes);
      await api.register(lithicRoutes);
      await api.register(async (priv) => {
        priv.addHook('onRequest', authenticate);
        for (const routes of [meRoutes, bankRoutes, cardRoutes, transactionRoutes, summaryRoutes, agentRoutes, permissionRoutes, auditRoutes, telegramRoutes, familyRoutes]) {
          await priv.register(routes);
        }
      });
    },
    { prefix: '/api/v1' },
  );
  return app;
}
