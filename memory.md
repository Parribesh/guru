# ML-Guru App Blueprint (token-dense reference)

## 1. App overview
- **Stack**: FastAPI, SQLAlchemy, LangGraph/agents, Ollama LLM, ChromaDB (optional RAG).
- **Core flows**: Auth → Courses → Syllabus (draft → confirm) → Sessions (learning/test/chat/syllabus) → Module progression.

---

## 2. Data model (critical entities)

- **User**: id, email, hashed_password, preferences.
- **Course**: id, user_id, title, subject, goals, syllabus_draft (JSON: `{modules: [...]}`), syllabus_confirmed (bool). No Module rows until confirm.
- **Module**: id, course_id, title, order_index, objectives (JSON list), estimated_minutes. Created only on syllabus confirm.
- **ModuleProgress**: id, user_id, module_id, best_score, attempts_count, passed, passed_at, updated_at. One per (user, module); created on confirm.
- **Session** (api/models/session.py): id, user_id, session_type (learning|test|chat|syllabus), status (active|paused|completed|cancelled), conversation_id, module_id?, course_id?, agent_name, agent_metadata (e.g. system_prompt), session_state (e.g. progress snapshot), session_metadata, started_at, ended_at, last_activity_at.
- **Conversation**: id, user_id, parent_conversation_id?, forked_from_message_id?; holds Message(s).
- **Message** (api/models/models.py; table `messages`): id, conversation_id, role (user|assistant|system|tool), content, seq, created_at, interaction_metadata (JSON: retrieved_history, system_prompt, etc.). Canonical store for all chat/tutor/test turns; one row per turn.
- **SyllabusRun**: id, user_id, course_id, status, phase, result (JSON modules), error. Tracks one syllabus generation run.
- **SyllabusEvent**: run_id, phase, type, data. Events for that run (persisted for replay/debug).

---

## 3. Syllabus generation (agentic pipeline)

**Goal**: Build a modular, extensible syllabus from terminal outcomes → atomic skills → prerequisite DAG → sequenced modules → calibration → validation. Output is structured (Pydantic/JSON), deterministic, machine-usable.

**Architecture**: Multi-step pipeline; each stage has single responsibility, structured input, structured output, independently testable.

**Stages** (agents.syllabus_agent.agentic):
1. **LearningOutcomeGenerator** (LLM): course_title, subject, goals, target_level, time_budget → LearningOutcomeSet (6–15 terminal outcomes).
2. **SkillDecompositionAgent** (LLM): LearningOutcomeSet → SkillSet (atomic skills with outcome_ids, prerequisite_skill_ids). No flat topic list.
3. **PrerequisiteGraphBuilder** (pure): SkillSet → DependencyGraph (DAG via networkx; edges = prerequisite → dependent). Topological sort gives learning order.
4. **ModuleSequencer** (pure): DependencyGraph + SkillSet + time_budget → CurriculumModules. Topological sort + clustering into 6–10 modules; objectives from skill descriptions.
5. **DepthAndDifficultyCalibrator** (pure): CurriculumModules → CurriculumModules with depth_level (foundation/core/intermediate/advanced) and difficulty_score (0–1) by position.
6. **CurriculumValidator** (pure): outcomes + skills + graph + modules → ValidationResult (valid, coverage_issues, progression_issues, gap_issues, revision_hints). Can trigger revision loop.
7. **PersonalizationAgent** (optional): CurriculumModules + UserProfile → adjusted modules (default: pass-through).

**Pipeline logic**: Skills are atomic and dependency-aware; DAG models prerequisites; modules produced via topological sort + clustering; validation can request revisions; avoid vague topics.

**Entry point**: `generate_syllabus(course, target_level, time_budget, user_profile)` in agents.syllabus_agent.agentic. Returns SyllabusPipelineResult (modules for syllabus_draft, validation, outcome_ids, skill_ids, dependency_graph).

