"""Evaluation runner for skill trigger testing."""

import json
import os
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

from .process_manager import StreamParser


class EvalRunner:
    """Runs evaluation queries and collects results."""

    def __init__(
        self,
        skill_name: str,
        description: str,
        project_root: Path,
        model: Optional[str] = None,
        timeout: int = 30,
    ):
        self.skill_name = skill_name
        self.description = description
        self.project_root = project_root
        self.model = model
        self.timeout = timeout

    def _create_command_file(self) -> Path:
        """Create a temporary command file for the skill."""
        unique_id = uuid.uuid4().hex[:8]
        clean_name = f"{self.skill_name}-skill-{unique_id}"
        commands_dir = self.project_root / ".claude" / "commands"
        commands_dir.mkdir(parents=True, exist_ok=True)

        indented_desc = "\n  ".join(self.description.split("\n"))
        command_content = (
            f"---\n"
            f"description: |\n"
            f"  {indented_desc}\n"
            f"---\n\n"
            f"# {self.skill_name}\n\n"
            f"This skill handles: {self.description}\n"
        )

        command_file = commands_dir / f"{clean_name}.md"
        command_file.write_text(command_content)
        return command_file, clean_name

    def _build_command(self) -> list[str]:
        """Build the claude command with appropriate arguments."""
        cmd = [
            "claude",
            "-p",
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
        ]
        if self.model:
            cmd.extend(["--model", self.model])
        return cmd

    def _run_single_query(self, query: str) -> bool:
        """Run a single query and return whether the skill was triggered."""
        import subprocess
        import select
        import time

        command_file, clean_name = self._create_command_file()

        try:
            cmd = self._build_command()
            cmd.insert(2, query)

            env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                cwd=str(self.project_root),
                env=env,
            )

            start_time = time.time()
            stream_parser = StreamParser()

            try:
                while time.time() - start_time < self.timeout:
                    if process.poll() is not None:
                        remaining = process.stdout.read()
                        if remaining:
                            result = stream_parser.feed(remaining.decode("utf-8", errors="replace"))
                            if result is not None:
                                return clean_name in result
                        break

                    ready, _, _ = select.select([process.stdout], [], [], 1.0)
                    if not ready:
                        continue

                    chunk = os.read(process.stdout.fileno(), 8192)
                    if not chunk:
                        break

                    result = stream_parser.feed(chunk.decode("utf-8", errors="replace"))
                    if result is not None:
                        return clean_name in result

                return False
            finally:
                if process.stdout and not process.stdout.closed:
                    try:
                        process.stdout.close()
                    except Exception:
                        pass

                if process.poll() is None:
                    try:
                        process.terminate()
                        process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
                    except Exception:
                        try:
                            process.kill()
                            process.wait()
                        except Exception:
                            pass
        finally:
            if command_file.exists():
                command_file.unlink()

    def run(
        self,
        eval_set: list[dict],
        num_workers: int = 10,
        runs_per_query: int = 1,
        trigger_threshold: float = 0.5,
        verbose: bool = False,
    ) -> dict:
        """Run the full evaluation and return results."""
        import sys

        results = []
        query_triggers: dict[str, list[bool]] = {}
        query_items: dict[str, dict] = {}

        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            future_to_info = {}
            for item in eval_set:
                for run_idx in range(runs_per_query):
                    future = executor.submit(
                        self._run_single_query,
                        item["query"],
                    )
                    future_to_info[future] = (item, run_idx)

            for future in as_completed(future_to_info):
                item, _ = future_to_info[future]
                query = item["query"]
                query_items[query] = item

                if query not in query_triggers:
                    query_triggers[query] = []

                try:
                    query_triggers[query].append(future.result())
                except Exception as e:
                    if verbose:
                        print(f"Warning: query failed: {e}", file=sys.stderr)
                    query_triggers[query].append(False)

        for query, triggers in query_triggers.items():
            item = query_items[query]
            trigger_rate = sum(triggers) / len(triggers)
            should_trigger = item["should_trigger"]

            if should_trigger:
                did_pass = trigger_rate >= trigger_threshold
            else:
                did_pass = trigger_rate < trigger_threshold

            results.append({
                "query": query,
                "should_trigger": should_trigger,
                "trigger_rate": trigger_rate,
                "triggers": sum(triggers),
                "runs": len(triggers),
                "pass": did_pass,
            })

        passed = sum(1 for r in results if r["pass"])
        total = len(results)

        return {
            "skill_name": self.skill_name,
            "description": self.description,
            "results": results,
            "summary": {
                "total": total,
                "passed": passed,
                "failed": total - passed,
            },
        }