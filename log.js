const {transports, createLogger, format} = require('winston');

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),     
    transports: [
      new transports.File({ timestamp:true, filename: 'SmappeeApiError.log', level: 'error' }),
      new transports.File({ timestamp:true, filename: 'SmappeeApi.log', maxsize: 1024000 }),    
    ]
});

const info = (message) => {
    logger.info(message)
}
exports.info = info;

const error = (message) => {
    logger.error(message)
}
exports.error = error;