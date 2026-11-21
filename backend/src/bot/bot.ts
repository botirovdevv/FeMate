// grammY bot, long polling (PLAN.md §4). Runs inside the API process when TELEGRAM_BOT_TOKEN is set.
import type { AgentAction, VoiceLanguage } from '@femate/shared';
import type { FastifyBaseLogger } from 'fastify';
import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';

import type { LlmProvider } from '../agent/llm/provider';
import type { Db } from '../db/client';
import { ApiError } from '../lib/errors';
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, type SttProvider } from '../stt/groq';
import { help, dailyReport, decideAction, describeAction, handleText, handleVoice, linkChat, unlinkChat, userByChat, type Report } from './core';
import { LANGS, parseLang, t, type Lang } from '../i18n';

type Ctx = Context & { userId?: string; voiceLanguage?: VoiceLanguage; lang?: Lang };

const notLinked = (lang: Lang) =>
  t('This chat isn’t linked yet. In the FeMate app open Settings → Telegram bot → Get a link code, then send /start <code> here.', undefined, lang);
/** Before a chat is linked: Telegram's language for the person. */
const tgLang = (ctx: Context): Lang => parseLang(ctx.from?.language_code) ?? 'en';

// /start codes are 6 digits and live 10 minutes; 5 tries per chat per 10 minutes keeps guessing useless.
const LINK_TRIES = 5;
const LINK_WINDOW_MS = 10 * 60_000;

export const actionKeyboard = (a: AgentAction, lang: Lang = 'en') =>
  new InlineKeyboard().text(`✅ ${t('Approve', undefined, lang)}`, `act:approve:${a.id}`).text(`❌ ${t('Reject', undefined, lang)}`, `act:reject:${a.id}`);

export function createBot(token: string, deps: { db: Db; llm: LlmProvider; stt: SttProvider | null; log: FastifyBaseLogger }) {
  const { db, llm, stt, log } = deps;
  const bot = new Bot<Ctx>(token);
  const tries = new Map<string, { n: number; until: number }>();

  async function sendReport(chatId: string, r: Report) {
    await bot.api.sendMessage(chatId, r.text);
    for (const a of r.pending) await bot.api.sendMessage(chatId, describeAction(a, r.currency, r.lang), { reply_markup: actionKeyboard(a, r.lang) });
  }

  // Only one-to-one chats: in a group anyone could tap Approve on a transfer.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await next();
  });

  bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const code = ctx.match.trim();
    if (!code) {
      const u = await userByChat(db, chatId);
      if (u) return ctx.reply(`${t('Welcome back, {name}!', { name: u.name }, u.language)}\n\n${help(u.language)}`);
      return ctx.reply(`${t('Hi! I’m FeMate, your money helper.', undefined, tgLang(ctx))}\n\n${notLinked(tgLang(ctx))}`);
    }
    const now = Date.now();
    const prev = tries.get(chatId);
    const n = prev && prev.until > now ? prev.n + 1 : 1;
    tries.set(chatId, { n, until: prev && prev.until > now ? prev.until : now + LINK_WINDOW_MS });
    if (n > LINK_TRIES) return ctx.reply(t('Too many tries. Wait 10 minutes and get a fresh code in the app.', undefined, tgLang(ctx)));
    return ctx.reply(await linkChat(db, chatId, code, tgLang(ctx)));
  });

  bot.command('help', async (ctx) => {
    const u = ctx.chat ? await userByChat(db, String(ctx.chat.id)) : null;
    return ctx.reply(help(u?.language ?? tgLang(ctx)));
  });

  // Everything below needs a linked account.
  bot.use(async (ctx, next) => {
    if (!ctx.chat) return;
    const u = await userByChat(db, String(ctx.chat.id));
    if (!u) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: t('This chat isn’t linked to FeMate.', undefined, tgLang(ctx)) });
      else await ctx.reply(notLinked(tgLang(ctx)));
      return;
    }
    ctx.userId = u.id;
    ctx.voiceLanguage = u.voiceLanguage;
    ctx.lang = u.language;
    await next();
  });

  bot.command('today', async (ctx) => {
    await sendReport(String(ctx.chat.id), await dailyReport(db, ctx.userId!));
  });

  bot.command('unlink', async (ctx) => ctx.reply(await unlinkChat(db, ctx.userId!)));

  bot.on('message:voice', async (ctx) => {
    if (!stt) return ctx.reply(t('Voice messages aren’t on yet. Type it instead, like “taxi 20000”.', undefined, ctx.lang));
    const v = ctx.message.voice;
    if (v.duration > MAX_AUDIO_SECONDS || (v.file_size ?? 0) > MAX_AUDIO_BYTES) {
      return ctx.reply(t('Keep voice notes under {n} seconds, like “taxi twenty thousand”.', { n: MAX_AUDIO_SECONDS }, ctx.lang));
    }
    await ctx.replyWithChatAction('typing');
    const file = await ctx.getFile();
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());
    try {
      const transcript = await stt.transcribe({ data, filename: 'voice.ogg', mimeType: v.mime_type ?? 'audio/ogg', language: ctx.voiceLanguage });
      return ctx.reply(await handleVoice(db, llm, ctx.userId!, transcript));
    } catch (e) {
      if (e instanceof ApiError) return ctx.reply(e.message);
      throw e;
    }
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return ctx.reply(help(ctx.lang));
    await ctx.replyWithChatAction('typing');
    return ctx.reply(await handleText(db, llm, ctx.userId!, ctx.message.text));
  });

  bot.on('callback_query:data', async (ctx) => {
    const m = ctx.callbackQuery.data.match(/^act:(approve|reject):([\w-]+)$/);
    if (!m) return ctx.answerCallbackQuery();
    const result = await decideAction(db, ctx.userId!, m[2]!, m[1] as 'approve' | 'reject');
    await ctx.answerCallbackQuery({ text: result.slice(0, 190) });
    const original = ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : '';
    await ctx.editMessageText(`${original ?? ''}\n\n${result}`.trim()).catch(() => undefined);
  });

  bot.catch((err) => {
    const e = err.error;
    log.error({ err: e instanceof GrammyError ? e.description : e }, 'telegram bot error');
    err.ctx.reply(t('Something went wrong on my side. Try again in a minute.', undefined, (err.ctx as Ctx).lang ?? tgLang(err.ctx))).catch(() => undefined);
  });

  return {
    bot,
    sendReport,
    async sendText(chatId: string, text: string) {
      await bot.api.sendMessage(chatId, text);
    },
    async start() {
      // Commands and descriptions in each language; English is also the default for any other language.
      for (const lang of LANGS) {
        const opts = lang === 'en' ? {} : { language_code: lang };
        const say = (key: string) => t(key, undefined, lang);
        await bot.api.setMyCommands(
          [
            { command: 'today', description: say('Today’s report') },
            { command: 'help', description: say('What I can do') },
            { command: 'unlink', description: say('Disconnect this chat') },
          ],
          opts,
        );
        await bot.api.setMyDescription(
          say('FeMate tracks your spending and helps you save. Add expenses by text, forward bank SMS, get a daily report. I never move money without your tap.'),
          opts,
        );
        await bot.api.setMyShortDescription(say('Your AI money helper: expenses, daily report, savings.'), opts);
      }
      void bot.start({ onStart: (me) => log.info(`Telegram bot @${me.username} is polling`) });
    },
    stop: () => bot.stop(),
  };
}
