export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500 | 503;

export class ApiError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
