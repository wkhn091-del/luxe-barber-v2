import { isProd } from '../config/env.js';

/** Structured in production, readable in development. */
function emit(level, msg, meta = {}) {
  if (isProd) {
    console[level === 'debug' ? 'log' : level](
      JSON.stringify({ level, msg, ts: new Date().toISOString(), ...meta })
    );
  } else {
    const tail = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console[level === 'debug' ? 'log' : level](`[${level}] ${msg}${tail}`);
  }
}

export const logger = {
  debug: (m, meta) => !isProd && emit('debug', m, meta),
  info: (m, meta) => emit('info', m, meta),
  warn: (m, meta) => emit('warn', m, meta),
  error: (m, meta) => emit('error', m, meta),
};
