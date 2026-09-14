const winston = require('winston');

const redactPII = winston.format((info) => {
  if (info.message && typeof info.message === 'object') {
    info.message = JSON.stringify(info.message);
  }
  
  if (info.data && typeof info.data === 'object') {
    const dataString = JSON.stringify(info.data);
    const redactedDataString = dataString
      .replace(/"password":"[^"]+"/g, '"password":"[REDACTED]"')
      .replace(/"email":"[^"]+"/g, '"email":"[REDACTED]"')
      .replace(/"phone":"[^"]+"/g, '"phone":"[REDACTED]"');
    info.data = JSON.parse(redactedDataString);
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    redactPII(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = {
  info: (message, data = null) => logger.info(message, { data }),
  warn: (message, data = null) => logger.warn(message, { data }),
  error: (message, data = null) => logger.error(message, { data }),
  debug: (message, data = null) => logger.debug(message, { data }),
  success: (message, data = null) => logger.info("SUCCESS: " + message, { data })
};
