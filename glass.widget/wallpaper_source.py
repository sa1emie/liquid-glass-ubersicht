#!/usr/bin/env python3
"""Find an image of the current desktop wallpaper.

Prints an absolute path on success and exits 0. On failure, prints a short
reason to stderr and exits 1.

Uses only what ships with macOS (system python3 + Apple's pyobjc), so there is
nothing to install.

Order matters: the methods that need no permission are tried first, and the
screen capture (which needs Screen Recording) is the last resort.
"""

import os
import plistlib
import sys
import urllib.parse

HOME = os.path.expanduser("~")
INDEX = os.path.join(
    HOME, "Library/Application Support/com.apple.wallpaper/Store/Index.plist"
)
ASSET_DIR = os.path.join(HOME, "Library/Application Support/com.apple.mobileAssetDesktop")


def log(msg):
    print(msg, file=sys.stderr)


def _nested(value):
    """Some Configuration values are themselves binary plists."""
    if isinstance(value, bytes) and value[:8] == b"bplist00":
        try:
            return plistlib.loads(value)
        except Exception:
            return None
    return value


def _choices():
    """Yield each wallpaper 'choice' dict recorded for the desktop."""
    try:
        with open(INDEX, "rb") as fh:
            index = plistlib.load(fh)
    except Exception:
        return
    for group in ("AllSpacesAndDisplays", "SystemDefault"):
        desktop = (index.get(group) or {}).get("Desktop") or {}
        for choice in (desktop.get("Content") or {}).get("Choices") or []:
            yield choice


def from_index_plist():
    """A user-chosen image file, or a stock picture referenced by URL.

    This is the common case for anyone who set their own wallpaper, and it
    needs no permissions at all.
    """
    for choice in _choices():
        for path in choice.get("Files") or []:
            # Entries are usually dicts with a URL, occasionally plain strings.
            if isinstance(path, dict):
                path = path.get("relative") or path.get("url") or ""
            if isinstance(path, str) and path:
                resolved = _from_url(path)
                if resolved:
                    return resolved

        config = _nested(choice.get("Configuration")) or {}
        url = config.get("url")
        if isinstance(url, dict):
            url = url.get("relative")
        if isinstance(url, str):
            resolved = _from_url(url)
            if resolved:
                return resolved
    return None


def _from_url(value):
    """Turn a file:// URL or bare path into a readable image path."""
    if value.startswith("file://"):
        value = urllib.parse.unquote(value[len("file://") :])
    if os.path.isfile(value) and os.path.getsize(value) > 0:
        return value
    return None


def from_asset_dir():
    """Stock dynamic wallpapers cached as multi-frame HEIC files.

    Only reachable on macOS versions that still record the file name; newer
    ones store an opaque asset UUID instead, and we fall through to capture.
    """
    for choice in _choices():
        config = _nested(choice.get("Configuration")) or {}
        name = config.get("assetName") or config.get("name")
        if isinstance(name, str):
            candidate = os.path.join(ASSET_DIR, name)
            if os.path.isfile(candidate):
                return candidate
    return None


def from_screen_capture():
    """Capture the window macOS draws the wallpaper into.

    This is the only method that works for aerial and dynamic wallpapers on
    current macOS, and it has a nice property: it captures whatever is on
    screen right now, so the light/dark variant is already correct.

    Requires Screen Recording permission for whichever app runs this. Without
    it macOS hands back an empty image, so the result is checked before use.
    """
    try:
        import Quartz
    except ImportError:
        log("pyobjc (Quartz) unavailable")
        return None

    window_id = None
    windows = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID
    )
    for win in windows or []:
        name = win.get("kCGWindowName") or ""
        owner = win.get("kCGWindowOwnerName") or ""
        bounds = win.get("kCGWindowBounds") or {}
        # The wallpaper sits at the very back, full-screen, named "Wallpaper".
        if name == "Wallpaper" and owner in ("WindowManager", "Dock"):
            if bounds.get("Width", 0) >= 800 and bounds.get("Height", 0) >= 600:
                window_id = win.get("kCGWindowNumber")
                break
    if window_id is None:
        log("no wallpaper window found")
        return None

    image = Quartz.CGWindowListCreateImage(
        Quartz.CGRectNull,
        Quartz.kCGWindowListOptionIncludingWindow,
        window_id,
        Quartz.kCGWindowImageBoundsIgnoreFraming | Quartz.kCGWindowImageBestResolution,
    )
    if image is None:
        log("capture returned nothing")
        return None
    if not _has_content(image):
        log("capture was blank (grant Screen Recording to Ubersicht)")
        return None

    out = "/tmp/glass-wallpaper-capture.png"
    url = Quartz.CFURLCreateWithFileSystemPath(None, out, Quartz.kCFURLPOSIXPathStyle, False)
    dest = Quartz.CGImageDestinationCreateWithURL(url, "public.png", 1, None)
    if dest is None:
        log("could not write capture")
        return None
    Quartz.CGImageDestinationAddImage(dest, image, None)
    if not Quartz.CGImageDestinationFinalize(dest):
        log("could not finalize capture")
        return None
    return out


def _has_content(image):
    """True if the capture has real variation, not a permission-denied blank."""
    import Quartz

    data = Quartz.CGDataProviderCopyData(Quartz.CGImageGetDataProvider(image))
    if data is None:
        return False
    raw = bytes(data)
    if not raw:
        return False
    # Sample sparsely; a denied capture is a single flat colour.
    step = max(4, (len(raw) // 4000) * 4)
    seen = set()
    for offset in range(0, len(raw) - 4, step):
        seen.add(raw[offset : offset + 3])
        if len(seen) > 8:
            return True
    return False


def main():
    for label, finder in (
        ("index.plist", from_index_plist),
        ("asset-dir", from_asset_dir),
        ("screen-capture", from_screen_capture),
    ):
        try:
            found = finder()
        except Exception as exc:  # a broken method must not block the others
            log("%s failed: %s" % (label, exc))
            continue
        if found:
            log("source: %s" % label)
            print(found)
            return 0
    log("could not determine the current wallpaper")
    return 1


if __name__ == "__main__":
    sys.exit(main())
