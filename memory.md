# ML-Guru App Blueprint (token-dense reference)

## 1. App overview
- **Stack**: FastAPI, SQLAlchemy, LangGraph/agents, Ollama LLM, ChromaDB (optional RAG).
- **Core flows**: Auth → Courses → Syllabus (draft → confirm, separate endpoints) → Sessions (learning/test/chat only) → Module progression.

---

## 2. Data model (critical entities)

- **User**: id, email, hashed_password, preferences.
- **Course**: id, user_id, title, subject, goals, syllabus_draft (JSON: `{modules: [...]}`), syllabus_confirmed (bool). No Module rows until confirm.
- **Module**: id, course_id, title, order_index, objectives (JSON list), estimated_minutes. Created only on syllabus confirm.
- **ModuleProgress**: id, user_id, module_id, best_score, attempts_count, passed, passed_at, updated_at. One per (user, module); created on confirm.
- **Session** (api/models/session.py): id, user_id, session_type (learning|test|chat), status (active|paused|completed|cancelled), conversation_id, module_id?, course_id?, agent_name, agent_metadata (e.g. system_prompt), session_state (e.g. progress snapshot), session_metadata, started_at, ended_at, last_activity_at. Syllabus generation does not use Session.
- **Conversation**: id, user_id, parent_conversation_id?, forked_from_message_id?; holds Message(s).
- **Message** (api/models/models.py; table `messages`): id, conversation_id, role (user|assistant|system|tool), content, seq, created_at, interaction_metadata (JSON: retrieved_history, system_prompt, etc.). Canonical store for all chat/tutor/test turns; one row per turn.
- **SyllabusRun**: id, user_id, course_id, status, phase, result (JSON modules), error. Tracks one syllabus generation run.
- **SyllabusEvent**: run_id, phase, type, data. Events for that run (persisted for replay/debug).

---

## 3. Syllabus generation (clean state → new design)

**Clean state (current)**: SyllabusAgent is a stub in src/agents/syllabus_agent/agent.py. No full-course generation: execute_stream yields phase_start then done with empty modules and empty concepts_by_level. SyllabusService accepts empty modules and completes the run (result = {"modules": []}). ConceptGenerator, DependencyOrdering, and pipeline removed. Integration: POST /guru/courses/{id}/syllabus/run and GET /guru/syllabus/runs/{run_id}/stream still work; run completes with no syllabus.

**New design (to implement)**: Build the course gradually, per module. User is in a module (Beginner / Intermediate / Advanced); path makes the user proficient in **that module only**. When the user completes a concept, we ask the LLM for the **next concept** in order, passing the list of concepts already completed. So the LLM knows current module and completed concepts; it suggests the next one. No single “generate full course at once”; control per module.

---

### 3.1 Final syllabus state (structure and session use)

**Purpose**: The syllabus is the single source of truth for (1) what the course covers, (2) in what order, and (3) what each module’s learning objectives are. Sessions (learning, test, chat) and progression logic refer to this; the final state must contain everything they need.

**Where it lives**:
- **Before confirm**: `course.syllabus_draft` (JSON). Same shape in `SyllabusRun.result`. Used by UI and by POST syllabus/confirm.
- **After confirm**: **Module** rows (canonical); **ModuleProgress** per (user, module) for progression. `syllabus_outline` is derived from Module (order_index + title).

**Canonical structure** (syllabus_draft / run.result):

```json
{
  "modules": [
    {
      "title": "string",
      "objectives": ["string"],
      "estimated_minutes": number,
      "dependencies": [{"concept": "string", "prerequisites": ["string"]}]
    }
  ],
  "concepts_by_level": {
    "beginner": ["string"],
    "intermediate": ["string"],
    "advanced": ["string"]
  }
}
```

- **modules** (required): Array order = progression order. Each module:
  - **title**: Display name (e.g. Beginner, Intermediate, Advanced).
  - **objectives**: Learning objectives / concept names **in learning order** (from DAG topological sort). Sessions use these in the tutor prompt and for scope.
  - **estimated_minutes**: For UI and pacing.
  - **dependencies**: DAG per module — list of `{ "concept": "X", "prerequisites": ["Y", "Z"] }` (from LLM). Tells you which concept depends on which; objectives order is derived from this. Sessions can use this for “prerequisite for X” or hints.
  - On confirm: list index → Module.order_index (1-based); Module rows get title, order_index, objectives, estimated_minutes; ModuleProgress created per (user, module). (dependencies can stay in syllabus_draft for reference or be added to Module later.)
