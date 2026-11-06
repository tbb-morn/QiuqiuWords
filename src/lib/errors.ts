export class AppError extends Error {
  readonly code: string;

  constructor(message: string, code = 'app_error') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) {
    if (error.name === 'ConstraintError') {
      return '词库中已经有这个单词啦';
    }
    return error.message;
  }
  return '出了点小问题，请再试一次';
}
