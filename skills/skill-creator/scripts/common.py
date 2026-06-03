"""Common utilities for skill-creator scripts."""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def run_command(
    cmd: List[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
    timeout: Optional[int] = None
) -> Tuple[int, str]:
    """Run a command and return (return_code, output)."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            env=env,
            timeout=timeout,
            capture_output=True,
            text=True,
            errors="replace"
        )
        return result.returncode, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return -1, f"Command timed out after {timeout}s"
    except Exception as e:
        return -1, f"Command failed: {str(e)}"


def read_json(path: Path) -> Any:
    """Read JSON file with error handling."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in {path}: {e}")
    except Exception as e:
        raise FileNotFoundError(f"Failed to read {path}: {e}")


def write_json(path: Path, data: Any, pretty: bool = True) -> None:
    """Write JSON file with proper formatting."""
    kwargs = {"indent": 2} if pretty else {}
    path.write_text(json.dumps(data, **kwargs), encoding="utf-8")


def setup_env() -> Dict[str, str]:
    """Setup environment variables for subprocess calls."""
    env = os.environ.copy()
    env.pop("CLAUDECODE", None)
    return env


def ensure_dir(path: Path) -> None:
    """Ensure a directory exists."""
    path.mkdir(parents=True, exist_ok=True)


def timestamp() -> str:
    """Get current timestamp as string."""
    return time.strftime("%Y%m%d-%H%M%S")


def log(message: str, level: str = "info") -> None:
    """Log a message to stderr."""
    prefix = {
        "info": "[INFO]",
        "warn": "[WARN]",
        "error": "[ERROR]",
        "debug": "[DEBUG]"
    }.get(level, "[INFO]")
    print(f"{prefix} {message}", file=sys.stderr)


def find_project_root() -> Path:
    """Find the project root by looking for .claude directory."""
    current = Path.cwd()
    for parent in [current, *current.parents]:
        if (parent / ".claude").is_dir():
            return parent
    return current


class Timer:
    """Simple timer context manager."""
    
    def __init__(self, name: str = "operation"):
        self.name = name
        self.start = None
        self.elapsed = None
    
    def __enter__(self):
        self.start = time.time()
        return self
    
    def __exit__(self, *args):
        self.elapsed = time.time() - self.start
        log(f"{self.name} completed in {self.elapsed:.2f}s", "debug")


class StatsCalculator:
    """Calculate evaluation statistics."""
    
    @staticmethod
    def calculate(results: List[Dict]) -> Dict:
        """Calculate precision, recall, and accuracy from results."""
        positive = [r for r in results if r["should_trigger"]]
        negative = [r for r in results if not r["should_trigger"]]
        
        tp = sum(r["triggers"] for r in positive)
        pos_runs = sum(r["runs"] for r in positive)
        fn = pos_runs - tp
        
        fp = sum(r["triggers"] for r in negative)
        neg_runs = sum(r["runs"] for r in negative)
        tn = neg_runs - fp
        
        total = tp + tn + fp + fn
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
        accuracy = (tp + tn) / total if total > 0 else 0.0
        
        return {
            "tp": tp, "tn": tn, "fp": fp, "fn": fn,
            "precision": precision, "recall": recall, "accuracy": accuracy,
            "total": total, "pos_runs": pos_runs, "neg_runs": neg_runs
        }