- **concepts_by_level** (optional): Maps level names to concept lists. Enables sessions to reference “which concepts belong to which level” (e.g. tutor: “This module covers these Beginner concepts: …”). Currently produced by pipeline but not yet stored in syllabus_draft; can be added so sessions can consume it.

**What sessions need when progressing**:
- **Per module** (from Module after confirm): title, order_index, objectives, estimated_minutes. Learning/test session is scoped to one module_id; tutor prompt gets module_title, objectives, syllabus_outline.
- **Per user**: ModuleProgress (best_score, attempts_count, passed) to gate “next module” and adapt tutor (progress_best_score, progress_attempts, progress_passed).
- **Course-level**: syllabus_outline = "1. Title\n2. Title\n…" from Module (order_index, title) for tutor context; course title, subject, goals from Course.
- **Optional**: concepts_by_level in syllabus_draft so tutor can reference “Beginner concepts: …” when in the first module.

**Conventions**:
- Module count: 3 in current pipeline (Beginner, Intermediate, Advanced); confirm creates one ModuleProgress per module per user.
- Progression: linear by order_index; “next module” gated on current module passed (ModuleProgress.passed).
- Syllabus generation must output the structure above so confirm and sessions have a single, consistent source.

---

## 4. Sessions: design and lifecycle

**Session types**: learning, test, chat only. Syllabus generation is separate (see §3).

- **Create** (POST /guru/sessions): Requires session_type (learning|test|chat). Rejects syllabus with 400 and message to use POST /guru/courses/{id}/syllabus/run.  
  - Creates Conversation.  
  - Resolves Module/Course; for learning loads ModuleProgress, builds tutor system prompt via `build_tutor_system_prompt()` (compressed=True), stores in agent_metadata and session_state (module_progress snapshot).  
  - SessionService.create_session(..., session_type, conversation_id, module_id, course_id, agent_name, agent_metadata, session_state).

- **Stream** (GET /guru/sessions/{id}/stream): SSE. Placeholder loop (keep-alive) for learning/test/chat; real-time updates would be WebSocket/pub-sub later.

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
- Syllabus: POST /guru/courses/{id}/syllabus/run (creates SyllabusRun, returns run_id), GET /guru/syllabus/runs/{run_id}/stream (SSE; SyllabusService). No Session.  
- Sessions: POST /guru/sessions (create learning/test/chat only), POST /guru/sessions/{id}/messages (send message), GET /guru/sessions/{id}/stream (SSE), GET /guru/sessions, GET /guru/sessions/{id}, POST /guru/sessions/{id}/end.  
- Conversations: under /guru (list, messages, fork).

---

## 7. Key files

- Syllabus: src/agents/syllabus_agent/agent.py (SyllabusAgent, run_stream); agentic/ (ConceptGenerator, pipeline.generate_syllabus optional, schemas).  
- Syllabus: api/services/syllabus_service.py (start_run, stream_run). Session: api/services/session_service.py (create, get, update_state, end, get_session_context, stream_session_events).  
- Routes: api/routes/session_routes.py (create_session, stream_session), api/routes/course_routes.py (confirm_syllabus, get_course with progress).  
- Prompts: api/utils/prompt_builder.py (tutor, critic, planner; syllabus prompts removed in favor of agentic).  
- Models: api/models/ (__init__.py exports Message, Conversation, User, Course, Module, ModuleProgress, Session, etc.); api/models/models.py (DB tables); api/models/session.py (Session, SessionType, SessionStatus).

---

## 8. Conventions

- Syllabus: current output 3 modules (Beginner, Intermediate, Advanced) from ConceptListByLevel; each has objectives, estimated_minutes.  
- Syllabus: standalone endpoints and SyllabusService; no Session. Sessions are for learning, test, chat only.  
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
   - Created when: (a) **POST /guru/sessions** (create session) — new Conversation(id=uuid, user_id), no Message rows. (b) **POST /guru/courses/{id}/syllabus/run** — creates SyllabusRun only (no Conversation). (c) **POST /conversations/{id}/fork** — new Conversation with parent_conversation_id and forked_from_message_id.  
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
