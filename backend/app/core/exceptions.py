from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Access forbidden"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class ValidationError(AppError):
    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)


class StorageQuotaError(AppError):
    def __init__(self, message: str = "Storage quota exceeded"):
        super().__init__(message, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message},
        )
