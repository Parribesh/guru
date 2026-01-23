from fastapi import APIRouter, HTTPException, Response, status, Depends, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from api.schemas.auth_schemas import LoginRequest, RegisterRequest, LoginResponse, RegisterResponse, LogoutResponse
from api.utils.jwt import verify_password
from api.schemas.user_schemas import User 
from api.utils.auth import get_current_user, get_user_by_email, set_auth_cookie, clear_auth_cookie, create_user
from sqlalchemy.orm import Session
from api.config import get_db
from api.utils.auth import authenticate_user
from api.utils.logger import configure_logging

auth_routes = APIRouter()
security = HTTPBearer()
logger = configure_logging()


    
@auth_routes.post("/login")
def login(request: LoginRequest, response: Response, db: Session = Depends(get_db)) -> LoginResponse:
    """Authenticate user and set HTTP-only cookie with token."""
    user = authenticate_user(request.email, request.password, db)
    if not user:
        logger.warning("login failed email=%s", request.email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    set_auth_cookie(response, user)
    logger.info("login ok email=%s", request.email)
    return LoginResponse(message="Login successful - HTTP-only cookie set!", token_set=True)


@auth_routes.post("/register")
def register(request: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> RegisterResponse:
    """Register a new user."""
    if get_user_by_email(request.email, db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    if request.password != request.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )

    try:
        user = create_user(request.email, request.password, db)
        set_auth_cookie(response, user)
        logger.info("register ok email=%s", request.email)
        return RegisterResponse(message="Registration successful")
    except Exception as e:
        logger.exception("register failed email=%s", request.email)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@auth_routes.post("/logout")
def logout(response: Response) -> LogoutResponse:
    """Clear the authentication cookie."""
    try:
        clear_auth_cookie(response)
        logger.info("logout ok")
    except Exception as e:
        logger.exception("logout failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    return LogoutResponse(message="Logout successful - cookie cleared")

@auth_routes.get("/me")
def get_current_user_info(current_user = Depends(get_current_user)):
    """Protected route to test authentication - returns current user info."""
    return current_user