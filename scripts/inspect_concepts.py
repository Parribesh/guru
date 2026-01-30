#!/usr/bin/env python3
"""
Test concept generation by difficulty: minimal prompt, fixed schema (beginner / intermediate / advanced).

Run: python scripts/inspect_concepts.py "Intro to Python" "Programming"
     python scripts/inspect_concepts.py "ML Basics" "Machine Learning" -o concepts.json

Requires Ollama. Output: list of concepts ordered by difficulty only.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))


def _check_ollama() -> bool:
    try:
        import httpx
        r = httpx.get("http://localhost:11434/api/tags", timeout=5.0)
        return r.status_code == 200
    except Exception:
        return False


# Minimal prompt: comprehensive concepts per level, no count or topic hardcoding
def _build_prompt(course_title: str, subject: str) -> str:
    return (
        f"Course: {course_title}. Subject: {subject}.\n"
        "List all key concepts needed to pass each difficulty level. "
        "Beginner: all concepts to reach beginner. Intermediate: all to reach intermediate. Advanced: all to reach advanced. "
        "Short concept names only."
    )


async def main() -> int:
    parser = argparse.ArgumentParser(description="Test concept list generation by difficulty.")
    parser.add_argument("course_title", help="Course title")
    parser.add_argument("subject", help="Subject")
    parser.add_argument("--output", "-o", default=None, help="Write result to JSON file")
    parser.add_argument("--timeout", type=float, default=60.0, help="LLM timeout (default 60)")
    parser.add_argument("--model", default="llama3.2:1b", help="Ollama model (default llama3.2:1b)")
    args = parser.parse_args()

    if not _check_ollama():
        print("Ollama not running. Start: ollama serve", file=sys.stderr)
        return 1

    from infra.llm.ollama import OllamaLLM
    from agents.syllabus_agent.agentic.schemas import ConceptListByLevel

    llm = OllamaLLM(model=args.model, temperature=0.2)
    prompt = _build_prompt(args.course_title, args.subject)

    result = await llm.generate_structured(prompt, ConceptListByLevel, timeout=args.timeout)

    print("BEGINNER:", result.beginner)
    print("INTERMEDIATE:", result.intermediate)
    print("ADVANCED:", result.advanced)

    if args.output:
        out = {
            "course_title": args.course_title,
            "subject": args.subject,
            "beginner": result.beginner,
            "intermediate": result.intermediate,
            "advanced": result.advanced,
        }
        Path(args.output).write_text(json.dumps(out, indent=2), encoding="utf-8")
        print(f"\nSaved to {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
