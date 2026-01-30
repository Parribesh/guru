"""
Unit test fixtures. Use mocks; no real DB or LLM.
"""
import pytest

# Re-export root conftest fixtures that are safe for unit tests (e.g. db_session
# can be used in unit tests that mock the DB). Unit tests typically don't need
# test_course unless testing with in-memory DB.
