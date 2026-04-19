# icloudpd-web Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Next.js frontend with a Vite+React SPA served by FastAPI from the same process, consuming the new REST+SSE backend.

**Architecture:** React 18 + Vite + TypeScript single-page app. TanStack Query for REST caching, SSE subscriptions to invalidate or stream into caches. Modal-driven UX matching the old app. Build output lives in `src/icloudpd_web/web_dist/` and is served by FastAPI as static files with an SPA catch-all. Passwordless mode when backend has no password configured.

**Tech Stack:** React 18, Vite, TypeScript, TanStack Query v5, Tailwind CSS, shadcn/ui, Zustand, Vitest, React Testing Library, MSW.

---

## Phase 1 — Backend Preparation

### Task 1: Passwordless authentication mode

**Files:**
- Modify: `src/icloudpd_web/auth.py`
- Modify: `src/icloudpd_web/api/auth.py`
- Modify: `src/icloudpd_web/app.py`
- Modify: `src/icloudpd_web/cli.py`
- Test: `tests/test_auth.py`, `tests/api/test_auth.py`

- [ ] **Step 1: Write failing test — Authenticator with None hash**

Add to `tests/test_auth.py`:

```python
def test_authenticator_none_hash_disables_auth() -> None:
    a = Authenticator(password_hash=None)
    assert a.auth_required is False
    assert a.verify("anything") is True
```

- [ ] **Step 2: Run test**

Run: `uv run pytest tests/test_auth.py::test_authenticator_none_hash_disables_auth -v`
Expected: FAIL

- [ ] **Step 3: Update Authenticator**

Modify `src/icloudpd_web/auth.py`:

```python
class Authenticator:
    def __init__(self, password_hash: str | None) -> None:
        self._hash = password_hash

    @property
    def auth_required(self) -> bool:
        return self._hash is not None

    @staticmethod
    def hash(password: str) -> str:
        salt = secrets.token_hex(16)
        h = hashlib.scrypt(_normalize(password), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return f"scrypt${salt}${h}"

    def verify(self, password: str) -> bool:
        if self._hash is None:
            return True
        try:
            scheme, salt, h = self._hash.split("$")
            assert scheme == "scrypt"
        except Exception:
            return False
        got = hashlib.scrypt(_normalize(password), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(got, h)


def require_auth(request: Request) -> bool:
    a: Authenticator = request.app.state.authenticator
    if not a.auth_required:
        return True
    if not request.session.get("authed"):
        raise ApiError("Not authenticated", status_code=401)
    return True
```

- [ ] **Step 4: Write failing test — /auth/status reports auth_required**

Add to `tests/api/test_auth.py`:

```python
def test_status_passwordless(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        r = c.get("/auth/status")
        assert r.json() == {"authenticated": True, "auth_required": False}

def test_status_with_password(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=Authenticator.hash("pw")),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        r = c.get("/auth/status")
        assert r.json() == {"authenticated": False, "auth_required": True}

def test_login_rejected_in_passwordless(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path,
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
    )
    with TestClient(app) as c:
        r = c.post("/auth/login", json={"password": "anything"})
        assert r.status_code == 400
```

- [ ] **Step 5: Update `/auth/status` and `/auth/login`**

Modify `src/icloudpd_web/api/auth.py`:

```python
@router.get("/status")
def status(request: Request) -> dict[str, bool]:
    a: Authenticator = request.app.state.authenticator
    if not a.auth_required:
        return {"authenticated": True, "auth_required": False}
    return {
        "authenticated": bool(request.session.get("authed")),
        "auth_required": True,
    }


@router.post("/login")
def login(body: LoginBody, request: Request) -> dict[str, bool]:
    a: Authenticator = request.app.state.authenticator
    if not a.auth_required:
        raise ApiError("Authentication is disabled on this server", status_code=400)
    if not a.verify(body.password):
        raise ApiError("Invalid password", status_code=401)
    request.session["authed"] = True
    return {"ok": True}
```

- [ ] **Step 6: Update CLI to allow starting without a password**

Find where CLI loads the password hash. Replace the "password required" check so that a missing hash file yields `Authenticator(password_hash=None)` with a warning logged. Modify `src/icloudpd_web/cli.py`:

```python
def _load_authenticator(data_dir: Path) -> Authenticator:
    path = data_dir / "password.hash"
    if not path.exists():
        print("WARNING: no password configured — server running in passwordless mode. "
              "Run `icloudpd-web init-password` to enable authentication.", file=sys.stderr)
        return Authenticator(password_hash=None)
    return Authenticator(password_hash=path.read_text().strip())
```

Replace the existing authenticator construction in the `serve` command to call `_load_authenticator(data_dir)`.

- [ ] **Step 7: Run all auth tests**

Run: `uv run pytest tests/test_auth.py tests/api/test_auth.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/icloudpd_web/auth.py src/icloudpd_web/api/auth.py src/icloudpd_web/cli.py tests/test_auth.py tests/api/test_auth.py
git commit -m "feat(auth): passwordless mode when no hash configured"
```

---

### Task 2: Serve static SPA assets

**Files:**
- Create: `src/icloudpd_web/static.py`
- Modify: `src/icloudpd_web/app.py`
- Modify: `pyproject.toml`
- Test: `tests/test_static.py`

- [ ] **Step 1: Write failing test — assets served, SPA catch-all**

Create `tests/test_static.py`:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from icloudpd_web.app import create_app
from icloudpd_web.auth import Authenticator


def _make_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><html>app</html>")
    (dist / "assets" / "main.js").write_text("console.log('x');")
    return dist


