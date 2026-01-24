#!/usr/bin/env python3
"""
Test script to measure Ollama inference speed (Time To First Token - TTFT)
with increasing input token counts.

Measures the total execution time for generating the first token
as input token count increases.

Uses Ollama's HTTP API directly for raw performance testing.
"""

import json
import time
from typing import List, Tuple
import requests


def estimate_tokens(text: str) -> int:
    """Estimate token count from text (rough approximation)."""
    words = len(text.split())
    return int(words * 1.33)  # ~1.33 tokens per word average


def generate_prompt_with_token_count(target_tokens: int) -> str:
    """
    Generate a prompt with approximately the target token count.
    Uses repeated sentences to reach target size.
    """
    base_sentence = (
        "The quick brown fox jumps over the lazy dog. "
        "This is a test sentence for measuring inference speed. "
        "We need to generate enough tokens to test the model's performance. "
    )
    
    # Calculate how many sentences we need
    tokens_per_sentence = estimate_tokens(base_sentence)
    num_sentences = max(1, target_tokens // tokens_per_sentence)
    
    prompt = base_sentence * num_sentences
    
    # Add a question at the end to ensure the model generates a response
    prompt += "\n\nPlease summarize the above text in one sentence."
    
    return prompt


def measure_time_to_first_token(
    base_url: str,
    model: str,
    prompt: str,
    num_runs: int = 3
) -> Tuple[float, float, float]:
    """
    Measure time to first token (TTFT) for a given prompt using Ollama's streaming API.
    Runs multiple times and returns min, avg, max.
    
    Returns:
        (min_ttft, avg_ttft, max_ttft) in seconds
    """
    ttft_times: List[float] = []
    api_url = f"{base_url}/api/generate"
    
    for run in range(num_runs):
        start_time = time.perf_counter()
        first_token_time = None
        
        try:
            # Use streaming API
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": True
            }
            
            response = requests.post(
                api_url,
                json=payload,
                stream=True,
                timeout=60
            )
            
            if response.status_code != 200:
                print(f"  Run {run + 1}: HTTP {response.status_code}", end="  ")
                continue
            
            # Read first chunk
            for line in response.iter_lines():
                if line:
                    if first_token_time is None:
                        first_token_time = time.perf_counter()
                        # Parse to verify it's a valid token
                        try:
                            chunk = json.loads(line.decode('utf-8'))
                            if 'response' in chunk:
                                break  # Got first token
                        except json.JSONDecodeError:
                            continue
                    else:
                        break  # We only need the first token
            
            response.close()
            
        except requests.exceptions.RequestException as e:
            print(f"  Run {run + 1}: Error - {e}", end="  ")
            continue
        except Exception as e:
            print(f"  Run {run + 1}: Error - {e}", end="  ")
            continue
        
        if first_token_time is not None:
            ttft = first_token_time - start_time
            ttft_times.append(ttft)
            print(f"  Run {run + 1}: {ttft:.4f}s", end="  ")
        else:
            print(f"  Run {run + 1}: No token received", end="  ")
    
    if not ttft_times:
        return (0.0, 0.0, 0.0)
    
    return (min(ttft_times), sum(ttft_times) / len(ttft_times), max(ttft_times))


