import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),
  redact: [
    'password',
    'secret',
    'token',
    'authorization',
    'cookie',
    'stripe_webhook_secret',
    'supabase_service_role_key',
    'abn',
  ],
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
})

export default logger
