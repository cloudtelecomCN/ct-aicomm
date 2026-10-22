#!/usr/bin/env python3
"""Collect bounded CT-581 service, process, GPU, and artifact observations."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from typing import Callable, Sequence


ALIAS = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
SHA256 = re.compile(r"^sha256:[a-f0-9]{64}$")


def iso_epoch(value: str) -> float:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, TypeError, ValueError) as error:
        raise SystemExit("manifest contains an invalid timestamp") from error


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def valid_manifest_fingerprint(manifest: dict) -> bool:
    expected = manifest.get("manifest_fingerprint", "")
    body = {key: value for key, value in manifest.items() if key != "manifest_fingerprint"}
    encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    actual = f"sha256:{hashlib.sha256(encoded).hexdigest()}"
    return bool(SHA256.fullmatch(expected)) and expected == actual


def command(command: Sequence[str]) -> str:
    completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=10)
    return completed.stdout.strip()


def systemd_service(service: str, runner: Callable[[Sequence[str]], str] = command) -> dict:
    output = runner(
        [
            "systemctl",
            "show",
            service,
            "--no-pager",
            "--property=ActiveState",
            "--property=SubState",
            "--property=MainPID",
            "--property=NRestarts",
        ]
    )
    properties = {}
    for line in output.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            properties[key] = value
    return {
        "active_state": properties.get("ActiveState", "unknown"),
        "sub_state": properties.get("SubState", "unknown"),
        "main_pid": int(properties.get("MainPID", "0") or 0),
        "restart_count": int(properties.get("NRestarts", "0") or 0),
    }


def process_observation(pid: int, proc_root: Path = Path("/proc")) -> dict | None:
    if pid <= 0:
        return None
    status_path = proc_root / str(pid) / "status"
    try:
        lines = status_path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, PermissionError, ProcessLookupError):
        return None
    values = {}
    for line in lines:
        key, separator, value = line.partition(":")
        if separator:
            values[key] = value.strip()

    def kibibytes(name: str) -> int | None:
        match = re.fullmatch(r"(\d+)\s+kB", values.get(name, ""))
        return int(match.group(1)) if match else None

    return {
        "pid": pid,
        "rss_kib": kibibytes("VmRSS"),
        "rss_high_water_kib": kibibytes("VmHWM"),
        "virtual_memory_kib": kibibytes("VmSize"),
        "threads": int(values["Threads"]) if values.get("Threads", "").isdigit() else None,
    }


def gpu_observation(runner: Callable[[Sequence[str]], str] = command) -> dict | None:
    try:
        output = runner(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw",
                "--format=csv,noheader,nounits",
            ]
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None
    first_line = output.splitlines()[0] if output else ""
    fields = [field.strip() for field in first_line.split(",")]
    if len(fields) != 5:
        return None
    try:
        return {
            "utilization_percent": float(fields[0]),
            "memory_used_mib": float(fields[1]),
            "memory_total_mib": float(fields[2]),
            "temperature_c": float(fields[3]),
            "power_draw_w": float(fields[4]),
        }
    except ValueError:
        return None


def memory_observation(proc_root: Path = Path("/proc")) -> dict:
    values = {}
    for line in (proc_root / "meminfo").read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition(":")
        if separator:
            match = re.match(r"\s*(\d+)\s+kB", value)
            if match:
                values[key] = int(match.group(1))
    return {"total_kib": values.get("MemTotal"), "available_kib": values.get("MemAvailable")}


def read_agent_heartbeat(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, PermissionError, json.JSONDecodeError):
        return None
    return {
        "status": value.get("status"),
        "pid": value.get("pid"),
        "sequence": value.get("sequence"),
        "observed_at": value.get("observed_at"),
        "uptime_seconds": value.get("uptime_seconds"),
        "rss_kib": value.get("rss_kib"),
    }


def collect_sample(
    *,
    node_alias: str,
    sequence: int,
    agent_service: str,
    vllm_service: str,
    agent_binary: Path,
    bpf_object: Path,
    heartbeat_path: Path,
    manifest_fingerprint: str,
    monitor_sha256: str,
    runner: Callable[[Sequence[str]], str] = command,
    proc_root: Path = Path("/proc"),
) -> dict:
    agent = systemd_service(agent_service, runner)
    vllm = systemd_service(vllm_service, runner)
    processes = {
        "agent": process_observation(agent["main_pid"], proc_root),
        "vllm": process_observation(vllm["main_pid"], proc_root),
    }
    heartbeat = read_agent_heartbeat(heartbeat_path)
    gpu = gpu_observation(runner)
    memory = memory_observation(proc_root)
    artifacts = {"agent_sha256": sha256_file(agent_binary), "bpf_sha256": sha256_file(bpf_object), "monitor_sha256": monitor_sha256}
    observed_epoch = time.time()
    return {
        "schema_version": "1.0.0",
        "task": "CT-581",
        "data_origin": "measured",
        "node_alias": node_alias,
        "manifest_fingerprint": manifest_fingerprint,
        "sequence": sequence,
        "observed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(observed_epoch)),
        "monotonic_seconds": time.monotonic(),
        "boot_id": (proc_root / "sys/kernel/random/boot_id").read_text(encoding="utf-8").strip(),
        "services": {"agent": agent, "vllm": vllm},
        "processes": processes,
        "agent_heartbeat": heartbeat,
        "gpu": gpu,
        "memory": memory,
        "artifacts": artifacts,
    }


def write_json_atomic(path: Path, value: dict) -> None:
    temporary = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    temporary.write_text(f"{json.dumps(value, sort_keys=True, separators=(',', ':'))}\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def existing_sequence(path: Path) -> int:
    if not path.exists():
        return 0
    sequence = 0
    with path.open("r", encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                sequence += 1
    return sequence


def sampling_clock_after_start(
    started_epoch: float,
    *,
    once: bool,
    wall_clock: Callable[[], float] = time.time,
    monotonic_clock: Callable[[], float] = time.monotonic,
    sleeper: Callable[[float], None] = time.sleep,
) -> float:
    if not once:
        delay = started_epoch - wall_clock()
        if delay > 0:
            sleeper(delay)
    return monotonic_clock()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect CT-581 long-run node observations")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--node-alias", required=True)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--interval-seconds", default=60, type=int)
    parser.add_argument("--agent-service", default="ct-aicomm-agent.service")
    parser.add_argument("--vllm-service", default="ct-vllm.service")
    parser.add_argument("--agent-binary", default="/usr/local/lib/ct-aicomm-agent/bin/ct-aicomm-agent", type=Path)
    parser.add_argument("--bpf-object", default="/usr/local/lib/ct-aicomm-agent/lib/ct_selector.bpf.o", type=Path)
    parser.add_argument("--agent-heartbeat", default="/var/lib/ct-aicomm-agent/heartbeat.json", type=Path)
    parser.add_argument("--once", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not ALIAS.fullmatch(args.node_alias):
        raise SystemExit("node alias must be lowercase and stable")
    if args.interval_seconds < 1:
        raise SystemExit("interval must be positive")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != "1.0.0" or manifest.get("task") != "CT-581" or not valid_manifest_fingerprint(manifest):
        raise SystemExit("a valid CT-581 manifest is required")
    if args.node_alias not in manifest.get("node_aliases", []):
        raise SystemExit("node alias is not declared by the manifest")
    duration_seconds = manifest.get("minimum_duration_seconds")
    if not isinstance(duration_seconds, int) or duration_seconds < 1:
        raise SystemExit("manifest duration is invalid")
    started_epoch = iso_epoch(manifest.get("started_at"))
    planned_finish_epoch = iso_epoch(manifest.get("planned_finish_at"))
    if abs(planned_finish_epoch - (started_epoch + duration_seconds)) > 0.001:
        raise SystemExit("manifest finish time does not match its duration")
    for path in (args.agent_binary, args.bpf_object):
        if not path.is_file():
            raise SystemExit(f"required artifact is missing: {path}")
    monitor_sha256 = sha256_file(Path(__file__).resolve())
    expected_artifacts = manifest.get("artifacts", {})
    if sha256_file(args.agent_binary) != expected_artifacts.get("agent_sha256") or sha256_file(args.bpf_object) != expected_artifacts.get("bpf_sha256") or monitor_sha256 != expected_artifacts.get("monitor_sha256"):
        raise SystemExit("monitor runtime artifacts do not match the manifest")

    args.output.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(args.output, 0o700)
    state_path = args.output / "state.json"
    samples_path = args.output / "observations.jsonl"
    if state_path.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("node_alias") != args.node_alias or state.get("manifest_fingerprint") != manifest["manifest_fingerprint"] or state.get("duration_seconds") != duration_seconds or state.get("interval_seconds") != args.interval_seconds:
            raise SystemExit("existing monitor state does not match this run")
    else:
        state = {
            "schema_version": "1.0.0",
            "task": "CT-581",
            "node_alias": args.node_alias,
            "manifest_fingerprint": manifest["manifest_fingerprint"],
            "started_at": manifest["started_at"],
            "started_epoch": started_epoch,
            "duration_seconds": duration_seconds,
            "interval_seconds": args.interval_seconds,
            "planned_finish_epoch": planned_finish_epoch,
            "agent_sha256": sha256_file(args.agent_binary),
            "bpf_sha256": sha256_file(args.bpf_object),
            "monitor_sha256": monitor_sha256,
        }
        write_json_atomic(state_path, state)

    sequence = existing_sequence(samples_path)
    next_sample = sampling_clock_after_start(state["started_epoch"], once=args.once)
    while True:
        if not args.once and time.time() > state["planned_finish_epoch"]:
            write_json_atomic(
                args.output / "completed.json",
                {
                    "schema_version": "1.0.0",
                    "task": "CT-581",
                    "node_alias": args.node_alias,
                    "manifest_fingerprint": manifest["manifest_fingerprint"],
                    "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "observation_count": sequence,
                    "observations_sha256": sha256_file(samples_path),
                },
            )
            return 0
        sequence += 1
        sample = collect_sample(
            node_alias=args.node_alias,
            sequence=sequence,
            agent_service=args.agent_service,
            vllm_service=args.vllm_service,
            agent_binary=args.agent_binary,
            bpf_object=args.bpf_object,
            heartbeat_path=args.agent_heartbeat,
            manifest_fingerprint=manifest["manifest_fingerprint"],
            monitor_sha256=monitor_sha256,
        )
        with samples_path.open("a", encoding="utf-8") as stream:
            os.chmod(samples_path, 0o600)
            stream.write(f"{json.dumps(sample, sort_keys=True, separators=(',', ':'))}\n")
            stream.flush()
            os.fsync(stream.fileno())
        write_json_atomic(args.output / "latest.json", sample)
        if args.once:
            return 0
        next_sample += args.interval_seconds
        time.sleep(max(0, next_sample - time.monotonic()))


if __name__ == "__main__":
    raise SystemExit(main())