def test_index_served_at_root(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "<html>app</html>" in r.text


def test_asset_served(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/assets/main.js")
        assert r.status_code == 200
        assert "console.log" in r.text


def test_spa_catchall_returns_index(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/some/deep/route")
        assert r.status_code == 200
        assert "<html>app</html>" in r.text


def test_api_routes_not_shadowed(tmp_path: Path) -> None:
    dist = _make_dist(tmp_path)
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=dist,
    )
    with TestClient(app) as c:
        r = c.get("/auth/status")
        assert r.status_code == 200
        assert r.json()["auth_required"] is False


def test_no_static_dir_returns_placeholder(tmp_path: Path) -> None:
    app = create_app(
        data_dir=tmp_path / "data",
        authenticator=Authenticator(password_hash=None),
        session_secret="s" * 32,
        static_dir=None,
    )
    with TestClient(app) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "web_dist" in r.text.lower() or "not built" in r.text.lower()
```

- [ ] **Step 2: Run tests to see them fail**

Run: `uv run pytest tests/test_static.py -v`
Expected: FAIL — `create_app` does not accept `static_dir`.

- [ ] **Step 3: Create static module**

Create `src/icloudpd_web/static.py`:

```python
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles


_PLACEHOLDER = """<!doctype html>
<html><head><title>icloudpd-web</title></head>
<body><main style="font-family:sans-serif;padding:2em;max-width:40em">
<h1>Frontend not built</h1>
<p>The SPA assets are missing. Run <code>make build-web</code> or install from a
release that bundles <code>web_dist/</code>.</p>
</main></body></html>
"""


def install_static(app: FastAPI, static_dir: Path | None) -> None:
    if static_dir is None or not static_dir.exists():
        @app.get("/{full_path:path}", include_in_schema=False)
        def _placeholder(full_path: str) -> HTMLResponse:
            return HTMLResponse(_PLACEHOLDER)
        return

    index = static_dir / "index.html"
    app.mount(
        "/assets",
        StaticFiles(directory=static_dir / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa(full_path: str) -> FileResponse:
        candidate = static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)
```

- [ ] **Step 4: Wire into create_app**

Modify `src/icloudpd_web/app.py`. Add `static_dir: Path | None = None` to `create_app` signature, import `install_static`, and call it as the last step before `return app`:

```python
from icloudpd_web.static import install_static

def create_app(
    *,
    data_dir: Path,
    authenticator: Authenticator,
    session_secret: str,
    icloudpd_argv: Callable[[Path], list[str]] = _default_icloudpd_argv,
    static_dir: Path | None = None,
) -> FastAPI:
    # ... existing body unchanged until end ...
    app.include_router(streams_router.router)
    install_static(app, static_dir)
    return app
```

- [ ] **Step 5: Update CLI to pass static_dir**

In `src/icloudpd_web/cli.py`, wire a default static dir pointing to the installed `web_dist`:

```python
from importlib.resources import files

def _default_static_dir() -> Path | None:
    try:
        p = Path(str(files("icloudpd_web").joinpath("web_dist")))
    except (ModuleNotFoundError, FileNotFoundError):
        return None
    return p if p.exists() else None
```

In the `serve` command, pass `static_dir=_default_static_dir()` to `create_app`.

- [ ] **Step 6: Update pyproject.toml package data**

Modify `pyproject.toml`. Under the hatch/build targets section (find `[tool.hatch.build.targets.wheel]` or equivalent), add:

```toml
[tool.hatch.build.targets.wheel.force-include]
"src/icloudpd_web/web_dist" = "icloudpd_web/web_dist"
```

If the project uses a different build backend (check the `[build-system]` block), add the equivalent package-data directive.

- [ ] **Step 7: Run tests**

Run: `uv run pytest tests/test_static.py -v`
Expected: PASS (all 5)

- [ ] **Step 8: Run full test suite**

Run: `uv run pytest`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/icloudpd_web/static.py src/icloudpd_web/app.py src/icloudpd_web/cli.py pyproject.toml tests/test_static.py
git commit -m "feat(app): serve SPA static assets with catch-all fallback"
```

---

## Phase 2 — Frontend Scaffold

### Task 3: Delete old frontend, scaffold Vite project

**Files:**
- Delete: `web/` (entire directory)
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/app.tsx`
- Create: `web/.gitignore`

- [ ] **Step 1: Remove old Next.js frontend**

```bash
git rm -r web/
git commit -m "chore(web): remove old Next.js frontend"
```

- [ ] **Step 2: Initialize new web/ directory**

```bash
mkdir -p web/src web/tests
```

- [ ] **Step 3: Create `web/package.json`**

```json
{
  "name": "icloudpd-web-ui",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --check .",
    "format:fix": "prettier --write ."
  },
  "dependencies": {
    "@tanstack/react-query": "^5.51.0",
    "clsx": "^2.1.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.5.2",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.12.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "eslint-plugin-react-refresh": "^0.4.12",
    "jsdom": "^25.0.1",
    "msw": "^2.4.9",
    "postcss": "^8.4.47",
    "prettier": "^3.3.3",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 4: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 5: Create `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const BACKEND = process.env.ICLOUDPD_WEB_BACKEND ?? "http://localhost:8000";
const API_PREFIXES = ["/auth", "/policies", "/runs", "/settings", "/mfa"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: BACKEND, changeOrigin: true }])
    ),
  },
  build: {
    outDir: "../src/icloudpd_web/web_dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    css: false,
  },
});
```

- [ ] **Step 6: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>icloudpd-web</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create placeholder `web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Create placeholder `web/src/app.tsx`**

```tsx
export function App() {
  return <div>icloudpd-web</div>;
}
```

- [ ] **Step 9: Create `web/src/index.css` (empty for now)**

```css
/* tailwind directives added in Task 4 */
```

- [ ] **Step 10: Create `web/.gitignore`**

```
node_modules
dist
*.log
.vite
```

- [ ] **Step 11: Update root `.gitignore`**

Add to root `.gitignore`:

```
src/icloudpd_web/web_dist/
```

- [ ] **Step 12: Install deps and verify build**

```bash
cd web && npm install && npm run build && cd ..
```

Expected: build succeeds, `src/icloudpd_web/web_dist/index.html` exists.

- [ ] **Step 13: Commit**

```bash
git add web/ .gitignore
git commit -m "feat(web): scaffold Vite+React+TS project"
```

---

### Task 4: Tailwind, shadcn primitives, linting

**Files:**
- Create: `web/tailwind.config.ts`, `web/postcss.config.js`
- Modify: `web/src/index.css`
- Create: `web/.eslintrc.cjs`, `web/.prettierrc`
- Create: `web/src/lib/cn.ts`
- Create: `web/src/components/ui/button.tsx`, `web/src/components/ui/input.tsx`, `web/src/components/ui/modal.tsx`, `web/src/components/ui/badge.tsx`
- Create: `web/tests/setup.ts`

- [ ] **Step 1: Create `web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#2563eb",
        danger: "#dc2626",
        success: "#16a34a",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Create `web/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Populate `web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

html, body, #root {
  height: 100%;
}

body {
  margin: 0;
  background: #f8fafc;
  color: #0f172a;
}
```

- [ ] **Step 4: Create `web/src/lib/cn.ts`**

```ts
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
```

- [ ] **Step 5: Create `web/src/components/ui/button.tsx`**

```tsx
import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-blue-700",
  secondary: "bg-white border border-slate-300 text-slate-800 hover:bg-slate-50",
  danger: "bg-danger text-white hover:bg-red-700",
  ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
};

export function Button({ variant = "primary", className, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        styles[variant],
        className
      )}
    />
  );
}
```

- [ ] **Step 6: Create `web/src/components/ui/input.tsx`**

```tsx
import { cn } from "@/lib/cn";
import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: Props) {
  return (
    <input
      {...rest}
      className={cn(
        "w-full rounded-md border px-3 py-1.5 text-sm outline-none",
        invalid
          ? "border-danger focus:ring-1 focus:ring-danger"
          : "border-slate-300 focus:ring-1 focus:ring-accent",
        className
      )}
    />
  );
}
```

- [ ] **Step 7: Create `web/src/components/ui/modal.tsx`**

```tsx
import { cn } from "@/lib/cn";
import { type ReactNode, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  widthClass?: string;
}

export function Modal({ open, onClose, title, children, widthClass = "max-w-2xl" }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-16"
      onClick={onClose}
      role="dialog"
      aria-label={title}
    >
      <div
        className={cn("w-full rounded-lg bg-white shadow-xl mx-4", widthClass)}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900"
          >
            ✕
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create `web/src/components/ui/badge.tsx`**

```tsx
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "danger" | "info" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-green-100 text-green-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-800",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex px-2 py-0.5 text-xs rounded font-medium", tones[tone])}>
      {children}
    </span>
  );
}
```

- [ ] **Step 9: Create `web/.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "react-refresh"],
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist", "node_modules", ".eslintrc.cjs"],
};
```

- [ ] **Step 10: Create `web/.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100
}
```

- [ ] **Step 11: Create `web/tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 12: Verify**

```bash
cd web && npm run build && npm run lint && cd ..
```

Expected: both succeed.

- [ ] **Step 13: Commit**

```bash
git add web/
git commit -m "feat(web): add Tailwind, shadcn primitives, lint config"
```

---

## Phase 3 — API client and types

### Task 5: Shared types and error-normalizing fetch client

**Files:**
- Create: `web/src/types/api.ts`
- Create: `web/src/api/client.ts`
- Create: `web/tests/api/client.test.ts`

- [ ] **Step 1: Create `web/src/types/api.ts`**

```ts
export interface PolicyNotifications {
  on_start: boolean;
  on_success: boolean;
  on_failure: boolean;
}

export interface PolicyAwsConfig {
  bucket: string;
  prefix?: string;
  region?: string;
  access_key_id?: string;
  secret_access_key?: string;
}

export interface Policy {
  name: string;
  username: string;
  directory: string;
  cron: string;
  enabled: boolean;
  timezone?: string | null;
  icloudpd: Record<string, unknown>;
  notifications: PolicyNotifications;
  aws: PolicyAwsConfig | null;
}

export type RunStatus =
  | "running"
  | "awaiting_mfa"
  | "success"
  | "failed"
  | "stopped";

export interface RunSummary {
  run_id: string;
  policy_name: string;
  status: RunStatus;
  started_at: string;
  ended_at?: string | null;
  exit_code?: number | null;
  error_id?: string | null;
  downloaded?: number;
  total?: number;
}

export interface PolicyView extends Policy {
  is_running: boolean;
  next_run_at?: string | null;
  last_run?: RunSummary | null;
  has_password: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  auth_required: boolean;
}

export interface AppSettings {
  apprise: { urls: string[]; on_start: boolean; on_success: boolean; on_failure: boolean };
  retention_runs: number;
}

export interface ApiErrorBody {
  error: string;
  error_id: string | null;
  field: string | null;
}
```

- [ ] **Step 2: Write failing test — fetch wrapper error normalization**

Create `web/tests/api/client.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError } from "@/api/client";

const origFetch = globalThis.fetch;

describe("apiFetch", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns JSON body on 2xx", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ hello: "world" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const got = await apiFetch<{ hello: string }>("/x");
    expect(got).toEqual({ hello: "world" });
  });

  it("throws ApiError with backend shape on non-2xx", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "nope", error_id: "srv-1", field: "name" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );
    await expect(apiFetch("/x")).rejects.toMatchObject({
      message: "nope",
      errorId: "srv-1",
      field: "name",
      status: 400,
    });
  });

  it("throws ApiError with status-text fallback on non-JSON error", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response("oops", { status: 500, statusText: "Internal Server Error" })
    );
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("sends credentials and JSON body on POST", async () => {
    const spy = vi.fn().mockResolvedValueOnce(
      new Response("null", { status: 200, headers: { "Content-Type": "application/json" } })
    );
    globalThis.fetch = spy as any;
    await apiFetch("/y", { method: "POST", body: { a: 1 } });
    expect(spy).toHaveBeenCalledWith(
      "/y",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ a: 1 }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });
});
```

- [ ] **Step 3: Run test — fails (no client)**

```bash
cd web && npx vitest run tests/api/client.test.ts
```

Expected: FAIL

- [ ] **Step 4: Create `web/src/api/client.ts`**

```ts
import type { ApiErrorBody } from "@/types/api";

export class ApiError extends Error {
  readonly errorId: string | null;
  readonly field: string | null;
  readonly status: number;

  constructor(message: string, status: number, errorId: string | null, field: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorId = errorId;
    this.field = field;
  }
}

export interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    credentials: "include",
    signal: opts.signal,
    headers: {
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };

  const response = await fetch(path, init);
  const contentType = response.headers.get("Content-Type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    if (isJson) {
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = null;
      }
    }
    throw new ApiError(
      body?.error ?? response.statusText ?? `HTTP ${response.status}`,
      response.status,
      body?.error_id ?? null,
      body?.field ?? null
    );
  }

  if (response.status === 204) return undefined as T;
  if (!isJson) return (await response.text()) as T;
  return (await response.json()) as T;
}
```

- [ ] **Step 5: Run test**

```bash
cd web && npx vitest run tests/api/client.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add web/src/types/api.ts web/src/api/client.ts web/tests/api/client.test.ts
git commit -m "feat(web): add API fetch client with error normalization"
```

---

### Task 6: Resource API modules (auth, policies, runs, settings, mfa)

**Files:**
- Create: `web/src/api/auth.ts`, `web/src/api/policies.ts`, `web/src/api/runs.ts`, `web/src/api/settings.ts`, `web/src/api/mfa.ts`
- Create: `web/tests/api/policies.test.ts`

- [ ] **Step 1: Create `web/src/api/auth.ts`**

```ts
import { apiFetch } from "./client";
import type { AuthStatus } from "@/types/api";

