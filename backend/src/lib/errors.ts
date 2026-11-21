import type { Msg } from '../i18n';

// Every error leaves the API as { error: { code, message } } (PLAN.md §11).
// `message` is the English text and the translation key; `params` fill its {placeholders}. The error handler
// translates it into the request's language.
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public params?: Msg['params'],
  ) {
    super(message);
  }
}

// What may be "not found", so each name is translated: msg('User') msg('Request') msg('Member') msg('Action') msg('Recommendation') msg('Account') msg('Card')
export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', '{what} not found.', { what });
