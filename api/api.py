from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from api.routes.auth_routes import auth_routes
from api.routes.conversation_routes import conversation_routes
from api.routes.course_routes import course_routes
from api.routes.session_routes import session_routes
from api.routes.syllabus_routes import syllabus_routes
from api.config import create_db 
from api.utils.logger import configure_logging, set_request_id, clear_request_id
from fastapi import Request
from starlette.responses import Response, JSONResponse
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException

app = FastAPI()
logger = configure_logging()
create_db()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def request_logger(request: Request, call_next):
    # NOTE: EventSource cannot set custom headers; allow request id via query param as a fallback.
    rid = set_request_id(request.headers.get("x-request-id") or request.query_params.get("rid"))
    try:
        logger.info("request start method=%s path=%s client=%s", request.method, request.url.path, request.client)
        response: Response = await call_next(request)
        logger.info("request end status=%s method=%s path=%s", response.status_code, request.method, request.url.path)
        response.headers["x-request-id"] = rid
        return response
    except Exception:
        logger.exception("request error method=%s path=%s", request.method, request.url.path)
        raise
    finally:
        clear_request_id()


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    # Log server-side errors with stack traces; client errors as warnings.
    if exc.status_code >= 500:
        logger.exception("http error status=%s method=%s path=%s detail=\n%s", exc.status_code, request.method, request.url.path, exc.detail)
    else:
        logger.warning("http error status=%s method=%s path=%s detail=\n%s", exc.status_code, request.method, request.url.path, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning("validation error method=%s path=%s errors=\n%s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak internal exception details to clients.
    logger.exception("unhandled error method=%s path=%s", request.method, request.url.path)
    return JSONResponse(
        status_code=HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal Server Error"},
    )


@app.get("/")
def read_root():
    return {"message": "ML-Guru is Healthy"}

app.include_router(auth_routes, prefix="/auth")
app.include_router(conversation_routes, prefix="/guru")
app.include_router(course_routes, prefix="/guru")
app.include_router(session_routes, prefix="/guru")
app.include_router(syllabus_routes, prefix="/guru")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)