export const authApi = {
  status: () => apiFetch<AuthStatus>("/auth/status"),
  login: (password: string) =>
    apiFetch<{ ok: boolean }>("/auth/login", { method: "POST", body: { password } }),
  logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
};
```

- [ ] **Step 2: Create `web/src/api/policies.ts`**

```ts
import { apiFetch } from "./client";
import type { Policy, PolicyView } from "@/types/api";

export const policiesApi = {
  list: () => apiFetch<PolicyView[]>("/policies"),
  get: (name: string) => apiFetch<PolicyView>(`/policies/${encodeURIComponent(name)}`),
  upsert: (name: string, policy: Policy) =>
    apiFetch<PolicyView>(`/policies/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: policy,
    }),
  remove: (name: string) =>
    apiFetch<void>(`/policies/${encodeURIComponent(name)}`, { method: "DELETE" }),
  setPassword: (name: string, password: string) =>
    apiFetch<void>(`/policies/${encodeURIComponent(name)}/password`, {
      method: "PUT",
      body: { password },
    }),
};
```

- [ ] **Step 3: Create `web/src/api/runs.ts`**

```ts
import { apiFetch } from "./client";
import type { RunSummary } from "@/types/api";

export const runsApi = {
  start: (policyName: string) =>
    apiFetch<{ run_id: string }>(
      `/policies/${encodeURIComponent(policyName)}/runs`,
      { method: "POST" }
    ),
  stop: (runId: string) => apiFetch<void>(`/runs/${runId}`, { method: "DELETE" }),
  history: (policyName: string) =>
    apiFetch<RunSummary[]>(`/policies/${encodeURIComponent(policyName)}/runs`),
  logUrl: (runId: string) => `/runs/${runId}/log`,
};
```

- [ ] **Step 4: Create `web/src/api/settings.ts`**

```ts
import { apiFetch } from "./client";
import type { AppSettings } from "@/types/api";

export const settingsApi = {
  get: () => apiFetch<AppSettings>("/settings"),
  put: (settings: AppSettings) =>
    apiFetch<AppSettings>("/settings", { method: "PUT", body: settings }),
};
```

- [ ] **Step 5: Create `web/src/api/mfa.ts`**

```ts
import { apiFetch } from "./client";

export const mfaApi = {
  status: (policyName: string) =>
    apiFetch<{ awaiting: boolean }>(
      `/policies/${encodeURIComponent(policyName)}/mfa/status`
    ),
  submit: (policyName: string, code: string) =>
    apiFetch<{ ok: boolean }>(
      `/policies/${encodeURIComponent(policyName)}/mfa`,
      { method: "PUT", body: { code } }
    ),
};
```

- [ ] **Step 6: Write failing test — policies.upsert URL-encodes name**

Create `web/tests/api/policies.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { policiesApi } from "@/api/policies";

const origFetch = globalThis.fetch;

describe("policiesApi", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("url-encodes policy names with special characters", async () => {
    await policiesApi.get("has space");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/policies/has%20space",
      expect.any(Object)
    );
  });

  it("sends PUT with body for upsert", async () => {
    const policy = {
      name: "p",
      username: "u@icloud.com",
      directory: "/tmp/p",
      cron: "0 * * * *",
      enabled: true,
      icloudpd: {},
      notifications: { on_start: false, on_success: true, on_failure: true },
      aws: null,
    };
    await policiesApi.upsert("p", policy as any);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/policies/p",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(policy),
      })
    );
  });
});
```

- [ ] **Step 7: Run tests**

```bash
cd web && npx vitest run tests/api/
```

Expected: PASS (all tests across client + policies)

- [ ] **Step 8: Commit**

```bash
git add web/src/api/ web/tests/api/policies.test.ts
git commit -m "feat(web): add resource API modules"
```

---

### Task 7: SSE subscription helper

**Files:**
- Create: `web/src/api/sse.ts`
- Create: `web/tests/api/sse.test.ts`

- [ ] **Step 1: Write failing test — SSE helper parses events**

Create `web/tests/api/sse.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { subscribeEvents } from "@/api/sse";

class FakeEventSource {
  url: string;
  withCredentials: boolean;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  static last: FakeEventSource | null = null;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((x) => x !== fn);
  }
  close() {
    this.closed = true;
  }
  dispatch(type: string, data: unknown, lastEventId?: string) {
    const event = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
      lastEventId: lastEventId ?? "",
    });
    (this.listeners[type] || []).forEach((fn) => fn(event));
  }
}

describe("subscribeEvents", () => {
  beforeEach(() => {
    (globalThis as any).EventSource = FakeEventSource;
  });
  afterEach(() => {
    delete (globalThis as any).EventSource;
  });

  it("routes named events to handlers and tracks last-event-id", () => {
    const onLog = vi.fn();
    const onStatus = vi.fn();
    const sub = subscribeEvents("/runs/abc/events", {
      log: onLog,
      status: onStatus,
    });
    FakeEventSource.last!.dispatch("log", { line: "hi" }, "1");
    FakeEventSource.last!.dispatch("status", { status: "success" }, "2");
    expect(onLog).toHaveBeenCalledWith({ line: "hi" }, "1");
    expect(onStatus).toHaveBeenCalledWith({ status: "success" }, "2");
    sub.close();
    expect(FakeEventSource.last!.closed).toBe(true);
  });

  it("passes credentials flag to EventSource", () => {
    subscribeEvents("/policies/stream", {});
    expect(FakeEventSource.last!.withCredentials).toBe(true);
  });

  it("invokes onError when source errors", () => {
    const onError = vi.fn();
    subscribeEvents("/x", {}, { onError });
    const err = new Event("error");
    FakeEventSource.last!.onerror?.(err);
    expect(onError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — fails**

```bash
cd web && npx vitest run tests/api/sse.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create `web/src/api/sse.ts`**

```ts
type Handler = (data: unknown, lastEventId: string) => void;

export interface SseSubscription {
  close(): void;
}

export interface SseOptions {
  onError?: (e: Event) => void;
}

export function subscribeEvents(
  url: string,
  handlers: Record<string, Handler>,
  opts: SseOptions = {}
): SseSubscription {
  const source = new EventSource(url, { withCredentials: true });
  const wrapped: Record<string, (e: MessageEvent) => void> = {};

  for (const [name, fn] of Object.entries(handlers)) {
    wrapped[name] = (event) => {
      let parsed: unknown = event.data;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        /* raw string */
      }
      fn(parsed, event.lastEventId);
    };
    source.addEventListener(name, wrapped[name]);
  }

  if (opts.onError) {
    source.onerror = opts.onError;
  }

  return {
    close() {
      for (const [name, fn] of Object.entries(wrapped)) {
        source.removeEventListener(name, fn);
      }
      source.close();
    },
  };
}
```

- [ ] **Step 4: Run test**

```bash
cd web && npx vitest run tests/api/sse.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/api/sse.ts web/tests/api/sse.test.ts
git commit -m "feat(web): add SSE subscription helper"
```

---

## Phase 4 — State and hooks

### Task 8: Query client and auth hooks

**Files:**
- Modify: `web/src/main.tsx`
- Create: `web/src/hooks/useAuth.ts`
- Create: `web/src/lib/queryClient.ts`
- Create: `web/tests/hooks/useAuth.test.tsx`

- [ ] **Step 1: Create `web/src/lib/queryClient.ts`**

```ts
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 1;
      },
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
```

- [ ] **Step 2: Update `web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app";
import { queryClient } from "./lib/queryClient";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 3: Create `web/src/hooks/useAuth.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/api/auth";

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth", "status"],
    queryFn: authApi.status,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => authApi.login(password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "status"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      qc.clear();
      qc.invalidateQueries({ queryKey: ["auth", "status"] });
    },
  });
}
```

- [ ] **Step 4: Write failing test — useAuthStatus against MSW**

Create `web/tests/hooks/useAuth.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { useAuthStatus, useLogin } from "@/hooks/useAuth";

const server = setupServer(
  http.get("/auth/status", () =>
    HttpResponse.json({ authenticated: false, auth_required: true })
  ),
  http.post("/auth/login", async ({ request }) => {
    const body = (await request.json()) as { password: string };
    if (body.password === "good") return HttpResponse.json({ ok: true });
    return HttpResponse.json(
      { error: "Invalid password", error_id: null, field: "password" },
      { status: 401 }
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useAuthStatus", () => {
  it("returns backend status", async () => {
    const { result } = renderHook(() => useAuthStatus(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ authenticated: false, auth_required: true });
  });
});

describe("useLogin", () => {
  it("succeeds on correct password", async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: wrapper() });
    await result.current.mutateAsync("good");
    expect(result.current.isSuccess).toBe(true);
  });

  it("fails on wrong password", async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync("bad")).rejects.toMatchObject({
      field: "password",
    });
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd web && npx vitest run tests/hooks/useAuth.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/main.tsx web/src/hooks/useAuth.ts web/src/lib/queryClient.ts web/tests/hooks/useAuth.test.tsx
git commit -m "feat(web): query client and auth hooks"
```

---

### Task 9: Policy hooks with SSE invalidation

**Files:**
- Create: `web/src/hooks/usePolicies.ts`
- Create: `web/tests/hooks/usePolicies.test.tsx`

- [ ] **Step 1: Create `web/src/hooks/usePolicies.ts`**

```ts
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { policiesApi } from "@/api/policies";
import { subscribeEvents } from "@/api/sse";
import type { Policy, PolicyView } from "@/types/api";

const LIST_KEY = ["policies"] as const;

export function usePolicies() {
  return useQuery({ queryKey: LIST_KEY, queryFn: policiesApi.list });
}

export function usePolicy(name: string | null) {
  return useQuery({
    queryKey: ["policies", name],
    queryFn: () => policiesApi.get(name!),
    enabled: name !== null,
  });
}

export function useUpsertPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, policy }: { name: string; policy: Policy }) =>
      policiesApi.upsert(name, policy),
    onSuccess: (updated: PolicyView) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.setQueryData(["policies", updated.name], updated);
    },
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => policiesApi.remove(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useSetPolicyPassword() {
  return useMutation({
    mutationFn: ({ name, password }: { name: string; password: string }) =>
      policiesApi.setPassword(name, password),
  });
}

export function usePoliciesLiveUpdate(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const sub = subscribeEvents("/policies/stream", {
      generation: () => {
        qc.invalidateQueries({ queryKey: LIST_KEY });
      },
    });
    return () => sub.close();
  }, [enabled, qc]);
}
```

- [ ] **Step 2: Write failing test — usePolicies fetches and revalidates on SSE**

Create `web/tests/hooks/usePolicies.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { usePolicies, usePoliciesLiveUpdate } from "@/hooks/usePolicies";

