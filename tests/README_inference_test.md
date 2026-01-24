# Ollama Inference Speed Test

This script measures the **Time To First Token (TTFT)** for Ollama models with increasing input token counts.

**Uses Ollama's HTTP API directly** - no application wrapper overhead, pure performance testing.

## What it measures

- **Time To First Token (TTFT)**: The total execution time from sending the prompt until the first token is generated
- Tests with increasing input token counts (10, 50, 100, 200, 500, 1000, 2000, 4000 by default)
- Runs multiple iterations per test for statistical accuracy
- Direct HTTP API calls to Ollama for raw performance metrics

## Usage

### Basic usage (default settings)
```bash
python tests/test_ollama_inference_speed.py
```

### Custom model
```bash
python tests/test_ollama_inference_speed.py --model llama3.1:8b
```

### Custom token counts
```bash
python tests/test_ollama_inference_speed.py --tokens 100 500 1000 2000
```

### More runs per test (for better accuracy)
```bash
python tests/test_ollama_inference_speed.py --runs 5
```

### Custom Ollama server URL
```bash
python tests/test_ollama_inference_speed.py --base-url http://localhost:11434
```

### All options
```bash
python tests/test_ollama_inference_speed.py \
  --model llama3.2:latest \
  --tokens 50 100 200 500 1000 \
  --runs 3 \
  --base-url http://localhost:11434
```

## Output

The script outputs:
1. **Per-test results**: Min, average, and max TTFT for each token count
2. **Summary table**: All results in a formatted table
3. **Insights**: Analysis of TTFT trends and performance characteristics

## Example Output

```
================================================================================
Ollama Inference Speed Test (Time To First Token - TTFT)
================================================================================
Model: llama3.2:latest
Base URL: http://localhost:11434
Runs per test: 3
================================================================================

Testing with ~10 input tokens:
  Actual prompt tokens: ~12
  Prompt length: 89 characters
  Run 1: 0.1234s  Run 2: 0.1156s  Run 3: 0.1201s
  Results: min=0.1156s, avg=0.1197s, max=0.1234s

...

================================================================================
SUMMARY RESULTS
================================================================================
Input Tokens    Min TTFT (s)    Avg TTFT (s)    Max TTFT (s)    Tokens/s      
--------------------------------------------------------------------------------
12              0.1156          0.1197          0.1234          100.25        
...
```

## Requirements

- `requests` library: `pip install requests`
- Ollama server running (default: `http://localhost:11434`)
- Model must be pulled in Ollama: `ollama pull llama3.2:latest`

## Notes

- Token counting is approximate (uses word count * 1.33)
- For more accurate token counts, consider using `tiktoken` or similar
- The script includes small delays between tests to avoid overwhelming the server
- TTFT measures the latency until the first token, not throughput
- Uses Ollama's `/api/generate` endpoint directly via HTTP streaming
- No application wrapper overhead - pure Ollama performance testing

