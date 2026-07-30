import * as path from 'path';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import type { DailyRotateFileTransportOptions } from 'winston-daily-rotate-file';

/**
 * winston 로거 구성 (SR §8).
 * 최종적으로 두 개의 로그 파일을 만든다:
 *  - server.log : 서버 자체 로그(Nest 프레임워크) + API 요청 로그
 *  - error.log  : 서버 내부/푸시 전송 에러의 Call Stack
 * logback-spring.xml 의 appender 구성과 동일한 역할을 한다.
 *
 * 로거는 싱글턴으로 관리한다. 같은 파일에 여러 transport 가 붙어
 * 심볼릭 링크가 충돌하는 것을 막기 위함이다.
 */

function logDir(): string {
  return process.env.LOG_DIR ?? 'logs';
}

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, context } = info;
    const ctx = context ? ` [${String(context)}]` : '';
    const base = `${String(timestamp)} ${level.toUpperCase()}${ctx} ${String(message)}`;
    return stack ? `${base}\n${String(stack)}` : base;
  }),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  fileFormat,
);

function rotateFile(filename: string, level: string): winston.transport {
  const options: DailyRotateFileTransportOptions = {
    level,
    dirname: logDir(),
    filename: filename.replace('.log', '.%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '7d',
    // 심볼릭 링크로 항상 현재 파일을 server.log / error.log 로 노출한다.
    createSymlink: true,
    symlinkName: path.basename(filename),
    format: fileFormat,
  };
  return new winston.transports.DailyRotateFile(options);
}

let serverLogger: winston.Logger | undefined;
let errorLogger: winston.Logger | undefined;

/** server.log + console 로 출력하는 메인 로거 (Nest 앱 로거 + API 로그). */
export function createServerLogger(): winston.Logger {
  if (!serverLogger) {
    serverLogger = winston.createLogger({
      level: 'info',
      transports: [
        new winston.transports.Console({ format: consoleFormat }),
        rotateFile('server.log', 'info'),
      ],
    });
  }
  return serverLogger;
}

/** error.log + console 로 출력하는 에러 전용 로거. */
export function createErrorLogger(): winston.Logger {
  if (!errorLogger) {
    errorLogger = winston.createLogger({
      level: 'error',
      transports: [
        new winston.transports.Console({ format: consoleFormat }),
        rotateFile('error.log', 'error'),
      ],
    });
  }
  return errorLogger;
}