let callCount = 0;
const server = setupServer(
  http.get("/policies", () => {
    callCount += 1;
    return HttpResponse.json([
      {
        name: "p",
        username: "u@icloud.com",
        directory: "/tmp/p",
        cron: "0 * * * *",
        enabled: true,
        icloudpd: {},
        notifications: { on_start: false, on_success: true, on_failure: true },
        aws: null,
        is_running: false,
        has_password: false,
      },
    ]);
  })
);

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  close() {}
  dispatch(type: string) {
    const e = new MessageEvent(type, { data: JSON.stringify({ generation: 2 }) });
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
}

beforeAll(() => {
  server.listen();
  (globalThis as any).EventSource = FakeEventSource;
});
afterEach(() => {
  server.resetHandlers();
  callCount = 0;
});
afterAll(() => {
  server.close();
  delete (globalThis as any).EventSource;
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("usePolicies + usePoliciesLiveUpdate", () => {
  it("fetches and re-fetches on SSE generation event", async () => {
    const W = wrapper();
    const { result } = renderHook(
      () => {
        usePoliciesLiveUpdate(true);
        return usePolicies();
      },
      { wrapper: W }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callCount).toBe(1);

    act(() => {
      FakeEventSource.last!.dispatch("generation");
    });

    await waitFor(() => expect(callCount).toBe(2));
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd web && npx vitest run tests/hooks/usePolicies.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/usePolicies.ts web/tests/hooks/usePolicies.test.tsx
git commit -m "feat(web): policy query hooks with SSE invalidation"
```

---

### Task 10: Run hooks, run store, settings hook

**Files:**
- Create: `web/src/store/runStore.ts`
- Create: `web/src/hooks/useRuns.ts`
- Create: `web/src/hooks/useRunEvents.ts`
- Create: `web/src/hooks/useSettings.ts`
- Create: `web/tests/store/runStore.test.ts`
- Create: `web/tests/hooks/useRunEvents.test.tsx`

- [ ] **Step 1: Create `web/src/store/runStore.ts`**

```ts
import { create } from "zustand";
import type { RunStatus } from "@/types/api";

export interface LogLine {
  seq: number;
  line: string;
}

export interface RunStateEntry {
  runId: string;
  policyName: string;
  status: RunStatus;
  logs: LogLine[];
  downloaded: number;
  total: number;
  lastEventId: string;
  errorId: string | null;
}

interface Store {
  runs: Record<string, RunStateEntry>;
  init(runId: string, policyName: string): void;
  appendLog(runId: string, line: string, seq: string): void;
  setProgress(runId: string, downloaded: number, total: number): void;
  setStatus(runId: string, status: RunStatus, errorId?: string | null): void;
  clear(runId: string): void;
}

const MAX_LINES = 2000;

export const useRunStore = create<Store>((set) => ({
  runs: {},
  init: (runId, policyName) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [runId]: state.runs[runId] ?? {
          runId,
          policyName,
          status: "running",
          logs: [],
          downloaded: 0,
          total: 0,
          lastEventId: "",
          errorId: null,
        },
      },
    })),
  appendLog: (runId, line, seq) =>
    set((state) => {
      const entry = state.runs[runId];
      if (!entry) return state;
      const seqNum = Number(seq) || entry.logs.length;
      const logs = [...entry.logs, { seq: seqNum, line }].slice(-MAX_LINES);
      return {
        runs: { ...state.runs, [runId]: { ...entry, logs, lastEventId: seq } },
      };
    }),
  setProgress: (runId, downloaded, total) =>
    set((state) => {
      const entry = state.runs[runId];
      if (!entry) return state;
      return { runs: { ...state.runs, [runId]: { ...entry, downloaded, total } } };
    }),
  setStatus: (runId, status, errorId = null) =>
    set((state) => {
      const entry = state.runs[runId];
      if (!entry) return state;
      return {
        runs: {
          ...state.runs,
          [runId]: { ...entry, status, errorId: errorId ?? entry.errorId },
        },
      };
    }),
  clear: (runId) =>
    set((state) => {
      const { [runId]: _removed, ...rest } = state.runs;
      return { runs: rest };
    }),
}));
```

- [ ] **Step 2: Create `web/src/hooks/useRuns.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { runsApi } from "@/api/runs";

export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyName: string) => runsApi.start(policyName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useStopRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => runsApi.stop(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies"] }),
  });
}

export function useRunHistory(policyName: string | null) {
  return useQuery({
    queryKey: ["runs", "history", policyName],
    queryFn: () => runsApi.history(policyName!),
    enabled: policyName !== null,
  });
}
```

- [ ] **Step 3: Create `web/src/hooks/useRunEvents.ts`**

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeEvents } from "@/api/sse";
import { useRunStore } from "@/store/runStore";
import type { RunStatus } from "@/types/api";

interface StatusPayload {
  status: RunStatus;
  error_id?: string | null;
}

interface ProgressPayload {
  downloaded: number;
  total: number;
}

interface LogPayload {
  line: string;
}

export function useRunEvents(runId: string | null, policyName: string | null) {
  const qc = useQueryClient();
  const init = useRunStore((s) => s.init);
  const appendLog = useRunStore((s) => s.appendLog);
  const setProgress = useRunStore((s) => s.setProgress);
  const setStatus = useRunStore((s) => s.setStatus);

  useEffect(() => {
    if (!runId || !policyName) return;
    init(runId, policyName);
    const sub = subscribeEvents(`/runs/${runId}/events`, {
      log: (data, id) => {
        const payload = data as LogPayload;
        appendLog(runId, payload.line, id);
      },
      progress: (data) => {
        const payload = data as ProgressPayload;
        setProgress(runId, payload.downloaded, payload.total);
      },
      status: (data) => {
        const payload = data as StatusPayload;
        setStatus(runId, payload.status, payload.error_id ?? null);
        if (payload.status !== "running" && payload.status !== "awaiting_mfa") {
          qc.invalidateQueries({ queryKey: ["policies"] });
          qc.invalidateQueries({ queryKey: ["runs", "history", policyName] });
        }
      },
    });
    return () => sub.close();
  }, [runId, policyName, init, appendLog, setProgress, setStatus, qc]);

  return useRunStore((s) => (runId ? s.runs[runId] ?? null : null));
}
```

- [ ] **Step 4: Create `web/src/hooks/useSettings.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/api/settings";
import type { AppSettings } from "@/types/api";

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: AppSettings) => settingsApi.put(settings),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}
```

- [ ] **Step 5: Write failing test — runStore appendLog caps lines**

Create `web/tests/store/runStore.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useRunStore } from "@/store/runStore";

describe("runStore", () => {
  beforeEach(() => {
    useRunStore.setState({ runs: {} });
  });

  it("initializes a run", () => {
    useRunStore.getState().init("r1", "p1");
    const run = useRunStore.getState().runs["r1"];
    expect(run.policyName).toBe("p1");
    expect(run.status).toBe("running");
  });

  it("appends logs and caps at 2000", () => {
    useRunStore.getState().init("r1", "p1");
    for (let i = 0; i < 2500; i += 1) {
      useRunStore.getState().appendLog("r1", `line ${i}`, String(i));
    }
    const logs = useRunStore.getState().runs["r1"].logs;
    expect(logs.length).toBe(2000);
    expect(logs[0].line).toBe("line 500");
    expect(logs[logs.length - 1].line).toBe("line 2499");
  });

  it("updates status and progress", () => {
    useRunStore.getState().init("r1", "p1");
    useRunStore.getState().setProgress("r1", 3, 10);
    useRunStore.getState().setStatus("r1", "success");
    const run = useRunStore.getState().runs["r1"];
    expect(run.downloaded).toBe(3);
    expect(run.total).toBe(10);
    expect(run.status).toBe("success");
  });
});
```

- [ ] **Step 6: Write failing test — useRunEvents wires SSE to store**

