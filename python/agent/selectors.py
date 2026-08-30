"""Selector sanitization.

Workable (and other real ATS DOMs) commonly use bare-numeric element ids, e.g. `id="778"`. A
naive `#778` CSS selector is a DOMException at the browser level — a CSS identifier can't start
with a digit unless escaped — so every field discovered against such a page fails its DOM fill
and silently falls back to a full AI repair, defeating the point of the cache. Converting
`#<id>` to the equivalent `[id="<id>"]` attribute selector sidesteps the identifier-escaping
rules entirely and is valid for any id, digit-led or not.
"""

from __future__ import annotations

import re
from typing import Optional

_LEADING_ID = re.compile(r"^#([^\s.#\[\]:]+)$")
_VALID_IDENT_START = re.compile(r"^-?[A-Za-z_]")


def normalize_selector(selector: Optional[str]) -> Optional[str]:
    if not selector:
        return selector
    match = _LEADING_ID.match(selector.strip())
    if not match:
        return selector
    raw_id = match.group(1)
    if _VALID_IDENT_START.match(raw_id):
        return selector
    escaped = raw_id.replace("\\", "\\\\").replace('"', '\\"')
    return f'[id="{escaped}"]'
