import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "soak_monitor.py"
SPEC = importlib.util.spec_from_file_location("soak_monitor", SCRIPT)
monitor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(monitor)


class SoakMonitorTests(unittest.TestCase):
    def test_rejects_a_tampered_manifest_body(self):
        body = {"schema_version": "1.0.0", "task": "CT-581", "stage": "preflight"}
        encoded = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        manifest = {**body, "manifest_fingerprint": f"sha256:{hashlib.sha256(encoded).hexdigest()}"}
        self.assertTrue(monitor.valid_manifest_fingerprint(manifest))
        manifest["stage"] = "seven_day"
        self.assertFalse(monitor.valid_manifest_fingerprint(manifest))

    def test_collects_service_process_gpu_and_artifact_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            proc = root / "proc"
            proc.mkdir()
            (proc / "sys/kernel/random").mkdir(parents=True)
            (proc / "sys/kernel/random/boot_id").write_text("fixture-boot-id\n", encoding="utf-8")
            (proc / "meminfo").write_text("MemTotal: 100000 kB\nMemAvailable: 75000 kB\n", encoding="utf-8")
            for pid, rss in ((100, 12000), (200, 500000)):
                directory = proc / str(pid)
                directory.mkdir()
                (directory / "status").write_text(
                    f"VmRSS:\t{rss} kB\nVmHWM:\t{rss + 10} kB\nVmSize:\t{rss * 2} kB\nThreads:\t4\n",
                    encoding="utf-8",
                )
            agent = root / "agent"
            bpf = root / "selector.o"
            heartbeat = root / "heartbeat.json"
            agent.write_bytes(b"agent")
            bpf.write_bytes(b"bpf")
            heartbeat.write_text(json.dumps({"status": "running", "pid": 100, "sequence": 3, "observed_at": "2026-01-01T00:00:00Z", "uptime_seconds": 10, "rss_kib": 12000}), encoding="utf-8")

            def runner(command):
                if command[0] == "systemctl":
                    pid = 100 if command[2].startswith("ct-aicomm") else 200
                    return f"ActiveState=active\nSubState=running\nMainPID={pid}\nNRestarts=0\n"
                if command[0] == "nvidia-smi":
                    return "91, 19000, 23028, 61, 145.5"
                raise AssertionError(command)

            sample = monitor.collect_sample(
                node_alias="node-a",
                sequence=1,
                agent_service="ct-aicomm-agent.service",
                vllm_service="ct-vllm.service",
                agent_binary=agent,
                bpf_object=bpf,
                heartbeat_path=heartbeat,
                manifest_fingerprint=f"sha256:{'a' * 64}",
                monitor_sha256=f"sha256:{'b' * 64}",
                runner=runner,
                proc_root=proc,
            )
            self.assertEqual(sample["services"]["agent"]["active_state"], "active")
            self.assertEqual(sample["processes"]["agent"]["rss_kib"], 12000)
            self.assertEqual(sample["processes"]["vllm"]["rss_kib"], 500000)
            self.assertEqual(sample["gpu"]["memory_used_mib"], 19000)
            self.assertEqual(sample["boot_id"], "fixture-boot-id")
            self.assertEqual(sample["agent_heartbeat"]["pid"], 100)
            self.assertTrue(sample["manifest_fingerprint"].startswith("sha256:"))
            self.assertTrue(sample["artifacts"]["agent_sha256"].startswith("sha256:"))
            self.assertTrue(sample["artifacts"]["monitor_sha256"].startswith("sha256:"))

    def test_process_disappearance_is_recorded_as_missing(self):
        with tempfile.TemporaryDirectory() as temporary:
            self.assertIsNone(monitor.process_observation(999, Path(temporary)))

    def test_sampling_clock_is_initialized_after_waiting_for_stage_start(self):
        events = []

        def wall_clock():
            events.append("wall")
            return 100.0

        def sleeper(delay):
            events.append(("sleep", delay))

        def monotonic_clock():
            events.append("monotonic")
            return 500.0

        next_sample = monitor.sampling_clock_after_start(
            120.0,
            once=False,
            wall_clock=wall_clock,
            monotonic_clock=monotonic_clock,
            sleeper=sleeper,
        )

        self.assertEqual(next_sample, 500.0)
        self.assertEqual(events, ["wall", ("sleep", 20.0), "monotonic"])


if __name__ == "__main__":
    unittest.main()