Create `web/tests/hooks/useRunEvents.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRunEvents } from "@/hooks/useRunEvents";
import { useRunStore } from "@/store/runStore";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  close() {}
  emit(type: string, data: unknown, id = "") {
    const e = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id });
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
}

beforeAll(() => {
  (globalThis as any).EventSource = FakeEventSource;
});
afterAll(() => {
  delete (globalThis as any).EventSource;
});
beforeEach(() => {
  useRunStore.setState({ runs: {} });
});

function wrapper() {
  const client = new QueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useRunEvents", () => {
  it("appends log, updates progress, flips status", () => {
    renderHook(() => useRunEvents("r1", "p1"), { wrapper: wrapper() });
    const es = FakeEventSource.last!;
    act(() => {
      es.emit("log", { line: "hello" }, "1");
      es.emit("progress", { downloaded: 2, total: 5 });
      es.emit("status", { status: "success" });
    });
    const run = useRunStore.getState().runs["r1"];
    expect(run.logs).toEqual([{ seq: 1, line: "hello" }]);
    expect(run.downloaded).toBe(2);
    expect(run.total).toBe(5);
    expect(run.status).toBe("success");
  });
});
```

- [ ] **Step 7: Run tests**

```bash
cd web && npx vitest run tests/store/runStore.test.ts tests/hooks/useRunEvents.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/store/ web/src/hooks/useRuns.ts web/src/hooks/useRunEvents.ts web/src/hooks/useSettings.ts web/tests/store/ web/tests/hooks/useRunEvents.test.tsx
git commit -m "feat(web): run hooks, run store, settings hook"
```

---

## Phase 5 — UI components

### Task 11: Toast system and ConfirmDialog

**Files:**
- Create: `web/src/components/Toast.tsx`
- Create: `web/src/store/toastStore.ts`
- Create: `web/src/components/ConfirmDialog.tsx`
- Create: `web/tests/components/Toast.test.tsx`

- [ ] **Step 1: Create `web/src/store/toastStore.ts`**

```ts
import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  tone: "error" | "info" | "success";
  errorId?: string | null;
}

interface Store {
  toasts: Toast[];
  push(t: Omit<Toast, "id">): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToastStore = create<Store>((set) => ({
  toasts: [],
  push: (t) =>
    set((state) => ({ toasts: [...state.toasts, { ...t, id: nextId++ }] })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((x) => x.id !== id) })),
}));

export function pushError(message: string, errorId?: string | null): void {
  useToastStore.getState().push({ message, tone: "error", errorId });
}

export function pushSuccess(message: string): void {
  useToastStore.getState().push({ message, tone: "success" });
}
```

- [ ] **Step 2: Create `web/src/components/Toast.tsx`**

