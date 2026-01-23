from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from api.routes.auth_routes import auth_routes
from api.routes.guru_routes import guru_routes
from api.config import create_db 
from api.utils.logger import configure_logging, set_request_id, clear_request_id
from fastapi import Request
from starlette.responses import Response
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
    rid = set_request_id(request.headers.get("x-request-id"))
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

@app.get("/")
def read_root():
    return {"message": "ML-Guru is Healthy"}

app.include_router(auth_routes, prefix="/auth")
app.include_router(guru_routes, prefix="/guru")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)