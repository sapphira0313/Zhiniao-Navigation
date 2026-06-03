"""Process management utilities for subprocess execution."""

import os
import select
import subprocess
import time
from typing import Optional


class ProcessManager:
    """Manages subprocess execution with proper cleanup and timeout handling."""

    @staticmethod
    def execute_with_timeout(
        cmd: list[str],
        cwd: str,
        env: dict,
        timeout: int,
        output_handler=None
    ) -> tuple[int, str]:
        """Execute a command with timeout and return (return_code, output)."""
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
            env=env,
        )

        start_time = time.time()
        buffer = ""

        try:
            while time.time() - start_time < timeout:
                if process.poll() is not None:
                    remaining = process.stdout.read()
                    if remaining:
                        buffer += remaining.decode("utf-8", errors="replace")
                    break

                ready, _, _ = select.select([process.stdout], [], [], 1.0)
                if not ready:
                    continue

                chunk = os.read(process.stdout.fileno(), 8192)
                if not chunk:
                    break
                chunk_str = chunk.decode("utf-8", errors="replace")
                buffer += chunk_str

                if output_handler:
                    output_handler(chunk_str)

            return process.poll() or -1, buffer
        finally:
            ProcessManager._cleanup_process(process)

    @staticmethod
    def _cleanup_process(process: subprocess.Popen):
        """Clean up a subprocess, ensuring proper termination."""
        # Close stdout pipe first to prevent deadlocks
        if process.stdout and not process.stdout.closed:
            try:
                process.stdout.close()
            except Exception:
                pass

        if process.stderr and not process.stderr.closed:
            try:
                process.stderr.close()
            except Exception:
                pass

        # Terminate process if still running
        if process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                try:
                    process.kill()
                    process.wait()
                except Exception:
                    pass
            except Exception:
                try:
                    process.kill()
                    process.wait()
                except Exception:
                    pass


class StreamParser:
    """Parses streaming JSON output from commands."""

    def __init__(self):
        self.buffer = ""
        self.pending_tool_name = None
        self.accumulated_json = ""

    def feed(self, data: str) -> Optional[str]:
        """Feed data and return matched tool name if found."""
        self.buffer += data

        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            line = line.strip()
            if not line:
                continue

            result = self._parse_line(line)
            if result:
                return result

        return None

    def _parse_line(self, line: str) -> Optional[str]:
        """Parse a single line of JSON output."""
        import json

        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            return None

        return self._process_event(event)

    def _process_event(self, event: dict) -> Optional[str]:
        """Process a parsed event and return tool name if matched."""
        event_type = event.get("type", "")

        if event_type == "stream_event":
            se = event.get("event", {})
            se_type = se.get("type", "")

            if se_type == "content_block_start":
                cb = se.get("content_block", {})
                if cb.get("type") == "tool_use":
                    tool_name = cb.get("name", "")
                    if tool_name in ("Skill", "Read"):
                        self.pending_tool_name = tool_name
                        self.accumulated_json = ""
                    else:
                        return ""

            elif se_type == "content_block_delta" and self.pending_tool_name:
                delta = se.get("delta", {})
                if delta.get("type") == "input_json_delta":
                    self.accumulated_json += delta.get("partial_json", "")
                    if self.accumulated_json:
                        return self.accumulated_json

            elif se_type in ("content_block_stop", "message_stop"):
                if self.pending_tool_name:
                    result = self.accumulated_json if self.accumulated_json else ""
                    self.pending_tool_name = None
                    self.accumulated_json = ""
                    return result
                if se_type == "message_stop":
                    return ""

        elif event_type == "assistant":
            message = event.get("message", {})
            for content_item in message.get("content", []):
                if content_item.get("type") == "tool_use":
                    tool_input = content_item.get("input", {})
                    if isinstance(tool_input, dict):
                        return tool_input.get("skill", "") or tool_input.get("file_path", "")

        elif event_type == "result":
            return ""

        return None