// example.widget — the smallest possible widget that gets a Liquid Glass background.
// It owns no WebGL of its own. It just renders a card and tells glass.widget where
// that card is, by pushing { getEl, radius } onto window.__glassRects.
import { css, React } from "uebersicht";

export const refreshFrequency = false; // static demo; no command needed

function Example() {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const item = { getEl: () => ref.current, radius: 22 };
    window.__glassRects = window.__glassRects || [];
    window.__glassRects.push(item);
    return () => {
      const a = window.__glassRects;
      const i = a.indexOf(item);
      if (i >= 0) a.splice(i, 1);
    };
  }, []);

  return (
    <div ref={ref} className={card}>
      <div className={title}>Hello, glass</div>
      <div className={sub}>This card has no background of its own — glass.widget draws it.</div>
    </div>
  );
}

export const render = () => <Example />;

export const className = css`
  position: fixed; inset: 0; pointer-events: none; z-index: 100;
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; color: rgba(255,255,255,0.96);
`;
const card = css`
  position: absolute; top: 80px; left: 80px; width: 300px;
  padding: 22px 24px; border-radius: 22px; pointer-events: auto;
`;
const title = css` font-size: 18px; font-weight: 700; letter-spacing: -0.01em; `;
const sub = css` font-size: 13px; font-weight: 500; opacity: 0.7; margin-top: 6px; line-height: 1.4; `;
