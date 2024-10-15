import pino from 'pino';

const DEFAULT_LOG_LEVEL = 'info';

export default pino({
  level: process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});
