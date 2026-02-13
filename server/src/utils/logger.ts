import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logDir = 'logs';

const logFormat = winston.format.printf(({ timestamp, level, message, ...data }) => {
    return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(data).length ? JSON.stringify(data) : ''
        }`;
});

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        logFormat
    ),
    transports: [
        // 콘솔 출력
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            ),
        }),
        // 파일 출력 (Daily Rotate)
        new DailyRotateFile({
            filename: path.join(logDir, 'app-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            level: 'info',
        }),
        // 에러 파일 별도 보관
        new DailyRotateFile({
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
            level: 'error',
        }),
    ],
});

// 편의를 위한 combined log 파일 (tail -f 로 보기 가장 좋음)
const combinedLogFile = new winston.transports.File({
    filename: path.join(logDir, 'combined.log'),
    level: 'info'
});
logger.add(combinedLogFile);

export default logger;
