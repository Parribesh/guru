from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from chat_agent.api.routes.auth_routes import auth_routes
from chat_agent.api.routes.guru_routes import guru_routes
from chat_agent import config
app = FastAPI()
config.create_db()
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