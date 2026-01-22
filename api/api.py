from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from api.routes.auth_routes import auth_routes
from api.routes.guru_routes import guru_routes
from api.config import create_db 
app = FastAPI()
create_db()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "ML-Guru is Healthy"}

app.include_router(auth_routes, prefix="/auth")
app.include_router(guru_routes, prefix="/guru")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)