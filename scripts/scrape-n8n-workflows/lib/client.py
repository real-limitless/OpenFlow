"""Stealth HTTP client + enumerate/fetch for public n8n.io workflows."""

from __future__ import annotations

import json
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import httpx
from bs4 import BeautifulSoup

SITE_ORIGIN = "https://n8n.io"
API_ORIGIN = "https://api.n8n.io"

SEARCH_URL = f"{API_ORIGIN}/templates/search"
WORKFLOW_META_URL = f"{API_ORIGIN}/templates/workflows/{{id}}"
WORKFLOW_IMPORT_URL = f"{API_ORIGIN}/workflows/templates/{{id}}"
CATEGORIES_URL = f"{API_ORIGIN}/templates/categories"
HEALTH_URL = f"{API_ORIGIN}/health"

WORKFLOWS_HOME = f"{SITE_ORIGIN}/workflows/"
WORKFLOW_PAGE_BY_ID = f"{SITE_ORIGIN}/workflows/{{id}}"
CATEGORY_PAGE = f"{SITE_ORIGIN}/workflows/categories/{{slug}}/"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
]

ACCEPT_LANGUAGES = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "en-US,en;q=0.8,es;q=0.5",
    "en-US,en;q=0.9,fr;q=0.6",
    "en-CA,en;q=0.9,fr-CA;q=0.7",
    "en-US,en;q=0.9,de;q=0.5",
]

SEC_CH_UA = [
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    '"Google Chrome";v="130", "Chromium";v="130", "Not_A Brand";v="99"',
    '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
]

LogFn = Callable[[str], None]


def _default_log(msg: str) -> None:
    print(msg, file=sys.stderr)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def public_url(workflow_id: int, name: str | None = None) -> str:
    slug = slugify(name) if name else str(workflow_id)
    return f"{SITE_ORIGIN}/workflows/{workflow_id}-{slug}/"


