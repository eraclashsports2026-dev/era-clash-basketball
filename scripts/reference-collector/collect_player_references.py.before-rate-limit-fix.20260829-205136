#!/usr/bin/env python3
"""EraClash automated player-reference collector.

The collector is intentionally conservative: it downloads candidate reference images, ranks them,
and builds review packs. It does not claim that a search result is the correct player merely because
its filename or surrounding page contains the name.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import math
import os
import re
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote, urlencode, urlparse

import imagehash
import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps
from tqdm import tqdm

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None
    np = None

EXPECTED_CARDS = 381
EXPECTED_PEOPLE = 323
DEFAULT_TARGET = 8
DEFAULT_CANDIDATE_LIMIT = 30
MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024
MIN_IMAGE_EDGE = 420
MAX_PROCESSED_EDGE = 2048
REQUEST_TIMEOUT = 25

PILOT_NAMES = {
    "George Mikan", "Bill Russell", "Wilt Chamberlain", "Kareem Abdul-Jabbar",
    "Julius Erving", "Magic Johnson", "Larry Bird", "Michael Jordan",
    "Hakeem Olajuwon", "Charles Barkley", "Shaquille O'Neal", "Kobe Bryant",
    "Allen Iverson", "Tim Duncan", "LeBron James", "Stephen Curry",
    "Kevin Durant", "Nikola Jokic", "Giannis Antetokounmpo", "Victor Wembanyama",
}

BLOCKED_TITLE_WORDS = {
    "logo", "logos", "wallpaper", "wallpapers", "autograph", "autographed",
    "trading card", "basketball card", "jersey only", "sneaker", "shoe",
    "funko", "statue", "action figure", "video game", "2k rating", "meme",
    "birthday cake", "poster for sale", "t-shirt", "shirt", "merch",
}

PREFERRED_DOMAINS = {
    "wikimedia.org": 2.0,
    "wikipedia.org": 1.8,
    "nba.com": 1.0,
    "hoophall.com": 1.0,
    "olympics.com": 0.8,
    "fiba.basketball": 0.8,
    "sports-reference.com": 0.6,
}

MODEL_URLS = {
    "yunet": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "sface": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}

_thread_local = threading.local()


def session() -> requests.Session:
    s = getattr(_thread_local, "session", None)
    if s is None:
        s = requests.Session()
        s.headers.update({
            "User-Agent": os.getenv(
                "WIKIMEDIA_USER_AGENT",
                "EraClashReferenceCollector/1.0 (local research workflow)",
            ),
            "Accept-Language": "en-US,en;q=0.8",
        })
        _thread_local.session = s
    return s


def safe_slug(value: str) -> str:
    value = value.lower().replace("’", "'")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "unknown"


def clean_html(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", value)).strip()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def atomic_write(path: Path, data: str | bytes) -> None:
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + ".tmp")
    mode = "wb" if isinstance(data, bytes) else "w"
    kwargs = {} if isinstance(data, bytes) else {"encoding": "utf-8"}
    with open(tmp, mode, **kwargs) as f:
        f.write(data)
    os.replace(tmp, path)


@dataclass
class Person:
    person_id: str
    display_name: str
    card_ids: list[str]
    decades: list[str]
    teams: list[str]
    positions: list[str]


@dataclass
class Candidate:
    provider: str
    query: str
    title: str
    image_url: str
    source_page_url: str
    thumbnail_url: str = ""
    width: int = 0
    height: int = 0
    license_name: str = "REFERENCE_ONLY_LICENSE_UNVERIFIED"
    license_url: str = ""
    artist: str = ""
    attribution: str = ""
    era_hint: str = ""
    local_path: str = ""
    sha256: str = ""
    phash: str = ""
    face_count: int = 0
    face_similarity: float | None = None
    face_coverage: float | None = None
    sharpness: float | None = None
    quality_score: float = 0.0
    rejection_reason: str = ""


class ApiError(RuntimeError):
    pass


class FaceEngine:
    def __init__(self, model_dir: Path, enabled: bool = True):
        self.enabled = bool(enabled and cv2 is not None and np is not None)
        self.detector = None
        self.recognizer = None
        self.model_dir = model_dir
        if not self.enabled:
            return
        try:
            ensure_dir(model_dir)
            yunet = self._ensure_model("yunet")
            sface = self._ensure_model("sface")
            self.detector = cv2.FaceDetectorYN.create(str(yunet), "", (320, 320), 0.75, 0.3, 5000)
            self.recognizer = cv2.FaceRecognizerSF.create(str(sface), "")
        except Exception as exc:
            print(f"[face] disabled: {exc}", file=sys.stderr)
            self.enabled = False
            self.detector = None
            self.recognizer = None

    def _ensure_model(self, key: str) -> Path:
        path = self.model_dir / Path(MODEL_URLS[key]).name
        if path.exists() and path.stat().st_size > 100_000:
            return path
        response = session().get(MODEL_URLS[key], timeout=60)
        response.raise_for_status()
        atomic_write(path, response.content)
        return path

    def faces(self, image: Image.Image) -> list[Any]:
        if not self.enabled or self.detector is None:
            return []
        rgb = np.array(image.convert("RGB"))
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        h, w = bgr.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(bgr)
        if faces is None:
            return []
        return [(bgr, face) for face in faces]

    def embedding(self, image: Image.Image, face: Any | None = None) -> Any | None:
        if not self.enabled or self.recognizer is None:
            return None
        detected = self.faces(image)
        if not detected:
            return None
        bgr, chosen = max(detected, key=lambda item: float(item[1][2] * item[1][3])) if face is None else face
        aligned = self.recognizer.alignCrop(bgr, chosen)
        return self.recognizer.feature(aligned)

    def best_similarity(self, image: Image.Image, anchor: Any | None) -> tuple[float | None, int, float | None, Any | None]:
        detected = self.faces(image)
        if not detected:
            return None, 0, None, None
        area = image.width * image.height
        best_score = None
        best_face = None
        best_coverage = None
        for item in detected:
            _, face = item
            coverage = float(face[2] * face[3]) / max(1.0, area)
            if anchor is None or self.recognizer is None:
                score = coverage
            else:
                feature = self.embedding(image, item)
                if feature is None:
                    continue
                score = float(self.recognizer.match(anchor, feature, cv2.FaceRecognizerSF_FR_COSINE))
            if best_score is None or score > best_score:
                best_score = score
                best_face = item
                best_coverage = coverage
        return best_score, len(detected), best_coverage, best_face

    def chest_crop(self, image: Image.Image, face_item: Any | None) -> Image.Image:
        if not face_item:
            return ImageOps.fit(image.convert("RGB"), (900, 1200), method=Image.Resampling.LANCZOS)
        _, face = face_item
        x, y, w, h = [float(v) for v in face[:4]]
        cx = x + w / 2
        left = max(0, int(cx - w * 1.35))
        right = min(image.width, int(cx + w * 1.35))
        top = max(0, int(y - h * 0.65))
        bottom = min(image.height, int(y + h * 3.1))
        crop = image.crop((left, top, right, bottom)).convert("RGB")
        return ImageOps.fit(crop, (900, 1200), method=Image.Resampling.LANCZOS, centering=(0.5, 0.35))


def load_roster(repo: Path) -> list[Person]:
    roster_path = repo / "data" / "art" / "player-portrait-roster.json"
    if not roster_path.exists():
        exporter = repo / "scripts" / "export-player-portrait-roster.mjs"
        if not exporter.exists():
            raise FileNotFoundError(
                f"Missing {roster_path} and {exporter}. Copy the supplied exporter into scripts/ and run it."
            )
        import subprocess
        subprocess.run(["node", str(exporter)], cwd=repo, check=True)
    payload = json.loads(roster_path.read_text(encoding="utf-8"))
    totals = payload.get("totals", {})
    if totals.get("playerDecadeCards") != EXPECTED_CARDS or totals.get("canonicalPeople") != EXPECTED_PEOPLE:
        raise ValueError(
            f"Roster drift: expected {EXPECTED_CARDS} cards / {EXPECTED_PEOPLE} people, got {totals}."
        )
    people = []
    for row in payload["people"]:
        people.append(Person(
            person_id=row["personId"],
            display_name=row["displayName"],
            card_ids=[v for v in row["cardIds"].split("|") if v],
            decades=[v for v in row["decades"].split("|") if v],
            teams=[v for v in row["teams"].split("|") if v],
            positions=[v for v in row["positions"].split("|") if v],
        ))
    return people


def wikidata_entity(name: str) -> dict[str, Any] | None:
    params = {
        "action": "wbsearchentities",
        "search": f"{name} basketball player",
        "language": "en",
        "format": "json",
        "limit": 8,
        "type": "item",
    }
    response = session().get("https://www.wikidata.org/w/api.php", params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    results = response.json().get("search", [])
    exact = []
    for row in results:
        label = str(row.get("label", "")).casefold()
        description = str(row.get("description", "")).casefold()
        score = 0
        if label == name.casefold():
            score += 5
        if "basketball" in description:
            score += 4
        if "player" in description:
            score += 1
        exact.append((score, row))
    exact.sort(key=lambda item: item[0], reverse=True)
    return exact[0][1] if exact and exact[0][0] >= 4 else None


def wikidata_claims(qid: str) -> dict[str, Any]:
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{quote(qid)}.json"
    response = session().get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()["entities"][qid].get("claims", {})


def claim_string(claims: dict[str, Any], prop: str) -> str:
    try:
        return claims[prop][0]["mainsnak"]["datavalue"]["value"]
    except Exception:
        return ""


def commons_file_info(filename: str) -> Candidate | None:
    params = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "titles": f"File:{filename}",
    }
    response = session().get("https://commons.wikimedia.org/w/api.php", params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {})
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("url")
        if not url:
            continue
        meta = info.get("extmetadata", {})
        val = lambda k: clean_html((meta.get(k) or {}).get("value"))
        return Candidate(
            provider="wikimedia",
            query="Wikidata P18",
            title=page.get("title", filename),
            image_url=url,
            source_page_url=info.get("descriptionurl", ""),
            width=int(info.get("width") or 0),
            height=int(info.get("height") or 0),
            license_name=val("LicenseShortName") or "WIKIMEDIA_LICENSE_REVIEW_REQUIRED",
            license_url=val("LicenseUrl"),
            artist=val("Artist"),
            attribution=val("Credit"),
        )
    return None


def commons_search(name: str, limit: int = 40) -> list[Candidate]:
    queries = [f'"{name}" basketball', f'intitle:"{name}"']
    output: list[Candidate] = []
    seen = set()
    for query in queries:
        params = {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": min(50, limit),
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
        }
        response = session().get("https://commons.wikimedia.org/w/api.php", params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        pages = response.json().get("query", {}).get("pages", {})
        for page in pages.values():
            info = (page.get("imageinfo") or [{}])[0]
            image_url = info.get("url")
            if not image_url or image_url in seen:
                continue
            seen.add(image_url)
            meta = info.get("extmetadata", {})
            val = lambda k: clean_html((meta.get(k) or {}).get("value"))
            output.append(Candidate(
                provider="wikimedia",
                query=query,
                title=page.get("title", ""),
                image_url=image_url,
                source_page_url=info.get("descriptionurl", ""),
                width=int(info.get("width") or 0),
                height=int(info.get("height") or 0),
                license_name=val("LicenseShortName") or "WIKIMEDIA_LICENSE_REVIEW_REQUIRED",
                license_url=val("LicenseUrl"),
                artist=val("Artist"),
                attribution=val("Credit"),
            ))
    return output


def brave_search(query: str, api_key: str, count: int = 50, era_hint: str = "") -> list[Candidate]:
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": api_key,
    }
    params = {"q": query, "count": min(count, 200), "safesearch": "strict", "search_lang": "en", "country": "US"}
    response = session().get(
        "https://api.search.brave.com/res/v1/images/search",
        headers=headers,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    if response.status_code == 429:
        raise ApiError("Brave rate limit reached. Wait and resume the collection.")
    response.raise_for_status()
    rows = response.json().get("results", [])
    output = []
    for row in rows:
        props = row.get("properties") or {}
        thumb = row.get("thumbnail") or {}
        image_url = props.get("url") or row.get("url") or ""
        source_page = row.get("source") or row.get("page_url") or row.get("source_page_url") or ""
        thumbnail_url = thumb.get("src") if isinstance(thumb, dict) else str(thumb or "")
        if not image_url:
            continue
        output.append(Candidate(
            provider="brave",
            query=query,
            title=str(row.get("title") or row.get("description") or ""),
            image_url=image_url,
            source_page_url=source_page,
            thumbnail_url=thumbnail_url,
            width=int(props.get("width") or row.get("width") or 0),
            height=int(props.get("height") or row.get("height") or 0),
            era_hint=era_hint,
        ))
    return output


def domain_bonus(url: str) -> float:
    host = urlparse(url).netloc.lower()
    for domain, bonus in PREFERRED_DOMAINS.items():
        if host == domain or host.endswith("." + domain):
            return bonus
    return 0.0


def title_rejected(title: str) -> bool:
    lower = title.casefold()
    return any(word in lower for word in BLOCKED_TITLE_WORDS)


def download_image(candidate: Candidate, out_path: Path) -> tuple[Image.Image | None, bytes | None, str]:
    urls = [candidate.image_url]
    if candidate.thumbnail_url and candidate.thumbnail_url not in urls:
        urls.append(candidate.thumbnail_url)
    last_error = ""
    for url in urls:
        try:
            with session().get(url, timeout=REQUEST_TIMEOUT, stream=True, allow_redirects=True) as response:
                response.raise_for_status()
                content_type = response.headers.get("content-type", "").lower()
                if "image" not in content_type and not re.search(r"\.(jpe?g|png|webp)(\?|$)", url, re.I):
                    raise ValueError(f"not an image content type: {content_type}")
                chunks = []
                total = 0
                for chunk in response.iter_content(128 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        raise ValueError("image exceeds 30 MB")
                    chunks.append(chunk)
                data = b"".join(chunks)
            image = Image.open(io.BytesIO(data))
            image.load()
            image = ImageOps.exif_transpose(image)
            if min(image.width, image.height) < MIN_IMAGE_EDGE:
                raise ValueError(f"image too small: {image.width}x{image.height}")
            if max(image.width, image.height) > MAX_PROCESSED_EDGE:
                image.thumbnail((MAX_PROCESSED_EDGE, MAX_PROCESSED_EDGE), Image.Resampling.LANCZOS)
            image = image.convert("RGB")
            ensure_dir(out_path.parent)
            image.save(out_path, "JPEG", quality=94, optimize=True, progressive=True)
            return image, data, ""
        except Exception as exc:
            last_error = str(exc)
    return None, None, last_error


def image_sharpness(image: Image.Image) -> float:
    if cv2 is None or np is None:
        return 0.0
    gray = cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def candidate_score(candidate: Candidate, name: str) -> float:
    score = 0.0
    if name.casefold() in candidate.title.casefold():
        score += 2.2
    score += domain_bonus(candidate.source_page_url or candidate.image_url)
    if candidate.provider == "wikimedia":
        score += 1.8
    pixels = candidate.width * candidate.height
    if pixels:
        score += min(2.0, math.log10(max(pixels, 1)) / 3.5)
    if candidate.face_similarity is not None:
        score += candidate.face_similarity * 7.0
    if candidate.face_coverage is not None:
        if 0.035 <= candidate.face_coverage <= 0.48:
            score += 1.5
        elif candidate.face_coverage < 0.01:
            score -= 1.5
    if candidate.face_count == 1:
        score += 1.0
    elif candidate.face_count > 3:
        score -= 1.0
    if candidate.sharpness is not None:
        score += min(1.0, math.log10(max(candidate.sharpness, 1)) / 3.0)
    if candidate.era_hint:
        score += 0.25
    return score


def dedupe_candidates(candidates: list[Candidate], phash_distance: int = 7) -> list[Candidate]:
    output = []
    hashes = []
    exact = set()
    for candidate in sorted(candidates, key=lambda c: c.quality_score, reverse=True):
        if not candidate.sha256 or candidate.sha256 in exact:
            continue
        ph = imagehash.hex_to_hash(candidate.phash) if candidate.phash else None
        if ph is not None and any(ph - existing <= phash_distance for existing in hashes):
            continue
        exact.add(candidate.sha256)
        if ph is not None:
            hashes.append(ph)
        output.append(candidate)
    return output


def make_contact_sheet(person: Person, candidates: list[Candidate], path: Path) -> None:
    cells = []
    for idx, candidate in enumerate(candidates[:24], 1):
        try:
            image = Image.open(candidate.local_path).convert("RGB")
            image = ImageOps.fit(image, (250, 300), method=Image.Resampling.LANCZOS, centering=(0.5, 0.35))
        except Exception:
            continue
        canvas = Image.new("RGB", (270, 360), "white")
        canvas.paste(image, (10, 10))
        draw = ImageDraw.Draw(canvas)
        sim = "n/a" if candidate.face_similarity is None else f"{candidate.face_similarity:.3f}"
        lines = [f"{idx:02d} {candidate.provider}", f"score {candidate.quality_score:.2f} face {sim}", candidate.era_hint or "identity"]
        y = 316
        for line in lines:
            draw.text((12, y), line[:38], fill="black")
            y += 14
        cells.append(canvas)
    if not cells:
        return
    columns = 4
    rows = math.ceil(len(cells) / columns)
    sheet = Image.new("RGB", (columns * 270, rows * 360 + 60), "#e9edf3")
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 15), f"{person.display_name} — {person.person_id}", fill="black")
    for i, cell in enumerate(cells):
        x = (i % columns) * 270
        y = 60 + (i // columns) * 360
        sheet.paste(cell, (x, y))
    ensure_dir(path.parent)
    sheet.save(path, "JPEG", quality=90, optimize=True)


def build_review_index(output_root: Path, summaries: list[dict[str, Any]]) -> None:
    rows = []
    for item in sorted(summaries, key=lambda x: x["displayName"]):
        person_id = html.escape(item["personId"])
        name = html.escape(item["displayName"])
        status = html.escape(item["status"])
        rows.append(f'''<article data-name="{name.lower()}" data-status="{status}">
<h2>{name}</h2><p><code>{person_id}</code> · {status} · selected {item["selected"]}/{item["target"]}</p>
<a href="../{person_id}/manifest.json">manifest</a>
<img loading="lazy" src="../{person_id}/contact-sheet.jpg" alt="Reference contact sheet for {name}">
</article>''')
    page = f'''<!doctype html><html><head><meta charset="utf-8"><title>EraClash Reference Review</title>
<style>body{{font:16px system-ui;background:#0b1220;color:#eef2f7;margin:0;padding:24px}}input{{font:inherit;padding:12px;width:min(600px,90vw)}}main{{display:grid;gap:24px}}article{{background:#111d30;padding:18px;border-radius:14px}}img{{width:100%;height:auto;margin-top:12px;border-radius:8px}}a{{color:#f2b51d}}</style></head><body>
<h1>EraClash Player Reference Review</h1><p>{len(rows)} canonical people</p>
<input id="q" placeholder="Filter players"><main>{''.join(rows)}</main>
<script>const q=document.querySelector('#q');q.addEventListener('input',()=>{{const s=q.value.toLowerCase();for(const a of document.querySelectorAll('article'))a.hidden=!a.dataset.name.includes(s);}});</script>
</body></html>'''
    atomic_write(output_root / "review" / "index.html", page)


def collect_person(
    person: Person,
    output_root: Path,
    brave_key: str,
    target: int,
    candidate_limit: int,
    face_engine: FaceEngine,
    resume: bool,
    force: bool,
) -> dict[str, Any]:
    person_root = output_root / person.person_id
    manifest_path = person_root / "manifest.json"
    if resume and not force and manifest_path.exists():
        prior = json.loads(manifest_path.read_text(encoding="utf-8"))
        if prior.get("status") in {"AUTO_SELECTED", "NEEDS_REVIEW"}:
            return prior.get("summary", {
                "personId": person.person_id,
                "displayName": person.display_name,
                "target": target,
                "selected": len(prior.get("selectedIdentity", [])),
                "downloaded": len(prior.get("candidates", [])),
                "status": prior.get("status"),
            })
    if force and person_root.exists():
        shutil.rmtree(person_root)

    ensure_dir(person_root / "anchor")
    ensure_dir(person_root / "candidates")
    ensure_dir(person_root / "identity")
    for decade in person.decades:
        ensure_dir(person_root / "era" / decade)

    discovered: list[Candidate] = []
    anchor_candidate = None
    anchor_embedding = None
    qid = ""

    try:
        entity = wikidata_entity(person.display_name)
        if entity:
            qid = entity["id"]
            claims = wikidata_claims(qid)
            p18 = claim_string(claims, "P18")
            if p18:
                anchor_candidate = commons_file_info(p18)
    except Exception as exc:
        print(f"[{person.person_id}] Wikidata anchor: {exc}", file=sys.stderr)

    if anchor_candidate:
        anchor_path = person_root / "anchor" / "wikimedia-anchor.jpg"
        image, data, error = download_image(anchor_candidate, anchor_path)
        if image is not None and data is not None:
            anchor_candidate.local_path = str(anchor_path)
            anchor_candidate.sha256 = sha256_bytes(data)
            anchor_candidate.phash = str(imagehash.phash(image))
            anchor_embedding = face_engine.embedding(image)
            discovered.append(anchor_candidate)

    try:
        discovered.extend(commons_search(person.display_name, limit=40))
    except Exception as exc:
        print(f"[{person.person_id}] Commons search: {exc}", file=sys.stderr)

    if brave_key:
        queries = [
            f'"{person.display_name}" basketball player portrait photo',
        ]
        for decade in person.decades:
            queries.append(f'"{person.display_name}" {decade} basketball photo')
        for query in queries:
            era = next((d for d in person.decades if d in query), "")
            try:
                discovered.extend(brave_search(query, brave_key, count=50, era_hint=era))
                time.sleep(0.06)
            except Exception as exc:
                print(f"[{person.person_id}] Brave search {query!r}: {exc}", file=sys.stderr)

    unique_urls = []
    seen_urls = set()
    for candidate in discovered:
        if candidate.image_url in seen_urls or title_rejected(candidate.title):
            continue
        seen_urls.add(candidate.image_url)
        unique_urls.append(candidate)
    discovered = unique_urls[: max(candidate_limit * 3, 60)]

    downloaded: list[Candidate] = []
    for idx, candidate in enumerate(discovered, 1):
        ext_path = person_root / "candidates" / f"candidate-{idx:03d}.jpg"
        image, data, error = download_image(candidate, ext_path)
        if image is None or data is None:
            candidate.rejection_reason = error
            continue
        candidate.local_path = str(ext_path)
        candidate.width, candidate.height = image.size
        candidate.sha256 = sha256_bytes(data)
        candidate.phash = str(imagehash.phash(image))
        candidate.sharpness = image_sharpness(image)
        similarity, count, coverage, face_item = face_engine.best_similarity(image, anchor_embedding)
        candidate.face_similarity = similarity
        candidate.face_count = count
        candidate.face_coverage = coverage
        candidate.quality_score = candidate_score(candidate, person.display_name)
        # Save a consistent chest-up derivative beside the source candidate.
        crop = face_engine.chest_crop(image, face_item)
        crop_path = person_root / "candidates" / f"candidate-{idx:03d}-crop.jpg"
        crop.save(crop_path, "JPEG", quality=94, optimize=True)
        downloaded.append(candidate)
        if len(downloaded) >= candidate_limit:
            break

    deduped = dedupe_candidates(downloaded)
    selected = deduped[:target]
    for idx, candidate in enumerate(selected, 1):
        source = Path(candidate.local_path)
        crop = source.with_name(source.stem + "-crop.jpg")
        chosen = crop if crop.exists() else source
        shutil.copy2(chosen, person_root / "identity" / f"auto-{idx:02d}.jpg")

    era_selected: dict[str, list[Candidate]] = {}
    for decade in person.decades:
        matches = [c for c in deduped if c.era_hint == decade]
        if len(matches) < 3:
            matches += [c for c in deduped if c not in matches]
        matches = matches[:3]
        era_selected[decade] = matches
        for idx, candidate in enumerate(matches, 1):
            source = Path(candidate.local_path)
            crop = source.with_name(source.stem + "-crop.jpg")
            chosen = crop if crop.exists() else source
            shutil.copy2(chosen, person_root / "era" / decade / f"auto-{idx:02d}.jpg")

    make_contact_sheet(person, deduped, person_root / "contact-sheet.jpg")

    status = "AUTO_SELECTED" if len(selected) >= target else "NEEDS_REVIEW"
    if anchor_embedding is None:
        status = "NEEDS_REVIEW"
    summary = {
        "personId": person.person_id,
        "displayName": person.display_name,
        "target": target,
        "selected": len(selected),
        "downloaded": len(deduped),
        "status": status,
        "qid": qid,
        "anchorAvailable": anchor_candidate is not None,
        "faceMatchingAvailable": face_engine.enabled and anchor_embedding is not None,
        "decades": person.decades,
    }
    manifest = {
        "schemaVersion": "1.0.0",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "person": asdict(person),
        "wikidataQid": qid,
        "status": status,
        "humanApprovalRequired": True,
        "selectedIdentity": [asdict(c) for c in selected],
        "selectedByEra": {k: [asdict(c) for c in v] for k, v in era_selected.items()},
        "candidates": [asdict(c) for c in deduped],
        "summary": summary,
    }
    atomic_write(manifest_path, json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return summary


def write_reports(output_root: Path, summaries: list[dict[str, Any]]) -> None:
    fields = ["personId", "displayName", "target", "selected", "downloaded", "status", "qid", "anchorAvailable", "faceMatchingAvailable", "decades"]
    rows = []
    for item in sorted(summaries, key=lambda x: x["displayName"]):
        row = dict(item)
        row["decades"] = "|".join(item.get("decades", []))
        rows.append(row)
    for filename, subset in [
        ("coverage.csv", rows),
        ("needs-review.csv", [r for r in rows if r["status"] != "AUTO_SELECTED"]),
    ]:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(subset)
        atomic_write(output_root / filename, buf.getvalue())
    build_review_index(output_root, summaries)
    aggregate = {
        "schemaVersion": "1.0.0",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totals": {
            "people": len(summaries),
            "autoSelected": sum(1 for x in summaries if x["status"] == "AUTO_SELECTED"),
            "needsReview": sum(1 for x in summaries if x["status"] != "AUTO_SELECTED"),
            "imagesSelected": sum(int(x["selected"]) for x in summaries),
        },
        "people": sorted(summaries, key=lambda x: x["displayName"]),
    }
    atomic_write(output_root / "collection-manifest.json", json.dumps(aggregate, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect EraClash player reference images automatically.")
    sub = parser.add_subparsers(dest="command", required=True)
    collect = sub.add_parser("collect")
    collect.add_argument("--repo", type=Path, default=Path.cwd())
    collect.add_argument("--output", type=Path, default=None)
    collect.add_argument("--person", action="append", default=[], help="Person id or exact display name; repeatable.")
    collect.add_argument("--pilot", action="store_true")
    collect.add_argument("--target", type=int, default=DEFAULT_TARGET)
    collect.add_argument("--candidate-limit", type=int, default=DEFAULT_CANDIDATE_LIMIT)
    collect.add_argument("--workers", type=int, default=6)
    collect.add_argument("--resume", action="store_true")
    collect.add_argument("--force", action="store_true")
    collect.add_argument("--skip-face-match", action="store_true")
    collect.add_argument("--brave-key", default=os.getenv("BRAVE_SEARCH_API_KEY", ""))

    args = parser.parse_args()
    repo = args.repo.expanduser().resolve()
    output_root = (args.output or (repo / "portrait-sources")).expanduser().resolve()
    ensure_dir(output_root)

    people = load_roster(repo)
    requested = {x.casefold() for x in args.person}
    if requested:
        people = [p for p in people if p.person_id.casefold() in requested or p.display_name.casefold() in requested]
        if not people:
            raise SystemExit(f"No people matched: {sorted(requested)}")
    elif args.pilot:
        people = [p for p in people if p.display_name in PILOT_NAMES]
    if not args.brave_key:
        print("WARNING: BRAVE_SEARCH_API_KEY is not set; collection will use Wikimedia only.", file=sys.stderr)

    face_engine = FaceEngine(repo / ".cache" / "reference-collector" / "models", enabled=not args.skip_face_match)
    summaries: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(
                collect_person,
                person,
                output_root,
                args.brave_key,
                args.target,
                args.candidate_limit,
                face_engine,
                args.resume,
                args.force,
            ): person
            for person in people
        }
        with tqdm(total=len(futures), unit="player", desc="Collecting references") as bar:
            for future in as_completed(futures):
                person = futures[future]
                try:
                    summaries.append(future.result())
                except Exception as exc:
                    print(f"\n[{person.person_id}] FAILED: {exc}", file=sys.stderr)
                    summaries.append({
                        "personId": person.person_id,
                        "displayName": person.display_name,
                        "target": args.target,
                        "selected": 0,
                        "downloaded": 0,
                        "status": "FAILED",
                        "qid": "",
                        "anchorAvailable": False,
                        "faceMatchingAvailable": False,
                        "decades": person.decades,
                    })
                bar.update(1)
    write_reports(output_root, summaries)
    print(f"\nOutput: {output_root}")
    print(f"Review: {output_root / 'review' / 'index.html'}")
    print(f"Needs review: {output_root / 'needs-review.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
