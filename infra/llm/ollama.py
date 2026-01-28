from langchain_ollama import OllamaLLM as LangChainOllamaLLM
from langchain_ollama import ChatOllama
from agents.core.llm import LLM
from typing import AsyncIterator, Type, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

class OllamaLLM(LLM):
    def __init__(self, model: str, temperature: float = 0.7, base_url: str = "http://localhost:11434"):
        # Avoid infinite recursion: this wrapper is `OllamaLLM`, the LangChain class is aliased.
        self._llm = LangChainOllamaLLM(model=model, temperature=temperature, base_url=base_url)
        # Use ChatOllama for structured output (LangChain's recommended approach)
        self._chat_llm = ChatOllama(model=model, temperature=temperature, base_url=base_url)

    def generate(self, prompt: str) -> str:
        return self._llm.invoke(prompt)
    
    async def stream(self, prompt: str) -> AsyncIterator[str]:
        # LangChain astream yields chunk objects; normalize to plain text for SSE.
        async for chunk in self._llm.astream(prompt):
            text = getattr(chunk, "content", None)
            yield text if isinstance(text, str) else str(chunk)
    
    def with_structured_output(self, schema: Type[T], **kwargs) -> "StructuredOllamaLLM":
        """
        Create a structured output wrapper using LangChain's native support.
        
        Uses LangChain's ChatOllama.with_structured_output() which handles
        all parsing and validation correctly.
        """
        # Use LangChain's native with_structured_output (available on ChatOllama)
        native_structured = self._chat_llm.with_structured_output(schema, **kwargs)
        return StructuredOllamaLLM.from_native(native_structured, schema)


class StructuredOllamaLLM:
    """
    Wrapper for LangChain's native structured output with Ollama.
    
    Simply delegates to LangChain's with_structured_output() which handles
    all parsing and validation correctly.
    """
    def __init__(self, schema: Type[T], native_structured):
        self._schema = schema
        self._native_structured = native_structured  # LangChain's native structured output result
    
    @classmethod
    def from_native(cls, native_structured, schema: Type[T]):
        """Create from LangChain's native with_structured_output result."""
        return cls(schema, native_structured)
    
    async def ainvoke(self, input: str, **kwargs) -> T:
        """
        Invoke the LLM with structured output parsing using LangChain's native support.
        
        LangChain's with_structured_output() handles all parsing and validation.
        """
        import asyncio
        import time
        from api.utils.logger import configure_logging
        
        logger = configure_logging()
        
        # Log start time for diagnostics
        start_time = time.time()
        input_tokens = len(input) // 4  # Rough estimate
        logger.debug(f"LLM call starting: ~{input_tokens} input tokens")
        
        # Check if Ollama is available before making the call
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get("http://localhost:11434/api/tags")
                if response.status_code != 200:
                    raise ConnectionError(f"Ollama API returned status {response.status_code}")
        except Exception as e:
            logger.error(f"Ollama connection check failed: {e}. Is Ollama running?")
            raise ConnectionError(
                f"Cannot connect to Ollama at http://localhost:11434. "
                f"Please ensure Ollama is running: 'ollama serve'"
            ) from e
        
        # Increased timeout to 120 seconds per call (2 minutes)
        # Large models like qwen:latest can take 30-90 seconds for structured output
        # If it takes longer, there's likely an issue with the model or Ollama
        timeout_seconds = float(kwargs.pop('timeout', 120.0))
        
        try:
            result = await asyncio.wait_for(
                self._native_structured.ainvoke(input, **kwargs),
                timeout=timeout_seconds
            )
            
            elapsed = time.time() - start_time
            output_str = str(result)[:100] if result else ""
            output_tokens = len(output_str) // 4
            logger.info(f"LLM call completed in {elapsed:.2f}s (~{input_tokens} in, ~{output_tokens} out)")
            
            if elapsed > 60:
                logger.warning(
                    f"LLM call took {elapsed:.2f}s - this is slow! "
                    f"Consider using a faster model (e.g., qwen2:1.5b or llama3.2:1b) "
                    f"or optimizing prompts."
                )
            
            return result
        except asyncio.TimeoutError:
            elapsed = time.time() - start_time
            logger.error(
                f"LLM call timed out after {elapsed:.2f}s (timeout: {timeout_seconds}s). "
                f"This usually means:\n"
                f"  1. The model is too large/slow (consider using a smaller model)\n"
                f"  2. Ollama is overloaded or not responding\n"
                f"  3. The prompt is too complex\n"
                f"Try: Using a faster model like 'qwen2:1.5b' or 'llama3.2:1b'"
            )
            raise TimeoutError(
                f"LLM call timed out after {timeout_seconds}s. "
                f"The model may be too slow. Consider using a faster model."
            ) from None
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"LLM call failed after {elapsed:.2f}s: {e}")
            raise
    
    def invoke(self, input: str, **kwargs) -> T:
        """
        Synchronous invoke with structured output parsing.
        """
        import asyncio
        try:
            # Try to get existing event loop
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If loop is running, we can't use asyncio.run
                # Create a new task or use a thread
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = executor.submit(asyncio.run, self.ainvoke(input, **kwargs))
                    return future.result()
        except RuntimeError:
            # No event loop, create one
            pass
        
        return asyncio.run(self.ainvoke(input, **kwargs))
    