def parse_workflow_id(text: str) -> int | None:
    """Parse id from bare number or https://n8n.io/workflows/8237-slug/ URL."""
    text = (text or "").strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)
    m = re.search(r"/workflows/(\d+)", text)
    if m:
        return int(m.group(1))
    m = re.match(r"^(\d+)(?:-|/|$)", text)
    if m:
        return int(m.group(1))
    return None


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def atomic_write_json(path: Path, data: Any) -> None:
    atomic_write_text(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def card_from_search_item(w: dict[str, Any]) -> dict[str, Any]:
    wid = int(w["id"])
    name = w.get("name")
    slug = slugify(name or str(wid))
    return {
        "id": wid,
        "name": name,
        "description": w.get("description"),
        "totalViews": w.get("totalViews"),
        "price": w.get("price"),
        "purchaseUrl": w.get("purchaseUrl"),
        "createdAt": w.get("createdAt"),
        "user": w.get("user"),
        "slug": slug,
        "url": public_url(wid, name),
    }


@dataclass
class StealthConfig:
    min_delay: float = 1.2
    max_delay: float = 5.5
    pause_prob: float = 0.08
    pause_min: float = 8.0
    pause_max: float = 28.0
    max_retries: int = 6
    timeout: float = 45.0
    # Shorter connect timeout so dead SOCKS5 fails fast (seconds)
    connect_timeout: float = 12.0
    proxy: str | None = None  # e.g. socks5://host:port
    # After this many transport failures on a proxy, call proxy_rotator
    proxy_fail_rotate_after: int = 1


class StealthSession:
    """httpx client: browser-like headers, jitter, optional SOCKS5 proxy."""

    def __init__(
        self,
        cfg: StealthConfig,
        *,
        log: LogFn | None = None,
        quiet: bool = False,
        proxy_rotator: Callable[[], str | None] | None = None,
        on_proxy_bad: Callable[[str], None] | None = None,
    ) -> None:
        self.cfg = cfg
        self.log = log or (_default_log if not quiet else (lambda _m: None))
        self.quiet = quiet
        self._proxy_rotator = proxy_rotator
        self._on_proxy_bad = on_proxy_bad
        self._proxy_fail_streak = 0
        proxy = cfg.proxy
        self._client = self._make_client(proxy, cfg)
        self.proxy = proxy
        self._last_referer = WORKFLOWS_HOME
        self._ua = random.choice(USER_AGENTS)
        self._lang = random.choice(ACCEPT_LANGUAGES)
        self._sec_ch = random.choice(SEC_CH_UA)
        self._req_count = 0

    @staticmethod
    def _make_client(proxy: str | None, cfg: StealthConfig) -> httpx.Client:
        # connect timeout short; read timeout from cfg.timeout
        timeout = httpx.Timeout(
            connect=float(cfg.connect_timeout or 12.0),
            read=float(cfg.timeout),
            write=float(cfg.timeout),
            pool=float(cfg.connect_timeout or 12.0),
        )
        return httpx.Client(
            follow_redirects=True,
            timeout=timeout,
            http2=False,
            proxy=proxy,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> StealthSession:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def set_proxy(self, proxy: str | None) -> None:
        """Recreate client with a new proxy URL (or direct)."""
        try:
            self._client.close()
        except Exception:
            pass
        self.cfg.proxy = proxy
        self.proxy = proxy
        self._proxy_fail_streak = 0
        self._client = self._make_client(proxy, self.cfg)

    def _rotate_proxy_after_fail(self, err: Exception) -> None:
        """Mark current proxy bad and switch to next (or direct)."""
        bad = self.proxy
        if bad and self._on_proxy_bad:
            try:
                self._on_proxy_bad(bad)
            except Exception:
                pass
        self._proxy_fail_streak += 1
        need = max(1, int(self.cfg.proxy_fail_rotate_after or 1))
        if self._proxy_fail_streak < need:
            return
        if not self._proxy_rotator and not bad:
            return
        new_proxy: str | None
        if self._proxy_rotator:
            try:
                new_proxy = self._proxy_rotator()
            except Exception:
                new_proxy = None
        else:
            new_proxy = None  # fall back to direct
        # avoid immediately reusing the same dead proxy
        if new_proxy == bad and self._proxy_rotator:
            try:
                alt = self._proxy_rotator()
                if alt and alt != bad:
                    new_proxy = alt
                else:
                    new_proxy = None
            except Exception:
                new_proxy = None
        self.log(
            f"  ↻ rotate proxy after error ({err})  "
            f"{bad or 'direct'} → {new_proxy or 'direct'}"
        )
        self.set_proxy(new_proxy)

    def _maybe_rotate_identity(self) -> None:
        if self._req_count > 0 and random.random() < 0.12:
            self._ua = random.choice(USER_AGENTS)
            self._lang = random.choice(ACCEPT_LANGUAGES)
            self._sec_ch = random.choice(SEC_CH_UA)

    def _headers(self, accept: str, referer: str | None = None) -> dict[str, str]:
        self._maybe_rotate_identity()
        ref = referer or self._last_referer
        h: dict[str, str] = {
            "User-Agent": self._ua,
            "Accept": accept,
            "Accept-Language": self._lang,
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Referer": ref,
            "DNT": random.choice(["1", "1", "0"]),
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document" if "text/html" in accept else "empty",
            "Sec-Fetch-Mode": "navigate" if "text/html" in accept else "cors",
            "Sec-Fetch-Site": "same-site" if "api.n8n.io" in (ref or "") else "cross-site",
            "Sec-Fetch-User": "?1",
            "Cache-Control": random.choice(["no-cache", "max-age=0", ""]),
        }
        if "Chrome" in self._ua or "Chromium" in self._ua:
            h["Sec-CH-UA"] = self._sec_ch
            h["Sec-CH-UA-Mobile"] = "?0"
            h["Sec-CH-UA-Platform"] = random.choice(
                ['"Windows"', '"macOS"', '"Linux"']
            )
        return {k: v for k, v in h.items() if v}

    def _sleep(self) -> None:
        delay = random.uniform(self.cfg.min_delay, self.cfg.max_delay)
        if random.random() < self.cfg.pause_prob:
            delay += random.uniform(self.cfg.pause_min, self.cfg.pause_max)
            if not self.quiet:
                self.log(f"  … human-like pause ({delay:.1f}s)")
        time.sleep(delay)

    def request(
        self,
        method: str,
        url: str,
        *,
        accept: str = "application/json, text/plain, */*",
        referer: str | None = None,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        last_err: Exception | None = None
        for attempt in range(self.cfg.max_retries):
            self._sleep()
            headers = self._headers(accept=accept, referer=referer)
            try:
                resp = self._client.request(
                    method, url, headers=headers, params=params
                )
                self._req_count += 1
                if resp.status_code == 429 or resp.status_code >= 500:
                    retry_after = resp.headers.get("Retry-After")
                    if retry_after and retry_after.isdigit():
                        wait = float(retry_after) + random.uniform(0.5, 2.5)
                    else:
                        wait = (2**attempt) + random.uniform(0.5, 4.0)
                    self.log(
                        f"  ! HTTP {resp.status_code} on {url} — backoff {wait:.1f}s "
                        f"(attempt {attempt + 1}/{self.cfg.max_retries})"
                    )
                    time.sleep(wait)
                    continue
                if resp.status_code == 404:
                    return resp
                resp.raise_for_status()
                if "n8n.io" in str(resp.url):
                    self._last_referer = str(resp.url)
                return resp
            except (httpx.HTTPError, httpx.TransportError) as e:
                last_err = e
                # Dead SOCKS5 hangs less if we rotate immediately
                if self.proxy or self._proxy_rotator:
                    self._rotate_proxy_after_fail(e)
                    wait = random.uniform(0.2, 0.8)
                else:
                    wait = (2**attempt) + random.uniform(0.5, 3.0)
                self.log(f"  ! transport error: {e} — retry in {wait:.1f}s")
                time.sleep(wait)
        raise RuntimeError(
            f"Failed after {self.cfg.max_retries} attempts: {url}"
            + (f" (last proxy={self.proxy})" if self.proxy else "")
        ) from last_err

    def get_json(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        referer: str | None = None,
    ) -> Any:
        resp = self.request(
            "GET",
            url,
            accept="application/json, text/plain, */*",
            params=params,
            referer=referer or WORKFLOWS_HOME,
        )
        return resp.json()

    def get_text(
        self,
        url: str,
        *,
        referer: str | None = None,
        accept: str = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ) -> tuple[str, str]:
        resp = self.request("GET", url, accept=accept, referer=referer)
        return str(resp.url), resp.text

    def warm(self) -> None:
        self.log("Warming session (site home + /workflows/)…")
        try:
            self.get_text(SITE_ORIGIN + "/", referer=SITE_ORIGIN + "/")
            self.get_text(WORKFLOWS_HOME, referer=SITE_ORIGIN + "/")
        except Exception as e:
            self.log(f"  warm-up warning: {e}")


def extract_page_meta(html: str, final_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    meta: dict[str, Any] = {
        "url": final_url,
        "title": None,
        "description": None,
        "og": {},
        "twitter": {},
        "json_ld": [],
    }
    if soup.title and soup.title.string:
        meta["title"] = soup.title.string.strip()
    for tag in soup.find_all("meta"):
        name = (tag.get("name") or tag.get("property") or "").strip()
        content = tag.get("content")
        if not name or content is None:
            continue
        if name == "description":
            meta["description"] = content
        elif name.startswith("og:"):
            meta["og"][name] = content
        elif name.startswith("twitter:"):
            meta["twitter"][name] = content
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = (script.string or script.get_text() or "").strip()
        if not raw:
            continue
        try:
            meta["json_ld"].append(json.loads(raw))
        except json.JSONDecodeError:
            meta["json_ld"].append({"_raw": raw[:5000]})
    return meta


def extract_body_text(html: str, fallback_description: str | None = None) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    candidates = []
    for sel in (
        "main",
        "article",
        "[class*='prose']",
        "[class*='content']",
        "[class*='description']",
    ):
        for el in soup.select(sel):
            text = el.get_text("\n", strip=True)
            if text and len(text) > 80:
                candidates.append(text)
    body = max(candidates, key=len) if candidates else soup.get_text("\n", strip=True)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    if len(body) < 40 and fallback_description:
        return fallback_description.strip()
    return body


def build_search_params(
    *,
    page: int = 1,
    rows: int = 50,
    category: str | None = None,
    apps: str | None = None,
    nodes: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    """Build query params. Site ?integrations=X maps to apps=X."""
    params: dict[str, Any] = {"page": page, "rows": rows}
    if category:
        params["category"] = category
    if apps:
        params["apps"] = apps
    if nodes:
        params["nodes"] = nodes
    if search:
        params["search"] = search
    return params


def search_page(
    session: StealthSession,
    *,
    page: int = 1,
    rows: int = 50,
    category: str | None = None,
    apps: str | None = None,
    nodes: str | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    params = build_search_params(
        page=page,
        rows=rows,
        category=category,
        apps=apps,
        nodes=nodes,
        search=search,
    )
    return session.get_json(SEARCH_URL, params=params, referer=WORKFLOWS_HOME)


def parse_filters(search_response: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Normalize filters[] from search into {categories, apps, nodes}."""
    out: dict[str, list[dict[str, Any]]] = {
        "categories": [],
        "apps": [],
        "nodes": [],
    }
    raw = search_response.get("filters") or []
    if not isinstance(raw, list):
        return out
    for block in raw:
        if not isinstance(block, dict):
            continue
        field = block.get("field_name") or ""
        counts = block.get("counts") or []
        items = []
        for c in counts:
            if not isinstance(c, dict):
                continue
            items.append(
                {
                    "value": c.get("value"),
                    "count": c.get("count"),
                    "highlighted": c.get("highlighted"),
                }
            )
        if field in out:
            out[field] = items
    return out


def fetch_facets(session: StealthSession) -> dict[str, list[dict[str, Any]]]:
    """
    Load browse facets. Search filters only return top counts (~10 each);
    we merge full categories from /templates/categories and top apps/nodes
    from a few seeded searches to widen the list.
    """
    data = search_page(session, page=1, rows=1)
    facets = parse_filters(data)

    # Full category tree (names usable with category=)
    try:
        cats = fetch_categories(session)
        by_name: dict[str, dict[str, Any]] = {}
        for c in cats:
            name = c.get("name")
            if not name:
                continue
            by_name[str(name)] = {
                "value": name,
                "count": None,
                "highlighted": c.get("displayName") or name,
            }
        for item in facets.get("categories") or []:
            v = item.get("value")
            if v and v in by_name:
                by_name[v]["count"] = item.get("count")
            elif v:
                by_name[str(v)] = item
        facets["categories"] = sorted(
            by_name.values(),
            key=lambda x: (-(x.get("count") or 0), str(x.get("value") or "")),
        )
    except Exception:
        pass

    # Widen apps/nodes by merging filter facets from popular category probes
    apps_map: dict[str, dict[str, Any]] = {
        str(i.get("value")): i for i in (facets.get("apps") or []) if i.get("value")
    }
    nodes_map: dict[str, dict[str, Any]] = {
        str(i.get("value")): i for i in (facets.get("nodes") or []) if i.get("value")
    }
    for cat in ("AI", "Marketing", "Sales", "IT Ops", "Support"):
        try:
            d = search_page(session, page=1, rows=1, category=cat)
            extra = parse_filters(d)
            for i in extra.get("apps") or []:
                v = i.get("value")
                if v and str(v) not in apps_map:
                    apps_map[str(v)] = i
            for i in extra.get("nodes") or []:
                v = i.get("value")
                if v and str(v) not in nodes_map:
                    nodes_map[str(v)] = i
        except Exception:
            continue
    facets["apps"] = sorted(
        apps_map.values(),
        key=lambda x: (-(x.get("count") or 0), str(x.get("value") or "")),
    )
    facets["nodes"] = sorted(
        nodes_map.values(),
        key=lambda x: (-(x.get("count") or 0), str(x.get("value") or "")),
    )
    return facets


def fetch_categories(session: StealthSession) -> list[dict[str, Any]]:
    try:
        data = session.get_json(CATEGORIES_URL, referer=WORKFLOWS_HOME)
        return list(data.get("categories") or [])
    except Exception as e:
        session.log(f"  categories fetch skipped: {e}")
        return []


def enumerate_search(
    session: StealthSession,
    *,
    category: str | None = None,
    apps: str | None = None,
    nodes: str | None = None,
    search: str | None = None,
    limit: int = 0,
    rows: int = 100,
    on_page: Callable[[int, int, int, int], None] | None = None,
    stop_flag: Callable[[], bool] | None = None,
) -> tuple[list[dict[str, Any]], int | None]:
    """
    Paginate search with a FIXED page size until empty or limit.

    IMPORTANT: page size must stay constant. Varying `rows` between pages
    uses offset=(page-1)*rows and skips huge slices of the catalog (this is
    why full scans previously stalled around ~5–6k of ~11k).

    on_page(page, batch_len, unique_so_far, total)
    """
    rows = max(1, min(250, int(rows or 100)))
    cards: dict[int, dict[str, Any]] = {}
    page = 1
    total_reported: int | None = None
    empty_streak = 0
    while True:
        if stop_flag and stop_flag():
            break
        data = search_page(
            session,
            page=page,
            rows=rows,
            category=category,
            apps=apps,
            nodes=nodes,
            search=search,
        )
        total_reported = int(data.get("totalWorkflows") or 0)
        batch = data.get("workflows") or []
        if not batch:
            empty_streak += 1
            # one empty page is end-of-list; don't wander with more pages
            break
        empty_streak = 0
        for w in batch:
            c = card_from_search_item(w)
            cards[int(c["id"])] = c
        if on_page:
            on_page(page, len(batch), len(cards), total_reported)
        if limit and len(cards) >= limit:
            break
        if total_reported and len(cards) >= total_reported:
            break
        # last partial page
        if len(batch) < rows:
            break
        # hard ceiling: ceil(total/rows) + small slack for API lag
        max_page = max(1, (total_reported + rows - 1) // rows) + 3 if total_reported else page + 1
        if page >= max_page:
            break
        page += 1
    result = list(cards.values())
    if limit and len(result) > limit:
        result = result[:limit]
    return result, total_reported


def enumerate_search_parallel(
    *,
    category: str | None = None,
    apps: str | None = None,
    nodes: str | None = None,
    search: str | None = None,
    limit: int = 0,
    rows: int = 100,
    workers: int = 8,
    min_delay: float = 0.15,
    max_delay: float = 0.6,
    pause_prob: float = 0.0,
    use_proxy: bool = False,
    proxy_urls: list[str] | None = None,
    proxy_fallback_direct: bool = True,
    on_page: Callable[[int, int, int, int], None] | None = None,
    on_progress: Callable[[dict[str, Any]], None] | None = None,
    stop_flag: Callable[[], bool] | None = None,
    log: LogFn | None = None,
) -> tuple[list[dict[str, Any]], int | None]:
    """
    Full-catalog enumeration: discover total, then fetch every page in parallel.

    Uses a fixed page size (required for correct offsets). Optional SOCKS5
    proxies — one StealthSession per worker, each with its own proxy (or direct).
    Failed pages are retried (including on a different proxy / direct).
    """
    import math
    import threading
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from queue import Empty, Queue

    _log = log or _default_log
    rows = max(1, min(250, int(rows or 100)))
    workers = max(1, min(32, int(workers or 1)))

    # Seed: page 1 on direct (or first proxy) to learn total + first batch
    seed_proxy = None
    if use_proxy and proxy_urls:
        seed_proxy = random.choice(proxy_urls)

    seed_cfg = StealthConfig(
        min_delay=min_delay,
        max_delay=max_delay,
        pause_prob=pause_prob,
        proxy=seed_proxy,
        max_retries=4,
        timeout=40.0,
    )
    cards: dict[int, dict[str, Any]] = {}
    cards_lock = threading.Lock()
    total_reported: int | None = None
    pages_done = 0
    pages_failed: list[int] = []
    stats_lock = threading.Lock()

    def merge_batch(page: int, batch: list[dict[str, Any]], total: int) -> int:
        nonlocal pages_done
        with cards_lock:
            for w in batch:
                c = card_from_search_item(w)
                cards[int(c["id"])] = c
            unique = len(cards)
        with stats_lock:
            pages_done += 1
            done = pages_done
        if on_page:
            on_page(page, len(batch), unique, total)
        if on_progress:
            on_progress(
                {
                    "page": page,
                    "batch": len(batch),
                    "unique": unique,
                    "total": total,
                    "pagesDone": done,
                }
            )
        return unique

    try:
        with StealthSession(seed_cfg, quiet=True, log=_log) as seed:
            data = search_page(
                seed,
                page=1,
                rows=rows,
                category=category,
                apps=apps,
                nodes=nodes,
                search=search,
            )
    except Exception as e:
        if use_proxy and proxy_fallback_direct and seed_proxy:
            _log(f"  seed via proxy failed ({e}); retry direct")
            seed_cfg.proxy = None
            with StealthSession(seed_cfg, quiet=True, log=_log) as seed:
                data = search_page(
                    seed,
                    page=1,
                    rows=rows,
                    category=category,
                    apps=apps,
                    nodes=nodes,
                    search=search,
                )
        else:
            raise

    total_reported = int(data.get("totalWorkflows") or 0)
    batch0 = data.get("workflows") or []
    merge_batch(1, batch0, total_reported)

    if limit and len(cards) >= limit:
        return list(cards.values())[:limit], total_reported
    if not batch0:
        return list(cards.values()), total_reported

    total_pages = max(1, math.ceil(total_reported / rows)) if total_reported else 1
    # if API total is wrong/high, still stop when we would exceed
    if total_pages > 5000:
        total_pages = 5000

    page_q: Queue[int] = Queue()
    for p in range(2, total_pages + 1):
        page_q.put(p)

    # Build worker proxy assignments (cycle proxies; None = direct)
    proxies: list[str | None] = []
    if use_proxy and proxy_urls:
        pool = list(proxy_urls)
        random.shuffle(pool)
        for i in range(workers):
            proxies.append(pool[i % len(pool)] if pool else None)
    else:
        proxies = [None] * workers

    def fetch_page_with_session(
        session: StealthSession, page: int
    ) -> tuple[int, list[dict[str, Any]], int]:
        data = search_page(
            session,
            page=page,
            rows=rows,
            category=category,
            apps=apps,
            nodes=nodes,
            search=search,
        )
        total = int(data.get("totalWorkflows") or total_reported or 0)
        batch = list(data.get("workflows") or [])
        return page, batch, total

    def worker(worker_id: int, proxy: str | None) -> list[int]:
        """Drain page queue; return list of failed page numbers."""
        failed: list[int] = []
        cfg = StealthConfig(
            min_delay=min_delay,
            max_delay=max_delay,
            pause_prob=pause_prob,
            proxy=proxy,
            max_retries=3,
            timeout=40.0,
        )
        try:
            session = StealthSession(cfg, quiet=True, log=_log)
        except Exception as e:
            _log(f"  worker-{worker_id} session open failed ({proxy}): {e}")
            # re-queue is handled by collecting remaining — mark all we can't do
            return failed

        try:
            while not (stop_flag and stop_flag()):
                try:
                    page = page_q.get_nowait()
                except Empty:
                    break
                try:
                    _, batch, total = fetch_page_with_session(session, page)
                    if batch:
                        unique = merge_batch(page, batch, total)
                        if limit and unique >= limit:
                            # drain remaining quickly by not requeueing
                            while True:
                                try:
                                    page_q.get_nowait()
                                except Empty:
                                    break
                            break
                    # empty batch on a mid page can mean past end — ok
                except Exception as e:
                    _log(f"  worker-{worker_id} page {page} fail: {e}")
                    failed.append(page)
                finally:
                    page_q.task_done()
        finally:
            session.close()
        return failed

    # First pass parallel
    if total_pages > 1 and not (stop_flag and stop_flag()):
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = [
                ex.submit(worker, i + 1, proxies[i])
                for i in range(workers)
            ]
            for fut in as_completed(futs):
                try:
                    pages_failed.extend(fut.result() or [])
                except Exception as e:
                    _log(f"  worker crashed: {e}")

    # Retry failed pages (prefer direct if fallback on, else reshuffle proxies)
    retry_round = 0
    while pages_failed and retry_round < 3 and not (stop_flag and stop_flag()):
        retry_round += 1
        todo = pages_failed
        pages_failed = []
        _log(f"  retry round {retry_round}: {len(todo)} pages")
        random.shuffle(todo)

        def retry_one(page: int) -> tuple[int, bool]:
            proxy = None
            if use_proxy and proxy_urls and not (
                proxy_fallback_direct and retry_round >= 2
            ):
                proxy = random.choice(proxy_urls)
            cfg = StealthConfig(
                min_delay=min_delay,
                max_delay=max_delay,
                pause_prob=0,
                proxy=proxy,
                max_retries=2,
                timeout=40.0,
            )
            try:
                with StealthSession(cfg, quiet=True, log=_log) as session:
                    _, batch, total = fetch_page_with_session(session, page)
                    if batch:
                        merge_batch(page, batch, total)
                    return page, True
            except Exception as e:
                _log(f"  retry page {page} fail: {e}")
                return page, False

        with ThreadPoolExecutor(max_workers=min(workers, 8)) as ex:
            futs = [ex.submit(retry_one, p) for p in todo]
            for fut in as_completed(futs):
                page, ok = fut.result()
                if not ok:
                    pages_failed.append(page)

    if pages_failed:
        _log(f"  warning: {len(pages_failed)} pages still failed: {pages_failed[:20]}…")

    result = list(cards.values())
    if limit and len(result) > limit:
        result = result[:limit]
    return result, total_reported


def is_complete(out_dir: Path, workflow_id: int, want_html: bool) -> bool:
    base = out_dir / "workflows" / str(workflow_id)
    need = [base / "meta.json", base / "workflow.json"]
    if want_html:
        need.append(base / "page.html")
    return all(p.exists() and p.stat().st_size > 2 for p in need)


def fetch_one(
    session: StealthSession,
    *,
    workflow_id: int,
    card: dict[str, Any] | None,
    out_dir: Path,
    want_html: bool,
    stage_cb: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    def stage(s: str) -> None:
        if stage_cb:
            stage_cb(s)

    base = out_dir / "workflows" / str(workflow_id)
    base.mkdir(parents=True, exist_ok=True)

    stage("fetch-meta")
    meta_payload = session.get_json(
        WORKFLOW_META_URL.format(id=workflow_id),
        referer=WORKFLOWS_HOME,
    )
    atomic_write_json(base / "meta.json", meta_payload)

    wf_meta = meta_payload.get("workflow") or meta_payload
    name = (
        wf_meta.get("name") or (card or {}).get("name") or str(workflow_id)
    ).strip()
    slug = slugify(name)
    description = (
        wf_meta.get("description") or (card or {}).get("description") or ""
    )
    pub = public_url(workflow_id, name)

    stage("fetch-workflow")
    import_payload = session.get_json(
        WORKFLOW_IMPORT_URL.format(id=workflow_id),
        referer=pub,
    )
    # OpenFlow / n8n import expect top-level { name, nodes, connections, ... }.
    # The public templates API returns { id, name, workflow: { nodes, ... } }.
    # Save:
    #   workflow.json      — import-ready graph (nodes at root)
    #   workflow.raw.json  — original API payload (for debugging)
    if isinstance(import_payload, dict):
        atomic_write_json(base / "workflow.raw.json", import_payload)
        nested = import_payload.get("workflow")
        if isinstance(nested, dict) and isinstance(nested.get("nodes"), list):
            to_save = {
                **nested,
                "id": nested.get("id", import_payload.get("id", workflow_id)),
                "name": nested.get("name") or import_payload.get("name") or name,
            }
        elif isinstance(import_payload.get("nodes"), list):
            to_save = import_payload
        else:
            # last resort: keep payload but will not import cleanly
            to_save = import_payload
    else:
        to_save = import_payload
    atomic_write_json(base / "workflow.json", to_save)

    page_meta: dict[str, Any] = {}
    body_text = (description or "").strip()
    final_url = pub

    if want_html:
        stage("fetch-html")
        try:
            final_url, html = session.get_text(
                WORKFLOW_PAGE_BY_ID.format(id=workflow_id),
                referer=WORKFLOWS_HOME,
            )
            atomic_write_text(base / "page.html", html)
            page_meta = extract_page_meta(html, final_url)
            atomic_write_json(base / "page_meta.json", page_meta)
            html_body = extract_body_text(html, fallback_description=None)
            if html_body and len(html_body) > max(200, len(body_text) + 100):
                atomic_write_text(base / "body_html_extract.txt", html_body + "\n")
            if not body_text and html_body:
                body_text = html_body
            elif not body_text and page_meta.get("description"):
                body_text = str(page_meta["description"])
        except Exception as e:
            session.log(f"  html fetch warning for {workflow_id}: {e}")
            page_meta = {"error": str(e), "url": pub}

    atomic_write_text(base / "body.txt", body_text + ("\n" if body_text else ""))
    stage("done")

    return {
        "id": workflow_id,
        "name": name,
        "slug": slug,
        "url": final_url if want_html else pub,
        "public_url": pub,
        "totalViews": wf_meta.get("totalViews") or wf_meta.get("views"),
        "createdAt": wf_meta.get("createdAt"),
        "categories": wf_meta.get("categories"),
        "user": (wf_meta.get("user") or {}).get("username")
        if isinstance(wf_meta.get("user"), dict)
        else None,
        "proxy": session.proxy,
        "paths": {
            "meta": str((base / "meta.json").relative_to(out_dir)),
            "workflow": str((base / "workflow.json").relative_to(out_dir)),
            "body": str((base / "body.txt").relative_to(out_dir)),
            "page": str((base / "page.html").relative_to(out_dir))
            if want_html
            else None,
        },
        "scrapedAt": utc_now_iso(),
        "status": "ok",
    }


def append_catalog(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