**Schemas**: LearningOutcome, LearningOutcomeSet; Skill, SkillSet; PrerequisiteEdge, DependencyGraph; CurriculumModule, CurriculumModules; ValidationResult; UserProfile; SyllabusPipelineInput, SyllabusPipelineResult.

**Integration**: Session-based syllabus flow (`_stream_syllabus_generation`) calls `generate_syllabus(course, ...)` from agents.syllabus_agent.agentic; event_callback adapts stage_start/stage_complete to pipeline_stage_start/complete for SSE. UI can preview syllabus before finalization.

---

## 4. Sessions: design and lifecycle

**Session types**: learning, test, chat, syllabus.

- **Create** (POST /guru/sessions): Requires session_type; for syllabus requires course_id; for learning/test requires module_id (and thus course).  
  - Creates Conversation.  
  - Resolves Module/Course; for learning loads ModuleProgress, builds tutor system prompt via `build_tutor_system_prompt()` (compressed=True), stores in agent_metadata and session_state (module_progress snapshot).  
  - SessionService.create_session(..., session_type, conversation_id, module_id, course_id, agent_name, agent_metadata, session_state).

- **Stream** (GET /guru/sessions/{id}/stream): SSE.  
  - **Syllabus session**: `_stream_syllabus_generation(session)`. Gets/creates SyllabusRun, calls agentic `generate_syllabus(course, event_callback=...)`; event adapter writes SyllabusEvent, updates run.phase, pushes to queue; loop yields SSE. On success: run.result=modules, course.syllabus_draft persisted, session COMPLETED. On failure: run.status=failed, session CANCELLED.  
  - **Other types**: Placeholder loop (keep-alive); real-time updates would be WebSocket/pub-sub later.

- **List/Get/End**: Standard CRUD; End sets status=COMPLETED and ended_at.

**Session context**: `get_session_context(session)` returns session + agent + state + session_metadata; if module_id set, adds module (from Module) and module.progress (from ModuleProgress); if course_id set, adds course and syllabus_outline (from Module table for that course).

---

## 5. Module progression (how session handles it)

- **Storage**: ModuleProgress per (user_id, module_id): best_score, attempts_count, passed, passed_at. Created when user confirms syllabus (one row per new module).

- **Learning session**: On create, tutor system prompt is built with progress_best_score, progress_attempts, progress_passed so the tutor can adapt. Session stores snapshot in session_state.module_progress. Actual update of ModuleProgress (e.g. after practice or assessment) is assumed to happen in assessment/test completion flow (not fully shown in session_service; course get returns progress for UI).

- **Test session**: Same session model; attempt_id can link to ModuleTestAttempt. Progress update (best_score, attempts_count, passed) would be done when test is submitted/evaluated (conversation or dedicated endpoint).

- **Ordering**: Modules have order_index. Course view returns modules ordered by order_index; progression is linear (module 1 → 2 → …). Frontend/UX can gate “next module” on current module passed.

**Summary**: Session carries module/course context and progress snapshot; persistence of progress is in ModuleProgress and updated by the flow that completes learning/test (session provides context, not the single writer of progress).

---

## 6. API surface (minimal)

- Auth: POST /auth/register (email, password, confirm_password), /auth/login, /auth/logout, GET /auth/me.  
- Courses: GET/POST /guru/courses; POST /guru/courses/{id}/syllabus/confirm (draft → Module rows + ModuleProgress); GET /guru/courses/{id} (course + modules + per-module progress).  
- Syllabus (legacy): POST /guru/courses/{id}/syllabus/start, GET .../stream (alternative to session-based syllabus).  
- Sessions: POST /guru/sessions (create), POST /guru/sessions/{id}/messages (send message: persist user + assistant Message, sync to vector store), GET /guru/sessions/{id}/stream (SSE), GET /guru/sessions, GET /guru/sessions/{id}, POST /guru/sessions/{id}/end.  
- Conversations: under /guru (list, messages, fork).