```tsx
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useToastStore } from "@/store/toastStore";

const tones = {
  error: "bg-red-50 border-red-200 text-red-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
  success: "bg-green-50 border-green-200 text-green-800",
};

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => dismiss(t.id), t.tone === "error" ? 8000 : 4000)
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [toasts, dismiss]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn("border rounded-md px-4 py-2 shadow-md min-w-[16rem]", tones[t.tone])}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm">{t.message}</div>
              {t.errorId && (
                <div className="text-xs opacity-70 mt-1">Error ID: {t.errorId}</div>
              )}
            </div>
            <button
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-sm opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `web/src/components/ConfirmDialog.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} widthClass="max-w-md">
      <p className="text-sm text-slate-700">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={confirmVariant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Write failing test — Toast renders and dismisses**

Create `web/tests/components/Toast.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastStack } from "@/components/Toast";
import { pushError, useToastStore } from "@/store/toastStore";

describe("ToastStack", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("renders error toast with error id", async () => {
    render(<ToastStack />);
    pushError("Boom", "srv-1");
    expect(await screen.findByText("Boom")).toBeInTheDocument();
    expect(screen.getByText(/Error ID: srv-1/)).toBeInTheDocument();
  });

  it("dismisses on click", async () => {
    render(<ToastStack />);
    pushError("Boom");
    const btn = await screen.findByRole("button", { name: "Dismiss" });
    await userEvent.click(btn);
    expect(screen.queryByText("Boom")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd web && npx vitest run tests/components/Toast.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Toast.tsx web/src/store/toastStore.ts web/src/components/ConfirmDialog.tsx web/tests/components/Toast.test.tsx
git commit -m "feat(web): toast notifications and confirm dialog"
```

---

### Task 12: LoginScreen and AuthGate

**Files:**
- Create: `web/src/components/LoginScreen.tsx`
- Create: `web/src/components/AuthGate.tsx`
- Create: `web/tests/components/LoginScreen.test.tsx`

- [ ] **Step 1: Create `web/src/components/LoginScreen.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/hooks/useAuth";
import { ApiError } from "@/api/client";

export function LoginScreen() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync(password);
      setPassword("");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Login failed");
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-lg shadow-md p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">icloudpd-web</h1>
        <label className="block">
          <span className="text-sm text-slate-700">Password</span>
          <Input
            type="password"
            autoFocus
            value={password}
            invalid={error !== null}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="text-sm text-danger">{error}</div>}
        <Button type="submit" disabled={login.isPending || password.length === 0}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `web/src/components/AuthGate.tsx`**

```tsx
import type { ReactNode } from "react";
import { useAuthStatus } from "@/hooks/useAuth";
import { LoginScreen } from "./LoginScreen";

export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useAuthStatus();

  if (isLoading) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }
  if (isError || !data) {
    return <div className="p-8 text-danger">Cannot reach server.</div>;
  }
  if (!data.authenticated) {
    return <LoginScreen />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Write failing test — LoginScreen shows error and passwordless skip**

Create `web/tests/components/LoginScreen.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/AuthGate";

let auth = { authenticated: false, auth_required: true };
const server = setupServer(
  http.get("/auth/status", () => HttpResponse.json(auth)),
  http.post("/auth/login", async ({ request }) => {
    const body = (await request.json()) as { password: string };
    if (body.password === "good") {
      auth = { authenticated: true, auth_required: true };
      return HttpResponse.json({ ok: true });
    }
    return HttpResponse.json(
      { error: "Invalid password", error_id: null, field: "password" },
      { status: 401 }
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  auth = { authenticated: false, auth_required: true };
});
afterAll(() => server.close());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("AuthGate + LoginScreen", () => {
  it("shows login when unauthenticated, signs in and renders children", async () => {
    render(
      <Wrap>
        <AuthGate>
          <div>app content</div>
        </AuthGate>
      </Wrap>
    );
    await screen.findByText("Sign in");
    await userEvent.type(screen.getByLabelText("Password"), "good");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText("app content")).toBeInTheDocument());
  });

  it("skips login in passwordless mode", async () => {
    auth = { authenticated: true, auth_required: false };
    render(
      <Wrap>
        <AuthGate>
          <div>app content</div>
        </AuthGate>
      </Wrap>
    );
    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
  });

  it("displays server error on bad password", async () => {
    render(
      <Wrap>
        <AuthGate>
          <div>app content</div>
        </AuthGate>
      </Wrap>
    );
    await screen.findByText("Sign in");
    await userEvent.type(screen.getByLabelText("Password"), "bad");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText("Invalid password")).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run tests/components/LoginScreen.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/LoginScreen.tsx web/src/components/AuthGate.tsx web/tests/components/LoginScreen.test.tsx
git commit -m "feat(web): login screen and auth gate"
```

---

### Task 13: PolicyList and PolicyRow

**Files:**
- Create: `web/src/components/PolicyList.tsx`
- Create: `web/src/components/PolicyRow.tsx`
- Create: `web/tests/components/PolicyList.test.tsx`

- [ ] **Step 1: Create `web/src/components/PolicyRow.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PolicyView } from "@/types/api";

interface Props {
  policy: PolicyView;
  onRun: () => void;
  onStop: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onOpenActiveRun: () => void;
}

function statusOf(p: PolicyView): { label: string; tone: "success" | "danger" | "info" | "neutral" | "warning" } {
  if (p.is_running) return { label: "Running", tone: "info" };
  if (p.last_run?.status === "failed") return { label: "Failed", tone: "danger" };
  if (p.last_run?.status === "success") return { label: "OK", tone: "success" };
  if (!p.enabled) return { label: "Disabled", tone: "neutral" };
  return { label: "Idle", tone: "neutral" };
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function PolicyRow({
  policy,
  onRun,
  onStop,
  onEdit,
  onDelete,
  onHistory,
  onOpenActiveRun,
}: Props) {
  const status = statusOf(policy);
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{policy.name}</div>
        <div className="text-xs text-slate-500">{policy.username}</div>
      </td>
      <td className="px-3 py-2">
        <Badge tone={status.tone}>{status.label}</Badge>
      </td>
      <td className="px-3 py-2 text-sm text-slate-600">{formatTime(policy.next_run_at)}</td>
      <td className="px-3 py-2 text-sm text-slate-600">
        {policy.last_run ? formatTime(policy.last_run.ended_at ?? policy.last_run.started_at) : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-2">
          {policy.is_running ? (
            <>
              <Button variant="secondary" onClick={onOpenActiveRun}>
                View
              </Button>
              <Button variant="danger" onClick={onStop}>
                Stop
              </Button>
            </>
          ) : (
            <Button onClick={onRun} disabled={!policy.has_password}>
              Run
            </Button>
          )}
          <Button variant="secondary" onClick={onHistory}>
            History
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Create `web/src/components/PolicyList.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import type { PolicyView } from "@/types/api";
import { PolicyRow } from "./PolicyRow";

interface Props {
  policies: PolicyView[];
  onCreate: () => void;
  onRun: (p: PolicyView) => void;
  onStop: (p: PolicyView) => void;
  onEdit: (p: PolicyView) => void;
  onDelete: (p: PolicyView) => void;
  onHistory: (p: PolicyView) => void;
  onOpenActiveRun: (p: PolicyView) => void;
}

export function PolicyList({
  policies,
  onCreate,
  onRun,
  onStop,
  onEdit,
  onDelete,
  onHistory,
  onOpenActiveRun,
}: Props) {
  return (
    <section className="bg-white rounded-lg shadow-sm">
      <header className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Policies</h2>
        <Button onClick={onCreate}>New policy</Button>
      </header>
      {policies.length === 0 ? (
        <div className="p-6 text-center text-slate-500">
          No policies yet. Click <strong>New policy</strong> to get started.
        </div>
      ) : (
        <table className="w-full">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Next run</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <PolicyRow
                key={p.name}
                policy={p}
                onRun={() => onRun(p)}
                onStop={() => onStop(p)}
                onEdit={() => onEdit(p)}
                onDelete={() => onDelete(p)}
                onHistory={() => onHistory(p)}
                onOpenActiveRun={() => onOpenActiveRun(p)}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write failing test**

Create `web/tests/components/PolicyList.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PolicyList } from "@/components/PolicyList";
import type { PolicyView } from "@/types/api";

const base: PolicyView = {
  name: "p",
  username: "u@icloud.com",
  directory: "/tmp/p",
  cron: "0 * * * *",
  enabled: true,
  icloudpd: {},
  notifications: { on_start: false, on_success: true, on_failure: true },
  aws: null,
  is_running: false,
  has_password: true,
  next_run_at: null,
  last_run: null,
};

function noop() {}

describe("PolicyList", () => {
  it("shows empty state", () => {
    render(
      <PolicyList
        policies={[]}
        onCreate={noop}
        onRun={noop}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByText(/No policies yet/i)).toBeInTheDocument();
  });

  it("renders row and fires Run handler", async () => {
    const onRun = vi.fn();
    render(
      <PolicyList
        policies={[base]}
        onCreate={noop}
        onRun={onRun}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByText("p")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenCalledWith(base);
  });

  it("shows Stop/View when running", () => {
    render(
      <PolicyList
        policies={[{ ...base, is_running: true }]}
        onCreate={noop}
        onRun={noop}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
  });

  it("disables Run when no password set", () => {
    render(
      <PolicyList
        policies={[{ ...base, has_password: false }]}
        onCreate={noop}
        onRun={noop}
        onStop={noop}
        onEdit={noop}
        onDelete={noop}
        onHistory={noop}
        onOpenActiveRun={noop}
      />
    );
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run tests/components/PolicyList.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PolicyList.tsx web/src/components/PolicyRow.tsx web/tests/components/PolicyList.test.tsx
git commit -m "feat(web): policy list and row components"
```

---

### Task 14: EditPolicyModal

**Files:**
- Create: `web/src/components/EditPolicyModal.tsx`
- Create: `web/tests/components/EditPolicyModal.test.tsx`

- [ ] **Step 1: Create `web/src/components/EditPolicyModal.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { useSetPolicyPassword, useUpsertPolicy } from "@/hooks/usePolicies";
import { pushError, pushSuccess } from "@/store/toastStore";
import type { Policy, PolicyView } from "@/types/api";

interface Props {
  open: boolean;
  onClose: () => void;
  initial: PolicyView | null;
}

const BLANK: Policy = {
  name: "",
  username: "",
  directory: "",
  cron: "0 * * * *",
  enabled: true,
  timezone: null,
  icloudpd: {},
  notifications: { on_start: false, on_success: true, on_failure: true },
  aws: null,
};

export function EditPolicyModal({ open, onClose, initial }: Props) {
  const upsert = useUpsertPolicy();
  const setPassword = useSetPolicyPassword();

  const [form, setForm] = useState<Policy>(BLANK);
  const [password, setPassword_] = useState("");
  const [fieldError, setFieldError] = useState<{ field: string | null; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initial ? stripView(initial) : BLANK);
      setPassword_("");
      setFieldError(null);
    }
  }, [open, initial]);

  const isNew = initial === null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    try {
      await upsert.mutateAsync({ name: form.name, policy: form });
      if (password) {
        await setPassword.mutateAsync({ name: form.name, password });
        pushSuccess(isNew ? "Policy created" : "Policy saved");
      } else {
        pushSuccess(isNew ? "Policy created" : "Policy saved");
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldError({ field: err.field, message: err.message });
        pushError(err.message, err.errorId);
      } else {
        pushError("Unknown error");
      }
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isNew ? "New Policy" : `Edit: ${initial?.name}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" error={fieldError?.field === "name" ? fieldError.message : null}>
          <Input
            value={form.name}
            disabled={!isNew}
            invalid={fieldError?.field === "name"}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="iCloud username" error={fieldError?.field === "username" ? fieldError.message : null}>
          <Input
            type="email"
            value={form.username}
            invalid={fieldError?.field === "username"}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </Field>
        <Field label="Directory" error={fieldError?.field === "directory" ? fieldError.message : null}>
          <Input
            value={form.directory}
            invalid={fieldError?.field === "directory"}
            onChange={(e) => setForm({ ...form, directory: e.target.value })}
            required
          />
        </Field>
        <Field label="Cron" error={fieldError?.field === "cron" ? fieldError.message : null}>
          <Input
            value={form.cron}
            invalid={fieldError?.field === "cron"}
            onChange={(e) => setForm({ ...form, cron: e.target.value })}
            required
          />
        </Field>
        <Field label="Timezone (IANA, optional)">
          <Input
            value={form.timezone ?? ""}
            onChange={(e) =>
              setForm({ ...form, timezone: e.target.value === "" ? null : e.target.value })
            }
            placeholder="America/New_York"
          />
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Enabled
        </label>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-sm font-medium">Notifications</legend>
          {(["on_start", "on_success", "on_failure"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notifications[k]}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notifications: { ...form.notifications, [k]: e.target.checked },
                  })
                }
              />
              {k}
            </label>
          ))}
        </fieldset>

        <Field label={`iCloud password${initial?.has_password ? " (already set; fill to replace)" : ""}`}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword_(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-sm font-medium">icloudpd CLI options (JSON)</legend>
          <IcloudpdOptions
            value={form.icloudpd}
            onChange={(next) => setForm({ ...form, icloudpd: next })}
          />
        </fieldset>

        <fieldset className="border rounded p-3 space-y-2">
          <legend className="text-sm font-medium">AWS S3 sync (optional)</legend>
          <AwsFields
            value={form.aws}
            onChange={(next) => setForm({ ...form, aws: next })}
          />
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={upsert.isPending || setPassword.isPending}>
            {upsert.isPending || setPassword.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-slate-700">{label}</span>
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

function IcloudpdOptions({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);

  const blur = () => {
    try {
      onChange(JSON.parse(text));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div>
      <textarea
        className="w-full font-mono text-xs border rounded p-2 h-32"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={blur}
      />
      {err && <div className="text-xs text-danger">{err}</div>}
    </div>
  );
}

function AwsFields({
  value,
  onChange,
}: {
  value: Policy["aws"];
  onChange: (next: Policy["aws"]) => void;
}) {
  const on = value !== null;
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { bucket: "", prefix: "", region: "", access_key_id: "", secret_access_key: "" }
                : null
            )
          }
        />
        Enable S3 sync
      </label>
      {on && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="bucket"
            value={value.bucket}
            onChange={(e) => onChange({ ...value, bucket: e.target.value })}
          />
          <Input
            placeholder="prefix"
            value={value.prefix ?? ""}
            onChange={(e) => onChange({ ...value, prefix: e.target.value })}
          />
          <Input
            placeholder="region"
            value={value.region ?? ""}
            onChange={(e) => onChange({ ...value, region: e.target.value })}
          />
          <Input
            placeholder="access key id"
            value={value.access_key_id ?? ""}
            onChange={(e) => onChange({ ...value, access_key_id: e.target.value })}
          />
          <Input
            placeholder="secret access key"
            type="password"
            value={value.secret_access_key ?? ""}
            onChange={(e) => onChange({ ...value, secret_access_key: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function stripView(view: PolicyView): Policy {
  const { is_running: _r, next_run_at: _n, last_run: _l, has_password: _h, ...rest } = view;
  return rest;
}
```

- [ ] **Step 2: Write failing test — submit calls upsert and setPassword**

Create `web/tests/components/EditPolicyModal.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { EditPolicyModal } from "@/components/EditPolicyModal";

let lastUpsert: any = null;
let lastPassword: string | null = null;

const server = setupServer(
  http.put("/policies/:name", async ({ request }) => {
    lastUpsert = await request.json();
    return HttpResponse.json({
      ...(lastUpsert as any),
      is_running: false,
      has_password: false,
    });
  }),
  http.put("/policies/:name/password", async ({ request }) => {
    const body = (await request.json()) as { password: string };
    lastPassword = body.password;
    return new HttpResponse(null, { status: 204 });
  })
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  lastUpsert = null;
  lastPassword = null;
});
afterAll(() => server.close());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("EditPolicyModal", () => {
  it("creates a new policy and sets password", async () => {
    const onClose = () => {};
    render(
      <Wrap>
        <EditPolicyModal open onClose={onClose} initial={null} />
      </Wrap>
    );
    await userEvent.type(screen.getByLabelText("Name"), "fam");
    await userEvent.type(screen.getByLabelText("iCloud username"), "me@icloud.com");
    await userEvent.type(screen.getByLabelText("Directory"), "/data/fam");
    await userEvent.type(
      screen.getByLabelText(/iCloud password/i),
      "secret"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(lastUpsert?.name).toBe("fam");
      expect(lastUpsert?.username).toBe("me@icloud.com");
      expect(lastPassword).toBe("secret");
    });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd web && npx vitest run tests/components/EditPolicyModal.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/EditPolicyModal.tsx web/tests/components/EditPolicyModal.test.tsx
git commit -m "feat(web): edit policy modal with password + AWS fields"
```

---

### Task 15: RunDetailModal and MfaModal

**Files:**
- Create: `web/src/components/RunDetailModal.tsx`
- Create: `web/src/components/MfaModal.tsx`
- Create: `web/tests/components/RunDetailModal.test.tsx`

- [ ] **Step 1: Create `web/src/components/MfaModal.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { mfaApi } from "@/api/mfa";
import { pushError, pushSuccess } from "@/store/toastStore";

interface Props {
  open: boolean;
  policyName: string;
  onClose: () => void;
}

export function MfaModal({ open, policyName, onClose }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await mfaApi.submit(policyName, code.trim());
      pushSuccess("MFA code submitted");
      setCode("");
      onClose();
    } catch (e2) {
      if (e2 instanceof ApiError) {
        setErr(e2.message);
        pushError(e2.message, e2.errorId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Two-factor code" widthClass="max-w-sm">
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-slate-700">
          Enter the 6-digit code from your Apple device for <strong>{policyName}</strong>.
        </p>
        <Input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]{6}"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          invalid={err !== null}
          placeholder="123456"
        />
        {err && <div className="text-xs text-danger">{err}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Create `web/src/components/RunDetailModal.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useRunEvents } from "@/hooks/useRunEvents";
import { useStopRun } from "@/hooks/useRuns";
import { MfaModal } from "./MfaModal";
import type { RunStatus } from "@/types/api";

const STATUS_TONE: Record<RunStatus, "info" | "success" | "danger" | "neutral" | "warning"> = {
  running: "info",
  awaiting_mfa: "warning",
  success: "success",
  failed: "danger",
  stopped: "neutral",
};

interface Props {
  open: boolean;
  onClose: () => void;
  runId: string | null;
  policyName: string | null;
}

export function RunDetailModal({ open, onClose, runId, policyName }: Props) {
  const run = useRunEvents(open ? runId : null, open ? policyName : null);
  const stop = useStopRun();
  const logRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [mfaOpen, setMfaOpen] = useState(false);

  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [run?.logs.length, autoScroll]);

  useEffect(() => {
    if (run?.status === "awaiting_mfa") setMfaOpen(true);
  }, [run?.status]);

  if (!runId || !policyName) return null;

  const progressPercent =
    run && run.total > 0 ? Math.min(100, Math.round((run.downloaded / run.total) * 100)) : null;

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Run: ${policyName}`} widthClass="max-w-3xl">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone={run ? STATUS_TONE[run.status] : "neutral"}>
              {run?.status ?? "connecting…"}
            </Badge>
            {run?.errorId && (
              <span className="text-xs text-slate-500">Error ID: {run.errorId}</span>
            )}
          </div>

          {progressPercent !== null && (
            <div>
              <div className="h-2 bg-slate-200 rounded overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {run?.downloaded} / {run?.total} ({progressPercent}%)
              </div>
            </div>
          )}

          <div
            ref={logRef}
            className="font-mono text-xs bg-slate-900 text-slate-100 rounded p-3 h-80 overflow-auto whitespace-pre-wrap"
            onScroll={(e) => {
              const el = e.currentTarget;
              const near = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
              setAutoScroll(near);
            }}
          >
            {run?.logs.map((l) => (
              <div key={l.seq}>{l.line}</div>
            )) ?? null}
          </div>

          <div className="flex justify-between items-center">
            <label className="text-xs text-slate-600 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              auto-scroll
            </label>
            <div className="flex gap-2">
              {run?.status === "running" && (
                <Button variant="danger" onClick={() => stop.mutate(runId)}>
                  Stop run
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <MfaModal
        open={mfaOpen}
        policyName={policyName}
        onClose={() => setMfaOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 3: Write failing test — RunDetailModal shows log and progress**

Create `web/tests/components/RunDetailModal.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { RunDetailModal } from "@/components/RunDetailModal";
import { useRunStore } from "@/store/runStore";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  close() {}
  emit(type: string, data: unknown, id = "1") {
    const e = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id });
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
}

const server = setupServer();

beforeAll(() => {
  server.listen();
  (globalThis as any).EventSource = FakeEventSource;
});
afterAll(() => {
  server.close();
  delete (globalThis as any).EventSource;
});
beforeEach(() => useRunStore.setState({ runs: {} }));
afterEach(() => server.resetHandlers());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("RunDetailModal", () => {
  it("renders log lines and progress", () => {
    render(
      <Wrap>
        <RunDetailModal open runId="r1" policyName="p1" onClose={() => {}} />
      </Wrap>
    );
    act(() => {
      FakeEventSource.last!.emit("log", { line: "downloading..." });
      FakeEventSource.last!.emit("progress", { downloaded: 1, total: 4 });
    });
    expect(screen.getByText("downloading...")).toBeInTheDocument();
    expect(screen.getByText("1 / 4 (25%)")).toBeInTheDocument();
  });

  it("shows MFA modal when status flips to awaiting_mfa", () => {
    render(
      <Wrap>
        <RunDetailModal open runId="r1" policyName="p1" onClose={() => {}} />
      </Wrap>
    );
    act(() => {
      FakeEventSource.last!.emit("status", { status: "awaiting_mfa" });
    });
    expect(screen.getByText(/Two-factor code/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run tests/components/RunDetailModal.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RunDetailModal.tsx web/src/components/MfaModal.tsx web/tests/components/RunDetailModal.test.tsx
git commit -m "feat(web): run detail modal and MFA modal"
```

---

### Task 16: RunHistoryModal, LogViewerModal, SettingsModal

**Files:**
- Create: `web/src/components/RunHistoryModal.tsx`
- Create: `web/src/components/LogViewerModal.tsx`
- Create: `web/src/components/SettingsModal.tsx`
- Create: `web/tests/components/SettingsModal.test.tsx`

- [ ] **Step 1: Create `web/src/components/RunHistoryModal.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useRunHistory } from "@/hooks/useRuns";
import type { RunStatus, RunSummary } from "@/types/api";

const TONE: Record<RunStatus, "info" | "success" | "danger" | "neutral" | "warning"> = {
  running: "info",
  awaiting_mfa: "warning",
  success: "success",
  failed: "danger",
  stopped: "neutral",
};

interface Props {
  open: boolean;
  onClose: () => void;
  policyName: string | null;
  onViewLog: (run: RunSummary) => void;
}

export function RunHistoryModal({ open, onClose, policyName, onViewLog }: Props) {
  const { data, isLoading } = useRunHistory(open ? policyName : null);
  return (
    <Modal open={open} onClose={onClose} title={`History: ${policyName ?? ""}`} widthClass="max-w-2xl">
      {isLoading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : !data || data.length === 0 ? (
        <div className="text-sm text-slate-500">No runs yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 text-left">
            <tr>
              <th className="py-2">Started</th>
              <th>Status</th>
              <th>Items</th>
              <th>Error ID</th>
              <th className="text-right">Log</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.run_id} className="border-t">
                <td className="py-1.5">{new Date(r.started_at).toLocaleString()}</td>
                <td>
                  <Badge tone={TONE[r.status]}>{r.status}</Badge>
                </td>
                <td>{r.downloaded ?? 0}</td>
                <td className="font-mono text-xs">{r.error_id ?? ""}</td>
                <td className="text-right">
                  <Button variant="ghost" onClick={() => onViewLog(r)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Create `web/src/components/LogViewerModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { runsApi } from "@/api/runs";

interface Props {
  open: boolean;
  onClose: () => void;
  runId: string | null;
}

export function LogViewerModal({ open, onClose, runId }: Props) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !runId) return;
    setText("");
    setErr(null);
    fetch(runsApi.logUrl(runId), { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new ApiError("Log not found", r.status, null, null);
        return r.text();
      })
      .then(setText)
      .catch((e) => setErr(e instanceof Error ? e.message : "Error"));
  }, [open, runId]);

  return (
    <Modal open={open} onClose={onClose} title={`Log: ${runId ?? ""}`} widthClass="max-w-3xl">
      {err ? (
        <div className="text-danger text-sm">{err}</div>
      ) : (
        <pre className="font-mono text-xs bg-slate-900 text-slate-100 rounded p-3 h-[60vh] overflow-auto whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Create `web/src/components/SettingsModal.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/api/client";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { pushError, pushSuccess } from "@/store/toastStore";
import type { AppSettings } from "@/types/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

const BLANK: AppSettings = {
  apprise: { urls: [], on_start: false, on_success: true, on_failure: true },
  retention_runs: 10,
};

export function SettingsModal({ open, onClose }: Props) {
  const query = useSettings();
  const update = useUpdateSettings();
  const [form, setForm] = useState<AppSettings>(BLANK);

  useEffect(() => {
    if (open && query.data) setForm(query.data);
  }, [open, query.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync(form);
      pushSuccess("Settings saved");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Settings" widthClass="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Apprise URLs</legend>
          {form.apprise.urls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => {
                  const urls = [...form.apprise.urls];
                  urls[i] = e.target.value;
                  setForm({ ...form, apprise: { ...form.apprise, urls } });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setForm({
                    ...form,
                    apprise: {
                      ...form.apprise,
                      urls: form.apprise.urls.filter((_, j) => j !== i),
                    },
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setForm({
                ...form,
                apprise: { ...form.apprise, urls: [...form.apprise.urls, ""] },
              })
            }
          >
            Add URL
          </Button>
          <div className="space-y-1 pt-2">
            {(["on_start", "on_success", "on_failure"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.apprise[k]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      apprise: { ...form.apprise, [k]: e.target.checked },
                    })
                  }
                />
                Notify {k.replace("on_", "")}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm text-slate-700">Run log retention (count per policy)</span>
          <Input
            type="number"
            min="1"
            max="1000"
            value={form.retention_runs}
            onChange={(e) =>
              setForm({ ...form, retention_runs: Number(e.target.value) || 1 })
            }
          />
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Write failing test — SettingsModal adds/removes URL, saves**

Create `web/tests/components/SettingsModal.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { SettingsModal } from "@/components/SettingsModal";

let current = {
  apprise: { urls: ["pover://token"], on_start: false, on_success: true, on_failure: true },
  retention_runs: 10,
};

const server = setupServer(
  http.get("/settings", () => HttpResponse.json(current)),
  http.put("/settings", async ({ request }) => {
    current = (await request.json()) as typeof current;
    return HttpResponse.json(current);
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function Wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("SettingsModal", () => {
  it("edits retention and saves", async () => {
    render(
      <Wrap>
        <SettingsModal open onClose={() => {}} />
      </Wrap>
    );
    const input = await screen.findByLabelText(/retention/i);
    await userEvent.clear(input);
    await userEvent.type(input, "25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(current.retention_runs).toBe(25));
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd web && npx vitest run tests/components/SettingsModal.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/RunHistoryModal.tsx web/src/components/LogViewerModal.tsx web/src/components/SettingsModal.tsx web/tests/components/SettingsModal.test.tsx
git commit -m "feat(web): run history, log viewer, settings modals"
```

---

## Phase 6 — Wire-up and delivery

### Task 17: App shell and modal orchestration

**Files:**
- Modify: `web/src/app.tsx`

- [ ] **Step 1: Replace `web/src/app.tsx`**

```tsx
import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditPolicyModal } from "@/components/EditPolicyModal";
import { LogViewerModal } from "@/components/LogViewerModal";
import { PolicyList } from "@/components/PolicyList";
import { RunDetailModal } from "@/components/RunDetailModal";
import { RunHistoryModal } from "@/components/RunHistoryModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ToastStack } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/api/client";
import { useLogout } from "@/hooks/useAuth";
import { useDeletePolicy, usePolicies, usePoliciesLiveUpdate } from "@/hooks/usePolicies";
import { useStartRun, useStopRun } from "@/hooks/useRuns";
import { pushError, pushSuccess } from "@/store/toastStore";
import type { PolicyView, RunSummary } from "@/types/api";

export function App() {
  return (
    <AuthGate>
      <Home />
      <ToastStack />
    </AuthGate>
  );
}

function Home() {
  usePoliciesLiveUpdate(true);
  const { data: policies, isLoading } = usePolicies();
  const logout = useLogout();
  const startRun = useStartRun();
  const stopRun = useStopRun();
  const deletePolicy = useDeletePolicy();

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PolicyView | null>(null);

  const [runModal, setRunModal] = useState<{ runId: string; policyName: string } | null>(null);

  const [historyPolicy, setHistoryPolicy] = useState<PolicyView | null>(null);
  const [logRunId, setLogRunId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<PolicyView | null>(null);
  const [confirmStop, setConfirmStop] = useState<{ runId: string; policyName: string } | null>(null);

  const runPolicy = async (p: PolicyView) => {
    try {
      const result = await startRun.mutateAsync(p.name);
      setRunModal({ runId: result.run_id, policyName: p.name });
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    }
  };

  const openActiveRun = (p: PolicyView) => {
    if (p.last_run?.run_id) {
      setRunModal({ runId: p.last_run.run_id, policyName: p.name });
    }
  };

  const requestStop = (p: PolicyView) => {
    if (p.last_run?.run_id) {
      setConfirmStop({ runId: p.last_run.run_id, policyName: p.name });
    }
  };

  const doStop = async () => {
    if (!confirmStop) return;
    try {
      await stopRun.mutateAsync(confirmStop.runId);
      pushSuccess("Run stopped");
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    } finally {
      setConfirmStop(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deletePolicy.mutateAsync(confirmDelete.name);
      pushSuccess("Policy deleted");
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    } finally {
      setConfirmDelete(null);
    }
  };

  const openHistoryLog = (run: RunSummary) => setLogRunId(run.run_id);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold">icloudpd-web</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4">
        {isLoading ? (
          <div className="text-slate-500">Loading…</div>
        ) : (
          <PolicyList
            policies={policies ?? []}
            onCreate={() => {
              setEditTarget(null);
              setEditOpen(true);
            }}
            onRun={runPolicy}
            onStop={requestStop}
            onEdit={(p) => {
              setEditTarget(p);
              setEditOpen(true);
            }}
            onDelete={(p) => setConfirmDelete(p)}
            onHistory={(p) => setHistoryPolicy(p)}
            onOpenActiveRun={openActiveRun}
          />
        )}
      </main>

      <EditPolicyModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={editTarget}
      />
      <RunDetailModal
        open={runModal !== null}
        onClose={() => setRunModal(null)}
        runId={runModal?.runId ?? null}
        policyName={runModal?.policyName ?? null}
      />
      <RunHistoryModal
        open={historyPolicy !== null}
        onClose={() => setHistoryPolicy(null)}
        policyName={historyPolicy?.name ?? null}
        onViewLog={openHistoryLog}
      />
      <LogViewerModal
        open={logRunId !== null}
        onClose={() => setLogRunId(null)}
        runId={logRunId}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete policy?"
        message={`This will remove policy "${confirmDelete?.name}" and its stored password. Run history is preserved.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={confirmStop !== null}
        title="Stop run?"
        message={`Stop the running job for "${confirmStop?.policyName}"? In-flight downloads may be incomplete.`}
        confirmLabel="Stop"
        confirmVariant="danger"
        onClose={() => setConfirmStop(null)}
        onConfirm={doStop}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run full test suite**

```bash
cd web && npm run build && npx vitest run && npm run lint && cd ..
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add web/src/app.tsx
git commit -m "feat(web): app shell with modal orchestration"
```

---

### Task 18: Build integration, Makefile, README

**Files:**
- Create: `Makefile` (or modify if exists)
- Modify: `README.md`
- Modify: `pyproject.toml` (sdist exclude for node_modules)

- [ ] **Step 1: Inspect existing Makefile**

Run: `ls Makefile 2>/dev/null || echo no-makefile`

If it exists, read it and append the targets below. Otherwise create it.

- [ ] **Step 2: Add/create Makefile**

Append to (or create) `Makefile`:

```make
.PHONY: build-web install-web test-web lint-web dev-web dev-backend build

install-web:
	cd web && npm ci

build-web: install-web
	cd web && npm run build

test-web:
	cd web && npm test

lint-web:
	cd web && npm run lint && npm run format

dev-web:
	cd web && npm run dev

dev-backend:
	uv run icloudpd-web serve --data-dir ./.dev-data --host 127.0.0.1 --port 8000

build: build-web
	uv build
```

- [ ] **Step 3: Update pyproject.toml sdist excludes**

Modify `pyproject.toml`. Add under the build configuration block:

```toml
[tool.hatch.build.targets.sdist]
exclude = [
  "web/node_modules",
  "web/dist",
  ".dev-data",
]

[tool.hatch.build.targets.wheel]
exclude = [
  "web",
  "tests",
  "docs",
]
```

(Only add keys that aren't already present. If the build backend is different, look up the equivalent sdist/wheel exclude syntax.)

- [ ] **Step 4: Update README**

Replace the "frontend not compatible" warning with an updated section. Modify `README.md` to add (near the top of install/dev instructions):

```markdown
## Development

Backend (Python, uv):

```bash
uv sync --dev
make dev-backend    # http://127.0.0.1:8000
```

Frontend (Vite, in another terminal):

```bash
make install-web
make dev-web        # http://127.0.0.1:5173 with proxy to :8000
```

Production build:

```bash
make build          # builds web into src/icloudpd_web/web_dist and uv-builds the wheel
```

Once built, `icloudpd-web serve` hosts both API and UI on a single port.
```

Remove the old "pre-rewrite UI is not compatible" notice.

- [ ] **Step 5: Full build verification**

```bash
make build-web && uv run pytest && cd web && npm test && npm run lint && cd ..
```

Expected: all PASS. The wheel build step can be skipped if `uv build` errors out for unrelated reasons; main check is `build-web` produces `src/icloudpd_web/web_dist/index.html`.

- [ ] **Step 6: Manual smoke test**

1. `make build-web`
2. In one shell: `ICLOUDPD_PASSWORD_HASH_PATH=/dev/null uv run icloudpd-web serve --data-dir ./.dev-data` (should print passwordless warning and start server)
3. Open http://127.0.0.1:8000 — SPA should load, no login screen.
4. Create a policy (any username, fake directory, cron `0 * * * *`), set password.
5. Close without running (no valid Apple creds).
6. Verify policy persists on page reload.
7. Delete policy.
8. Stop server, run `uv run icloudpd-web init-password` with a password, restart.
9. Reload: login screen appears. Sign in.

Report any failures.

- [ ] **Step 7: Commit**

```bash
git add Makefile README.md pyproject.toml
git commit -m "feat(build): Makefile, README, sdist/wheel excludes for web"
```

---

## Final Review Task

After all tasks pass, run the finishing workflow from superpowers:finishing-a-development-branch. Key gates:

- `uv run pytest` — all green
- `cd web && npm test && npm run lint && npm run build` — all green
- Manual smoke test passed in Task 18 Step 6
- No `web_dist/` committed to git (it's gitignored; built by CI or `make`)

Create PR from the branch with a summary referencing this plan and the spec.
