export function createHttpError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export function sendError(res, error) {
  const status = error?.statusCode || 500
  res.status(status).json({
    ok: false,
    code: error?.code || 'INTERNAL_ERROR',
    error: error?.message || '알 수 없는 오류가 발생했습니다.'
  })
}