---

## 7. Key files

- Syllabus: src/agents/syllabus_agent/agentic/ (generate_syllabus, pipeline.py, stages/, schemas.py).  
- Session: api/services/session_service.py (create, get, update_state, end, get_session_context, stream_session_events, _stream_syllabus_generation).  
- Routes: api/routes/session_routes.py (create_session, stream_session), api/routes/course_routes.py (confirm_syllabus, get_course with progress).  
- Prompts: api/utils/prompt_builder.py (tutor, critic, planner; syllabus prompts removed in favor of agentic).  
- Models: api/models/ (__init__.py exports Message, Conversation, User, Course, Module, ModuleProgress, Session, etc.); api/models/models.py (DB tables); api/models/session.py (Session, SessionType, SessionStatus).

---

## 8. Conventions

- Syllabus: always 6–10 modules; each 3–6 objectives, 30–120 min.  
- Session for syllabus: type=SYLLABUS, course_id set; stream runs pipeline and emits SSE until done/failed.  
- Progress: one ModuleProgress per (user, module); session reads it for context and tutor prompt; progress is updated by assessment/completion flow, not by session stream itself.

---

## 9. Memory architecture (conversation history + semantic retrieval)

**Canonical store**: Message table. Every user/assistant/system/tool turn should be persisted as a Message (conversation_id, role, content, seq, created_at, interaction_metadata). Conversation has many Messages; seq orders turns.

**Current layers**  
1. **DB**: Message rows. Created today in fork (copy messages to new conversation). No dedicated “send message” API that writes user + assistant Message rows for normal chat yet.  
2. **Utils**: `load_history_pairs(conversation_id, db)` → list of (user_content, assistant_content) from Message; `next_seq(conversation_id, db)`; `latest_system_prompt(conversation_id, db)`.  
3. **HistoryStore** (api/utils/history_store.py): ChromaDB collection `conversation_history`. Stores ConversationExchange (conversation_id, user_message, assistant_message, seq). `store_exchange(exchange)` embeds user message, stores full exchange in metadata. `retrieve_relevant_history(query, conversation_id, max_tokens, k)` returns (user, assistant) pairs for prompt context.  
4. **History manager** (api/utils/history_manager.py): `store_exchange_from_messages(conversation_id, user_message_id, assistant_message_id, db)` reads Message rows, builds exchange, calls HistoryStore.store_exchange. Called by **POST /guru/sessions/{id}/messages** after persisting user + assistant Message rows. `sync_conversation_history(conversation_id, db)` backfills all user/assistant pairs from Message into vector store (e.g. for existing conversations).  
5. **Agent memory**: ChatAgent uses Memory. (a) **ChatAgentMemory** (memory.py): in-memory list; no persistence. (b) **VectorMemory** (vector_memory.py): load() = retrieve_relevant_history(); save(input, result) = store_exchange() to HistoryStore. Uses agent_state.metadata (_user_message_id, _assistant_message_id, _message_seq) if set. So vector store is written by agent save(); DB Message is not written by agent.  
6. **Token budget**: `build_constrained_prompt(system, history, query)` truncates history; comment says “will be replaced by semantic retrieval”. When VectorMemory is used, the graph gets history from memory.load() (semantic); build_constrained_prompt may still be used elsewhere.

**Gaps and improvements**  
- **Single write path**: Implemented. POST /guru/sessions/{id}/messages: (1) Persist Message(role=user), (2) run agent with VectorMemory and _skip_memory_save, (3) persist Message(role=assistant), (4) call store_exchange_from_messages so vector store stays in sync.  
- **Who writes Message**: Send-message route (POST /guru/sessions/{id}/messages) creates both Message rows and calls store_exchange_from_messages. Agent uses _skip_memory_save so it does not call memory.save(); the route owns sync.  
- **Read path**: For UI: GET messages from DB (existing GET /conversations/{id}/messages). For agent context: keep using VectorMemory.retrieve_relevant_history (semantic) when VectorMemory is used; optionally fallback to load_history_pairs (DB) when vector store is empty or for simple truncation.  
- **delete_conversation_history**: HistoryStore.delete_conversation_history(conversation_id) is TODO (Chroma filter by conversation_id). Implement when needed for GDPR or cleanup.  
- **Summary**: Message = canonical; HistoryStore = semantic index over (user, assistant) pairs; sync via store_exchange_from_messages after each turn once Message write path exists.

