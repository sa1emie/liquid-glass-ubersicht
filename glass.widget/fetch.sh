#!/bin/bash
# glass.widget — builds bg.jpg, the wallpaper image the Liquid Glass shader samples.
#
# Ubersicht can't read the live desktop, so the glass refracts a snapshot of your
# wallpaper instead. This script keeps that snapshot current.
#
# It rebuilds bg.jpg when the file is missing, when it's over a week old, or when
# you've changed your wallpaper since it was made.
#
# To pin the glass to one specific image instead of your live wallpaper, put the
# absolute path to that image in a file named wallpaper.path next to this script.
set -u

WDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$WDIR/bg.jpg"
INDEX="$HOME/Library/Application Support/com.apple.wallpaper/Store/Index.plist"
WIDTH=1600

emit() { printf '{"ok":%s,"source":"%s","detail":"%s"}\n' "$1" "$2" "$3"; exit 0; }

# Records which source built the current bg.jpg. Comparing file timestamps isn't
# enough: adding wallpaper.path in the same second bg.jpg was written would be
# missed, and the override would silently do nothing.
STAMP="$WDIR/.bg.source"
stamp() { printf '%s' "$1" > "$STAMP" 2>/dev/null; }

# Detection can legitimately fail (see wallpaper_source.py), and a missing texture
# makes every card render as a dead flat rectangle. Rather than ship that, fall
# back to the bundled backdrop so the glass always looks like glass.
give_up() {
  if [[ -s "$WDIR/bg.default.jpg" ]]; then
    if /bin/cp "$WDIR/bg.default.jpg" "$OUT" 2>/dev/null; then
      stamp default
      emit true default "$1; using the bundled backdrop until you set wallpaper.path"
    fi
  fi
  emit false none "$1"
}

needs_rebuild() {
  [[ ! -s "$OUT" ]] && return 0                                        # missing or empty
  [[ -n "$(/usr/bin/find "$OUT" -mtime +7 2>/dev/null)" ]] && return 0 # over a week old
  [[ -f "$INDEX" && "$INDEX" -nt "$OUT" ]] && return 0                 # wallpaper changed since

  local want="auto" have
  [[ -f "$WDIR/wallpaper.path" ]] && want="wallpaper.path"
  have="$(/bin/cat "$STAMP" 2>/dev/null)"
  [[ "$have" != "$want" ]] && return 0   # override added or removed, or last run fell back to the default
  return 1
}

if ! needs_rebuild; then
  emit true cached "bg.jpg is current"
fi

# 1. An explicit override always wins, so you can point the glass at any image.
SRC=""
SOURCE=""
if [[ -f "$WDIR/wallpaper.path" ]]; then
  PINNED="$(/bin/cat "$WDIR/wallpaper.path" 2>/dev/null | /usr/bin/head -1)"
  if [[ -n "$PINNED" && -f "$PINNED" ]]; then
    SRC="$PINNED"
    SOURCE="wallpaper.path"
  else
    give_up "wallpaper.path points at a file that does not exist"
  fi
fi

# 2. Otherwise ask macOS what the current wallpaper is.
if [[ -z "$SRC" ]]; then
  SRC="$(/usr/bin/python3 "$WDIR/wallpaper_source.py" 2>/dev/null)"
  SOURCE="auto"
  if [[ -z "$SRC" || ! -f "$SRC" ]]; then
    give_up "could not detect your wallpaper automatically"
  fi
fi

# Multi-frame HEIC wallpapers hold both a light and a dark image; take the dark one.
case "$SRC" in
  *.heic|*.HEIC)
    TMP="/tmp/glass-wp-dark.png"
    /bin/rm -f "$TMP"
    /usr/bin/swift "$WDIR/extract_dark.swift" "$SRC" "$TMP" >/dev/null 2>&1
    [[ -s "$TMP" ]] && SRC="$TMP"
    ;;
esac

if ! /usr/bin/sips --resampleWidth "$WIDTH" -s format jpeg "$SRC" --out "$OUT" >/dev/null 2>&1; then
  give_up "could not read that image"
fi

# A texture that never loads leaves every card flat, so confirm the result is real.
if [[ ! -s "$OUT" ]]; then
  give_up "wrote an empty bg.jpg"
fi

stamp "$SOURCE"
emit true "$SOURCE" "rebuilt from $SRC"
