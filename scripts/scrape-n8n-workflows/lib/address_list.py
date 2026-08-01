"""Address records produced by scans (surf results)."""

from __future__ import annotations

from typing import Any

from .client import public_url, slugify, utc_now_iso


def address_from_card(
    card: dict[str, Any],
    *,
    source_kind: str,
    source_value: str | None,
    scan_id: str,
) -> dict[str, Any]:
    wid = int(card["id"])
    name = card.get("name")
    slug = card.get("slug") or slugify(name or str(wid))
    url = card.get("url") or public_url(wid, name)
    return {
        "id": wid,
        "name": name,
        "slug": slug,
        "url": url,
        "totalViews": card.get("totalViews"),
        "createdAt": card.get("createdAt"),
        "user": (card.get("user") or {}).get("username")
        if isinstance(card.get("user"), dict)
        else card.get("user"),
        "source": {
            "kind": source_kind,
            "value": source_value,
            "scanId": scan_id,
        },
        "seenAt": utc_now_iso(),
    }


def address_from_id(
    workflow_id: int,
    *,
    name: str | None = None,
    scan_id: str,
    source_kind: str = "id",
    source_value: str | None = None,
) -> dict[str, Any]:
    slug = slugify(name) if name else str(workflow_id)
    return {
        "id": workflow_id,
        "name": name,
        "slug": slug,
        "url": public_url(workflow_id, name),
        "source": {
            "kind": source_kind,
            "value": source_value or str(workflow_id),
            "scanId": scan_id,
        },
        "seenAt": utc_now_iso(),
    }