---

## 10. Conversation and history structure (detail)

**next_seq(conversation_id, db)**  
- Returns the **next sequence number** for that conversation.  
- Implementation: find the Message row with the largest `seq` for this `conversation_id`; return `last.seq + 1`. If there are no messages, return `1`.  
- Purpose: when you append a new Message (user or assistant), you must give it a `seq` so order is well-defined. `next_seq` tells you “use this number for the next message.”  
- **Current use**: Defined in api/utils/common.py and imported in session_routes, but **no route calls it yet**. It will be used once we have a “send message” flow that inserts Message rows.

**How conversation history is created today**  
1. **Conversation row**  
   - Created when: (a) **POST /guru/sessions** (create session) — new Conversation(id=uuid, user_id), no Message rows. (b) **POST /guru/courses/{id}/syllabus/start** — same. (c) **POST /conversations/{id}/fork** — new Conversation with parent_conversation_id and forked_from_message_id.  
   - So every new session or syllabus run gets an empty Conversation (no Message rows).

2. **Message rows (the “history”)**  
   - Created **only** in **POST /conversations/{id}/fork**.  
   - Fork: user picks a message (from_message_id) in a conversation. We create a new Conversation, then **copy** all Message rows from the old conversation that have `seq <= pivot.seq` into the new conversation (new id, new conversation_id, same role, content, seq). So the new conversation’s “history” is a snapshot of the old one up to that message.  
   - There is **no** endpoint that “sends a user message” or “saves an assistant reply” as Message rows. So for normal chat/learning/test, the Conversation exists but stays **empty** (no Message rows). History for the agent comes from VectorMemory (vector store) or in-memory ChatAgentMemory, not from the Message table.

3. **Ordering and seq**  
   - Each Message has `seq` (integer). Order of turns = order by seq ascending.  
   - Typical pattern: user message seq=N, assistant message seq=N+1. So one “exchange” is two rows (user, assistant) with consecutive seq.  
   - Fork preserves seq when copying, so the forked conversation’s order is the same as the original up to the pivot.

4. **load_history_pairs(conversation_id, db)**  
   - Reads all Message rows for that conversation, ordered by seq ascending.  
   - Pairs consecutive user/assistant messages: when it sees role=user it keeps content; when it sees role=assistant it appends (pending_user, assistant_content) to the list and clears pending_user.  
   - Returns list of (user_content, assistant_content). So “history” for prompts is these pairs. If no Message rows exist (e.g. new session), this returns [].

**Send-message flow (POST /guru/sessions/{session_id}/messages)**  
- Allowed for ACTIVE learning, test, or chat sessions (not syllabus).  
- (1) Persist user Message with next_seq(conversation_id, db). (2) Run agent (chat/tutor) with VectorMemory and _skip_memory_save so the route owns persistence. (3) Persist assistant Message with next_seq. (4) Call store_exchange_from_messages(conversation_id, user_msg_id, assistant_msg_id, db) to sync the exchange to the vector history store. (5) Update session last_activity_at.  
- So conversation history (Message rows) is now created by both fork and by send-message; next_seq is used when appending messages.

**Summary**  
- **next_seq**: “What seq should the next Message have?” — used by send-message and (when adding messages) by fork.  
- **Conversation**: created on session create or fork; starts with no Message rows.  
- **History (Message rows)**: created by fork (copy) and by POST /guru/sessions/{id}/messages (persist user + assistant, then sync to vector store).
