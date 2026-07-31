# Liquid Glass for Übersicht

A reusable Apple-style **Liquid Glass** renderer for [Übersicht](https://tracesof.net/uebersicht/)
widgets. Drop in one widget (`glass.widget`) and any of your other widgets can sit on real frosted
glass that refracts your desktop wallpaper, with one WebGL context shared across all of them.

This is the engine behind [liquid-glass-weather](https://github.com/sa1emie/liquid-glass-weather) and
[liquid-glass-discovery](https://github.com/sa1emie/liquid-glass-discovery), pulled out so you can use
it on your own widgets.

![Several widgets sharing one glass renderer](docs/showcase.png)

---

## Install

No terminal needed. Five minutes, start to finish.

**1. Install Übersicht.** It's the free app that runs desktop widgets on macOS.
[Download it here](https://tracesof.net/uebersicht/), drag it to your Applications folder, and open
it. A small thermometer icon appears in your menu bar. macOS may ask for permissions the first time,
which is normal.

**2. Download this project.** Click the green **Code** button at the top of this page, then
**Download ZIP**. Double-click the downloaded file to unzip it.

**3. Copy the widgets in.** Click the Übersicht icon in your menu bar and choose
**Open Widgets Folder**. A Finder window opens. Drag both the `glass.widget` and `example.widget`
folders from the unzipped download into that window. Select them together or drag them one at a time,
either works, but you need both.

**4. Reload.** Click the Übersicht menu bar icon and choose **Refresh All Widgets**.

You should see a glass card on your desktop. That's `example.widget`, a small demo you can delete once
you've wired up your own.

<details>
<summary>Prefer the terminal?</summary>

```bash
git clone https://github.com/sa1emie/liquid-glass-ubersicht.git
cd liquid-glass-ubersicht
cp -R glass.widget example.widget "$HOME/Library/Application Support/Übersicht/widgets/"
```

</details>

**One optional extra:** the Xcode Command Line Tools provide `swift`, used for one narrow case, pulling
the dark frame out of Apple's multi-frame HEIC wallpapers. Every other wallpaper works without it, and
installing it won't change anything if your wallpaper isn't one of those. If you want it anyway, run
`xcode-select --install`.

---

## Make it match your wallpaper

This is the part worth understanding, because it's what makes the glass look real.

Übersicht widgets can't see the live desktop the way a real window can. So instead of reading your
screen, the glass reads a **snapshot of your wallpaper** (`glass.widget/bg.jpg`) and lines that image
up with wherever each card sits. Refraction, the bend at the rim, the color fringe: all of it samples
that one image. Get the snapshot right and the glass looks like it's genuinely sitting on your
desktop. Get it wrong and the cards look like flat grey rectangles.

### It should just work

The first time it runs, `glass.widget` figures out your current wallpaper on its own and builds the
snapshot. It handles regular image wallpapers, Apple's dynamic ones, and the aerial/screensaver
wallpapers.

If it can't work out which wallpaper you're using, it falls back to a dark backdrop bundled with the
widget. The glass still looks like glass, it just isn't refracting *your* wallpaper yet. Setting
`wallpaper.path` below fixes that in about ten seconds.

Aerial and dynamic wallpapers aren't stored as a plain image file anywhere, so the only way to read
them is to photograph the layer macOS draws the wallpaper into. That needs Screen Recording
permission for Übersicht. macOS doesn't reliably prompt for this, so if your glass is showing the
bundled backdrop and you'd like automatic detection instead, add Übersicht under
System Settings → Privacy & Security → Screen Recording. It only ever captures the wallpaper layer,
never your windows. Setting `wallpaper.path` avoids the permission entirely.

### Point it at a specific image instead

If you'd rather choose the image yourself, or you want the glass to refract something other than your
actual wallpaper, create a file called `wallpaper.path` inside `glass.widget/` containing one line:
the full path to any image.

The easy way to get that path: find your image in Finder, right-click it, hold <kbd>Option</kbd>, and
choose **Copy _(filename)_ as Pathname**. Then paste it into the file.

```
/Users/you/Pictures/my-wallpaper.jpg
```

That setting always wins, so nothing will overwrite it. It takes effect on the next refresh, so choose
**Refresh All Widgets** from the Übersicht menu and you'll see it. Delete the file to go back to
automatic detection.

### When you change your wallpaper

The snapshot refreshes on its own, usually within a day. To see it immediately, choose
**Refresh All Widgets** from the Übersicht menu.

### Which wallpapers look best

Anything with some variation in it, since refraction needs detail to bend. A photo, a gradient, or an
abstract render all work well. Darker wallpapers suit the default tuning best. A flat single-color
background will technically work but there's nothing there to refract, so the effect is subtle.

---

## Troubleshooting

**The glass doesn't match my wallpaper.**
Detection fell back to the bundled backdrop. Set `wallpaper.path` as described above and refresh.

**The cards look like flat, dark rectangles with no refraction at all.**
That means no snapshot got built, not even the fallback. Check whether `glass.widget/bg.jpg` exists
and is more than a few KB. To see what happened, run this in Terminal:

```bash
bash "$HOME/Library/Application Support/Übersicht/widgets/glass.widget/fetch.sh"
```

It prints what it did and, if something went wrong, why. Übersicht itself never shows you this
output, so running it by hand is the only way to see it.

**Nothing appears on the desktop at all.**
Check that the widget folders landed in the right place using **Open Widgets Folder**, and that they
kept their `.widget` folder names. If Übersicht is running but the desktop is empty, quit and reopen
it.

**The glass refracts the wrong image.**
You have a `wallpaper.path` file pinning it to that image. Delete the file and refresh to go back to
automatic detection.

---

## Add glass to your own widget

Drop the CSS background from your card and register the element:

```jsx
import { css, React } from "uebersicht";

function MyWidget() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const item = { getEl: () => ref.current, radius: 22 };
    window.__glassRects = (window.__glassRects || []);
    window.__glassRects.push(item);
    return () => {
      const a = window.__glassRects;
      const i = a.indexOf(item);
      if (i >= 0) a.splice(i, 1);
    };
  }, []);
  return <div ref={ref} className={card}>…your content…</div>;
}
export const render = () => <MyWidget />;
```

The card needs `pointer-events: auto` and a corner `radius` that matches what you pass.
`glass.widget` reads the element's position every frame, so the glass follows hover, resize, and
expand on its own. `example.widget` is a complete working version of the above.

| Field | Type | Meaning |
|---|---|---|
| `getEl` | `() => HTMLElement \| null` | Returns your card element (return `null` when it shouldn't be drawn). |
| `radius` | `number` | Corner radius in CSS px, to match your card's `border-radius`. |
| `hover` | `boolean` (optional) | Set `false` on non-interactive cards so they don't brighten under the cursor. Defaults to on. |

Register a modal exactly like a card, but push it onto `window.__glassModalRects` instead.

---

## Why it's a shader and not CSS

The common web "liquid glass" recipe is an SVG displacement filter run through `backdrop-filter`.
That's Chromium-only, and Übersicht renders in WebKit, where it quietly degrades to a flat blur that
can't see the desktop at all. So the refraction here is a small WebGL fragment shader instead:

- A signed-distance rounded rectangle for crisp, anti-aliased edges at Retina resolution.
- Refraction concentrated at the rim, so the center stays clear and only the edge bends the wallpaper.
- Chromatic aberration on that edge for the Liquid Glass color fringe.
- A specular rim, a top highlight, and a soft drop shadow.

## One context, many cards

`glass.widget` owns the WebGL so your widgets don't have to. They just publish where their card is,
and one renderer draws the glass under all of them. That's a fixed cost no matter how many widgets
opt in: one base canvas for the cards, plus a second canvas for expand panels.

Rather than redraw every frame, the renderer tracks each card's position, hover, and size and only
touches the GPU when something actually changes, so an idle desktop costs next to nothing.

### Expand panels

Widgets that open a modal (a click-to-expand reader, a full forecast) register that panel on a second
list, `window.__glassModalRects`. It draws on a top canvas above your other widgets and paints a
dimmed backdrop behind itself, so the panel reads as glass floating over a darkened desktop. Return
`null` from the panel's `getEl` while it's closed and the backdrop fades out with it.

## License

MIT
