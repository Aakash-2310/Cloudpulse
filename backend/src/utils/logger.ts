type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

function write(level: Level, message: string, meta?: unknown): void {
  if (order[level] < order[minLevel]) return;
  const entry: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    message,
  };
  if (meta !== undefined) {
    entry.meta = meta instanceof Error ? { name: meta.name, message: meta.message, stack: meta.stack } : meta;
  }
  const line = process.env.NODE_ENV === 'production'
    ? JSON.stringify(entry)
    : `[${entry.time}] ${level.toUpperCase().padEnd(5)} ${message}${meta !== undefined ? ' ' + JSON.stringify(entry.meta) : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
