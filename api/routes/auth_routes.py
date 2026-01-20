from fastapi import APIRouter, HTTPException, Response, status, Depends, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from chat_agent.schemas.auth_schemas import LoginRequest, RegisterRequest, LoginResponse, RegisterResponse
from chat_agent.schemas.auth_schemas import LogoutResponse
from datetime import datetime, timedelta, timezone
from typing import Optional
from chat_agent.auth_utils import create_access_token, verify_token, verify_password
from chat_agent.schemas.auth_schemas import AuthTokenPayload
from chat_agent.models import get_user_by_email, create_user, User as UserModel
from chat_agent.schemas.user_schemas import User 
# Simplified authentication for demonstration (use proper JWT in production)





auth_routes = APIRouter()
security = HTTPBearer()

def get_current_user(access_token: Optional[str] = Cookie(None)):
    """Get current user from HTTP-only cookie."""
    print(f"Access token: {access_token}")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated - no access_token cookie found"
        )

    # Try to find a user whose token matches
    payload = verify_token(access_token)
    print(f"Payload: {payload}")
    if payload is None or payload.sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    user = get_user_by_email(payload.sub)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return User(email=user.email, preferences=user.preferences, hashed_password=user.hashed_password)

def set_auth_cookie(response: Response, user: UserModel) -> None:

    token = create_access_token(AuthTokenPayload(sub=user.email, exp=datetime.now(timezone.utc) + timedelta(minutes=30)))
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=30 * 60,
    )

def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=False,
        samesite="lax"
    )
@auth_routes.post("/login")
def login(request: LoginRequest, response: Response) -> LoginResponse:
    """Authenticate user and set HTTP-only cookie with token."""
    user = get_user_by_email(request.email)
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    try:
        set_auth_cookie(response, user)
        return LoginResponse(message="Login successful - HTTP-only cookie set!", token_set=True)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@auth_routes.post("/register")
def register(request: RegisterRequest, response: Response) -> RegisterResponse:
    """Register a new user."""
    if get_user_by_email(request.email):
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
        user = create_user(request.email, request.password)
        set_auth_cookie(response, user)
        return RegisterResponse(message="Registration successful")
    except Exception as e:
        print(f"Error creating user: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@auth_routes.post("/logout")
def logout(response: Response) -> LogoutResponse:
    """Clear the authentication cookie."""
    try:
        clear_auth_cookie(response)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    return LogoutResponse(message="Logout successful - cookie cleared")

@auth_routes.get("/me")
def get_current_user_info(current_user = Depends(get_current_user)):
    """Protected route to test authentication - returns current user info."""
    return current_user