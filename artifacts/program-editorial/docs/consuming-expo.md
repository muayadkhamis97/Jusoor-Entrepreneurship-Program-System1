# Expo consumption scope

Read `AGENTS.md` first. This package currently ships web primitives and portable
tokens, not React Native components or font/color hooks.

Expo can import the real portable token object:

```tsx
import { tokens } from "@workspace/program-editorial/tokens";
const palette = tokens.color.light;
```

Do not import `styles.css` or DOM components into React Native. A future mobile
implementation must build the required native families, match the web APIs
where appropriate, and load the source font families with a native font loader.
Those native families and hooks are not currently implemented; do not invent
imports or delete local native components on the assumption they exist.
