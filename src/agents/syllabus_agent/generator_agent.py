"""
Module Generator Agent - DEPRECATED: Old monolithic generation approach.

This file is being cleaned up as part of the sequential generation architecture redesign.
The old approach tried to generate all 6-10 modules in one LLM call, which:
- Violated 150 token input constraint
- Was unreliable (often generated 1-3 modules instead of 6-10)
- Had expensive retries (regenerate everything)

New architecture will use:
- OutlinePlannerAgent: Generate just titles (1 call)
- SequentialModuleGenerator: Generate one module at a time (6-10 calls)
"""

# This file will be replaced with new sequential generation agents

