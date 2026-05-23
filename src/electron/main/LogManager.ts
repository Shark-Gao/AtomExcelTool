/**
 * 日志管理系统 - 将所有日志和错误输出到文件
 * 支持同时输出到控制台和文件
 */

import { join, dirname } from 'path'
import { existsSync, mkdirSync, appendFileSync } from 'fs'
import { app } from 'electron'

export class LogManager {
  private static instance: LogManager
  private logFilePath: string
  private logDir: string
  private isInitialized = false

  private constructor() {
    // 开发模式：项目根目录/logs
    // 生产模式：EXE 同级目录/logs
    if (!app.isPackaged) {
      this.logDir = join(__dirname, '../../..', 'logs')
    } else {
      this.logDir = join(dirname(app.getPath('exe')), 'logs')
    }

    // 确保目录存在
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }

    // 生成日志文件名：logs/app-YYYY-MM-DD-HH-mm-ss.log
    const now = new Date()
    const timestamp = now
      .toISOString()
      .replace(/[T:.]/g, '-')
      .replace('Z', '')
      .slice(0, -4) // 移除毫秒
    
    this.logFilePath = join(this.logDir, `app-${timestamp}.log`)
  }

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager()
    }
    return LogManager.instance
  }

  /**
   * 初始化日志系统 - 重定向 console 方法
   */
  public initialize(): void {
    if (this.isInitialized) {
      return
    }

    this.writeLog(`\n${'='.repeat(80)}`)
    this.writeLog(`应用启动 - ${new Date().toISOString()}`)
    this.writeLog(`${'='.repeat(80)}\n`)

    // 保存原始的 console 方法
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn
    const originalInfo = console.info

    // 重定向 console.log
    console.log = (...args: any[]) => {
      originalLog(...args)
      this.writeLog(`[LOG] ${this.formatArgs(args)}`)
    }

    // 重定向 console.error
    console.error = (...args: any[]) => {
      originalError(...args)
      this.writeLog(`[ERROR] ${this.formatArgs(args)}`)
    }

    // 重定向 console.warn
    console.warn = (...args: any[]) => {
      originalWarn(...args)
      this.writeLog(`[WARN] ${this.formatArgs(args)}`)
    }

    // 重定向 console.info
    console.info = (...args: any[]) => {
      originalInfo(...args)
      this.writeLog(`[INFO] ${this.formatArgs(args)}`)
    }

    // 捕获未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason: any) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      const stack = reason instanceof Error ? reason.stack : ''
      this.writeLog(`[UNHANDLED REJECTION] ${message}`)
      if (stack) {
        this.writeLog(`堆栈: ${stack}`)
      }
      originalError('[UNHANDLED REJECTION]', reason)
    })

    // 捕获未处理的异常
    process.on('uncaughtException', (error: Error) => {
      this.writeLog(`[UNCAUGHT EXCEPTION] ${error.message}`)
      this.writeLog(`堆栈: ${error.stack}`)
      originalError('[UNCAUGHT EXCEPTION]', error)
    })

    this.isInitialized = true
    this.writeLog('日志系统初始化完成\n')
  }

  /**
   * 格式化参数为字符串
   */
  private formatArgs(args: any[]): string {
    return args
      .map(arg => {
        if (typeof arg === 'string') {
          return arg
        }
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack}`
        }
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2)
        }
        return String(arg)
      })
      .join(' ')
  }

  /**
   * 写入日志到文件
   */
  private writeLog(message: string): void {
    try {
      const timestamp = new Date().toISOString()
      const logLine = `[${timestamp}] ${message}\n`
      appendFileSync(this.logFilePath, logLine, 'utf-8')
    } catch (error) {
      // 如果写入失败，至少输出到控制台
      console.error('写入日志文件失败:', error)
    }
  }

  /**
   * 获取日志文件路径
   */
  public getLogFilePath(): string {
    return this.logFilePath
  }

  /**
   * 获取日志目录
   */
  public getLogDir(): string {
    return this.logDir
  }

  /**
   * 手动写入日志
   */
  public log(message: string): void {
    console.log(message)
  }

  /**
   * 手动写入错误日志
   */
  public error(message: string): void {
    console.error(message)
  }

  /**
   * 手动写入警告日志
   */
  public warn(message: string): void {
    console.warn(message)
  }

  /**
   * 手动写入信息日志
   */
  public info(message: string): void {
    console.info(message)
  }
}
