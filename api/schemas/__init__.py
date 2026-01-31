"""
API schemas package. Import from submodules or from this package.

Example:
    from api.schemas import CourseResponse, SyllabusStepResponse
    from api.schemas.course_schemas import CourseResponse
"""

from api.schemas.auth_schemas import (
    AuthTokenPayload,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RegisterRequest,
    RegisterResponse,
)
from api.schemas.user_schemas import User
from api.schemas.chat_schemas import (
    ChatRequest,
    ChatResponse,
    EventSourceResponse,
    ChatHistoryItem,
    ChatHistoryResponse,
    ConversationResponse,
    MessageResponse,
    ConversationListResponse,
    MessageListResponse,
    ForkRequest,
    ForkResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from api.schemas.course_schemas import (
    CreateCourseRequest,
    CourseResponse,
    CourseListResponse,
    SyllabusDraftModule,
    SyllabusDraftResponse,
    ConfirmSyllabusResponse,
    ModuleResponse,
    CourseModulesResponse,
)
from api.schemas.user_progress_schemas import (
    UserProgressModule,
    UserProgressCourse,
    UserProgressResponse,
)
from api.schemas.syllabus_run_schemas import (
    StartSyllabusRunResponse,
    SyllabusBuilderState,
    SyllabusBuilderPayload,
    SyllabusStepResponse,
    SyllabusRunResponse,
    SyllabusRunListItem,
    ListSyllabusRunsResponse,
)

__all__ = [
    # auth
    "AuthTokenPayload",
    "LoginRequest",
    "LoginResponse",
    "LogoutResponse",
    "RegisterRequest",
    "RegisterResponse",
    # user
    "User",
    # chat
    "ChatRequest",
    "ChatResponse",
    "EventSourceResponse",
    "ChatHistoryItem",
    "ChatHistoryResponse",
    "ConversationResponse",
    "MessageResponse",
    "ConversationListResponse",
    "MessageListResponse",
    "ForkRequest",
    "ForkResponse",
    "SendMessageRequest",
    "SendMessageResponse",
    # course
    "CreateCourseRequest",
    "CourseResponse",
    "CourseListResponse",
    "SyllabusDraftModule",
    "SyllabusDraftResponse",
    "ConfirmSyllabusResponse",
    "ModuleResponse",
    "CourseModulesResponse",
    # user progress
    "UserProgressModule",
    "UserProgressCourse",
    "UserProgressResponse",
    # syllabus run
    "StartSyllabusRunResponse",
    "SyllabusBuilderState",
    "SyllabusBuilderPayload",
    "SyllabusStepResponse",
    "SyllabusRunResponse",
    "SyllabusRunListItem",
    "ListSyllabusRunsResponse",
]
