from api.config import Base
from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey, Text, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    preferences = Column(JSON)


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(String, primary_key=True, index=True)  # uuid
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    parent_conversation_id = Column(String, ForeignKey("conversations.id"), nullable=True)
    forked_from_message_id = Column(String, ForeignKey("messages.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    title = Column(String, nullable=True)

    user = relationship("User", backref="conversations", foreign_keys=[user_id])
    # Disambiguate: Conversation links to Message both via Message.conversation_id and forked_from_message_id.
    messages = relationship(
        "Message",
        backref="conversation",
        cascade="all, delete-orphan",
        foreign_keys="Message.conversation_id",
    )
    forked_from_message = relationship("Message", foreign_keys=[forked_from_message_id], uselist=False)
    parent = relationship("Conversation", foreign_keys=[parent_conversation_id], remote_side=[id], uselist=False)


class Message(Base):
    __tablename__ = "messages"
    id = Column(String, primary_key=True, index=True)  # uuid
    conversation_id = Column(String, ForeignKey("conversations.id"), index=True, nullable=False)
    role = Column(String, nullable=False)  # user|assistant|system|tool
    content = Column(Text, nullable=False)
    seq = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Course(Base):
    __tablename__ = "courses"
    id = Column(String, primary_key=True, index=True)  # uuid
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    goals = Column(Text, nullable=True)
    syllabus_draft = Column(JSON, nullable=True)  # list of module specs
    syllabus_confirmed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", backref="courses", foreign_keys=[user_id])
    modules = relationship("Module", backref="course", cascade="all, delete-orphan")


class Module(Base):
    __tablename__ = "modules"
    id = Column(String, primary_key=True, index=True)  # uuid
    course_id = Column(String, ForeignKey("courses.id"), index=True, nullable=False)
    title = Column(String, nullable=False)
    order_index = Column(Integer, nullable=False)
    objectives = Column(JSON, nullable=False)  # list[str]
    estimated_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    progress = relationship("ModuleProgress", backref="module", cascade="all, delete-orphan")
    attempts = relationship("ModuleTestAttempt", backref="module", cascade="all, delete-orphan")


class ModuleProgress(Base):
    __tablename__ = "module_progress"
    id = Column(String, primary_key=True, index=True)  # uuid
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    module_id = Column(String, ForeignKey("modules.id"), index=True, nullable=False)
    best_score = Column(Float, default=0.0, nullable=False)
    attempts_count = Column(Integer, default=0, nullable=False)
    passed = Column(Boolean, default=False, nullable=False)
    passed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", backref="module_progress", foreign_keys=[user_id])


class ModuleTestAttempt(Base):
    __tablename__ = "module_test_attempts"
    id = Column(String, primary_key=True, index=True)  # uuid
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    module_id = Column(String, ForeignKey("modules.id"), index=True, nullable=False)
    conversation_id = Column(String, ForeignKey("conversations.id"), index=True, nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    score = Column(Float, nullable=True)
    passed = Column(Boolean, default=False, nullable=False)
    feedback = Column(JSON, nullable=True)

    user = relationship("User", backref="module_test_attempts", foreign_keys=[user_id])
    conversation = relationship("Conversation", foreign_keys=[conversation_id])


class SyllabusRun(Base):
    __tablename__ = "syllabus_runs"
    id = Column(String, primary_key=True, index=True)  # uuid
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), index=True, nullable=False)
    status = Column(String, nullable=False, default="running")  # running|completed|failed
    phase = Column(String, nullable=True)  # generate|critic|revise|finalize
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    result = Column(JSON, nullable=True)  # normalized modules
    critic = Column(JSON, nullable=True)  # critic verdict/report
    error = Column(Text, nullable=True)

    user = relationship("User", backref="syllabus_runs", foreign_keys=[user_id])
    course = relationship("Course", backref="syllabus_runs", foreign_keys=[course_id])
    events = relationship("SyllabusEvent", backref="run", cascade="all, delete-orphan")


class SyllabusEvent(Base):
    __tablename__ = "syllabus_events"
    id = Column(String, primary_key=True, index=True)  # uuid
    run_id = Column(String, ForeignKey("syllabus_runs.id"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    phase = Column(String, nullable=True)
    type = Column(String, nullable=False)  # phase_start|token|result|error|done
    data = Column(JSON, nullable=True)


class ModuleLearningSession(Base):
    __tablename__ = "module_learning_sessions"
    id = Column(String, primary_key=True, index=True)  # uuid
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    module_id = Column(String, ForeignKey("modules.id"), index=True, nullable=False)
    conversation_id = Column(String, ForeignKey("conversations.id"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", backref="module_learning_sessions", foreign_keys=[user_id])
    module = relationship("Module", foreign_keys=[module_id])
    conversation = relationship("Conversation", foreign_keys=[conversation_id])