def run_inference_speed_test(
    model: str = "llama3.2:latest",
    token_counts: List[int] = None,
    num_runs: int = 3,
    base_url: str = "http://localhost:11434"
):
    """
    Run inference speed test with increasing input token counts.
    
    Args:
        model: Ollama model name
        token_counts: List of token counts to test. If None, uses default range.
        num_runs: Number of runs per token count for averaging
        base_url: Ollama API base URL
    """
    if token_counts is None:
        # Default: test with increasing token counts
        token_counts = [10, 50, 100, 200, 500, 1000, 2000, 4000]
    
    print(f"\n{'='*80}")
    print(f"Ollama Inference Speed Test (Time To First Token - TTFT)")
    print(f"{'='*80}")
    print(f"Model: {model}")
    print(f"Base URL: {base_url}")
    print(f"Runs per test: {num_runs}")
    print(f"Testing directly via Ollama HTTP API")
    print(f"{'='*80}\n")
    
    # Verify Ollama is accessible
    try:
        health_check = requests.get(f"{base_url}/api/tags", timeout=5)
        if health_check.status_code != 200:
            print(f"⚠️  Warning: Ollama may not be running at {base_url}")
            print(f"   Status code: {health_check.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Error connecting to Ollama at {base_url}: {e}")
        print(f"   Make sure Ollama is running: ollama serve")
        return
    
    results: List[Tuple[int, float, float, float]] = []
    
    for target_tokens in token_counts:
        print(f"\nTesting with ~{target_tokens} input tokens:")
        prompt = generate_prompt_with_token_count(target_tokens)
        actual_tokens = estimate_tokens(prompt)
        
        print(f"  Actual prompt tokens: ~{actual_tokens}")
        print(f"  Prompt length: {len(prompt)} characters")
        
        min_ttft, avg_ttft, max_ttft = measure_time_to_first_token(
            base_url, model, prompt, num_runs
        )
        
        if avg_ttft > 0:
            results.append((actual_tokens, min_ttft, avg_ttft, max_ttft))
            print(f"\n  Results: min={min_ttft:.4f}s, avg={avg_ttft:.4f}s, max={max_ttft:.4f}s")
        else:
            print(f"\n  ⚠️  Failed to get results")
        
        # Small delay between tests to avoid overwhelming the server
        time.sleep(0.5)
    
    # Print summary table
    print(f"\n{'='*80}")
    print("SUMMARY RESULTS")
    print(f"{'='*80}")
    print(f"{'Input Tokens':<15} {'Min TTFT (s)':<15} {'Avg TTFT (s)':<15} {'Max TTFT (s)':<15} {'Tokens/s':<15}")
    print(f"{'-'*80}")
    
    for tokens, min_ttft, avg_ttft, max_ttft in results:
        # Calculate approximate tokens per second (inverse of TTFT)
        tokens_per_sec = tokens / avg_ttft if avg_ttft > 0 else 0
        print(f"{tokens:<15} {min_ttft:<15.4f} {avg_ttft:<15.4f} {max_ttft:<15.4f} {tokens_per_sec:<15.2f}")
    
    print(f"{'='*80}\n")
    
    # Print insights
    if len(results) > 1:
        print("INSIGHTS:")
        first_ttft = results[0][2]  # avg TTFT for first test
        last_ttft = results[-1][2]  # avg TTFT for last test
        
        if last_ttft > first_ttft:
            slowdown = ((last_ttft - first_ttft) / first_ttft) * 100
            print(f"  • TTFT increased by {slowdown:.1f}% from {results[0][0]} to {results[-1][0]} tokens")
        else:
            print(f"  • TTFT remained relatively stable")
        
        fastest_idx = min(range(len(results)), key=lambda i: results[i][1])
        slowest_idx = max(range(len(results)), key=lambda i: results[i][3])
        print(f"  • Fastest TTFT: {results[fastest_idx][1]:.4f}s at {results[fastest_idx][0]} tokens")
        print(f"  • Slowest TTFT: {results[slowest_idx][3]:.4f}s at {results[slowest_idx][0]} tokens")


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Test Ollama inference speed (Time To First Token) with increasing input token counts"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="llama3.2:latest",
        help="Ollama model name (default: llama3.2:latest)"
    )
    parser.add_argument(
        "--tokens",
        type=int,
        nargs="+",
        default=None,
        help="Token counts to test (default: 10, 50, 100, 200, 500, 1000, 2000, 4000)"
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=3,
        help="Number of runs per token count (default: 3)"
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default="http://localhost:11434",
        help="Ollama API base URL (default: http://localhost:11434)"
    )
    
    args = parser.parse_args()
    
    run_inference_speed_test(
        model=args.model,
        token_counts=args.tokens,
        num_runs=args.runs,
        base_url=args.base_url
    )


if __name__ == "__main__":
    main()
