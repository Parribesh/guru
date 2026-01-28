"""
Pytest configuration for test suite.
Ensures proper Python path setup for imports.
"""
import sys
from pathlib import Path

# Add project root to Python path so we can import 'api' and 'infra' modules
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Also add src to path for 'agents' imports
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

