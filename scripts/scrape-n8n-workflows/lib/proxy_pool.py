"""SOCKS5 proxy pool: refresh from Databay (or file), health-check, rotate."""

from __future__ import annotations

import json
import random
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import httpx

from .client import HEALTH_URL, atomic_write_json, utc_now_iso
from .job_store import jobs_root, load_settings

DEFAULT_PROXY_URL = "https://databay.com/free-proxy-list/socks5.txt"
LINE_RE = re.compile(r"^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})\s*$")


class ProxyPool:
    def __init__(self, root: Path | None = None) -> None:
        self.root = jobs_root(root)
        self.dir = self.root / "proxies"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.list_path = self.dir / "socks5.txt"
        self.health_path = self.dir / "health.json"
        self._lock = threading.RLock()
        self._alive: list[str] = []  # socks5://host:port
        self._dead: set[str] = set()
        self._fail_counts: dict[str, int] = {}
        self._load_health()

    def _load_health(self) -> None:
        if not self.health_path.exists():
            return
        try:
            data = json.loads(self.health_path.read_text(encoding="utf-8"))
            self._alive = list(data.get("alive") or [])
            self._dead = set(data.get("dead") or [])
            self._fail_counts = {
                str(k): int(v) for k, v in (data.get("failCounts") or {}).items()
            }
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    def save_health(self) -> None:
        atomic_write_json(
            self.health_path,
            {
                "alive": self._alive,
                "dead": sorted(self._dead),
                "failCounts": self._fail_counts,
                "updatedAt": utc_now_iso(),
                "counts": {
                    "alive": len(self._alive),
                    "dead": len(self._dead),
                    "listed": self.count_listed(),
                },
            },
        )

    def count_listed(self) -> int:
        if not self.list_path.exists():
            return 0
        n = 0
        for line in self.list_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if LINE_RE.match(line.strip()):
                n += 1
        return n

    def parse_proxy_lines(self, text: str) -> list[str]:
        out: list[str] = []
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = LINE_RE.match(line)
            if m:
                out.append(f"socks5://{m.group(1)}:{m.group(2)}")
            elif line.startswith("socks5://"):
                out.append(line)
        # unique preserve order
        seen: set[str] = set()
        uniq = []
        for p in out:
            if p not in seen:
                seen.add(p)
                uniq.append(p)
        return uniq

    def refresh(
        self,
        source_url: str | None = None,
        *,
        local_file: Path | None = None,
    ) -> int:
        """Download or load proxy list; write socks5.txt. Returns count."""
        if local_file and local_file.exists():
            text = local_file.read_text(encoding="utf-8", errors="ignore")
        else:
            url = source_url or load_settings(self.root).get("proxyUrl") or DEFAULT_PROXY_URL
            with httpx.Client(timeout=30.0, follow_redirects=True) as client:
                resp = client.get(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0",
                        "Accept": "text/plain,*/*",
                        "Accept-Encoding": "gzip, deflate",
                    },
                )
                resp.raise_for_status()
                text = resp.text
        proxies = self.parse_proxy_lines(text)
        body = (
            "# Free SOCKS5 list (refreshed)\n"
            + "\n".join(p.replace("socks5://", "") for p in proxies)
            + "\n"
        )
        self.list_path.write_text(body, encoding="utf-8")
        with self._lock:
            # keep only still-listed as alive
            listed = set(proxies)
            self._alive = [p for p in self._alive if p in listed]
            self._dead = {p for p in self._dead if p in listed}
        self.save_health()
        return len(proxies)

    def listed_proxies(self) -> list[str]:
        if not self.list_path.exists():
            return []
        return self.parse_proxy_lines(self.list_path.read_text(encoding="utf-8", errors="ignore"))

    def probe_one(self, proxy_url: str, timeout: float = 8.0) -> bool:
        try:
            with httpx.Client(
                proxy=proxy_url,
                timeout=httpx.Timeout(timeout),
                follow_redirects=True,
            ) as client:
                r = client.get(
                    HEALTH_URL,
                    headers={
                        "User-Agent": "Mozilla/5.0",
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip, deflate",
                    },
                )
                if r.status_code != 200:
                    return False
                data = r.json()
                return bool(data.get("status") == "OK" or data)
        except Exception:
            return False

    def health_check(
        self,
        *,
        limit: int = 40,
        timeout: float | None = None,
        workers: int = 12,
    ) -> dict[str, Any]:
        settings = load_settings(self.root)
        timeout = float(timeout if timeout is not None else settings.get("proxyProbeTimeout") or 8)
        listed = self.listed_proxies()
        if not listed:
            return {"alive": 0, "dead": 0, "probed": 0}
        sample = listed[:]
        random.shuffle(sample)
        sample = sample[:limit]
        alive: list[str] = []
        dead: list[str] = []
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(self.probe_one, p, timeout): p for p in sample}
            for fut in as_completed(futs):
                p = futs[fut]
                ok = False
                try:
                    ok = fut.result()
                except Exception:
                    ok = False
                if ok:
                    alive.append(p)
                else:
                    dead.append(p)
        with self._lock:
            # merge: newly alive replace; dead marked
            alive_set = set(alive)
            for p in alive:
                if p not in self._alive:
                    self._alive.append(p)
                self._dead.discard(p)
                self._fail_counts.pop(p, None)
            for p in dead:
                if p in self._alive:
                    self._alive = [x for x in self._alive if x != p]
                self._dead.add(p)
            # drop alive not in sample that are still listed — keep them
            self._alive = [p for p in self._alive if p not in set(dead)]
        self.save_health()
        return {
            "alive": len(self._alive),
            "dead": len(self._dead),
            "probed": len(sample),
            "probeAlive": len(alive),
            "probeDead": len(dead),
            "updatedAt": utc_now_iso(),
        }

    def acquire(self) -> str | None:
        with self._lock:
            if not self._alive:
                # try listed at random without health if never probed
                listed = self.listed_proxies()
                if not listed:
                    return None
                return random.choice(listed)
            return random.choice(self._alive)

    def report_ok(self, proxy_url: str) -> None:
        with self._lock:
            self._fail_counts.pop(proxy_url, None)
            self._dead.discard(proxy_url)
            if proxy_url not in self._alive:
                self._alive.append(proxy_url)

    def report_bad(self, proxy_url: str, *, max_fails: int = 3) -> None:
        with self._lock:
            n = self._fail_counts.get(proxy_url, 0) + 1
            self._fail_counts[proxy_url] = n
            if n >= max_fails:
                self._alive = [p for p in self._alive if p != proxy_url]
                self._dead.add(proxy_url)
        # cheap periodic save
        if random.random() < 0.2:
            self.save_health()

    def summary(self) -> dict[str, Any]:
        return {
            "listed": self.count_listed(),
            "alive": len(self._alive),
            "dead": len(self._dead),
            "listPath": str(self.list_path),
            "healthPath": str(self.health_path),
            "updatedAt": (
                json.loads(self.health_path.read_text()).get("updatedAt")
                if self.health_path.exists()
                else None
            ),
        }
