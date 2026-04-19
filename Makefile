.PHONY: build-web install-web test-web lint-web dev-web dev-backend build test test-backend test-frontend coverage check-upstream

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
	uv run icloudpd-web --data-dir ./.dev-data --host 127.0.0.1 --port 8000

build: build-web
	uv build

test: test-backend test-frontend

test-backend:
	uv run pytest -q

test-frontend:
	cd web && npm run -s test -- --run

coverage:
	uv run pytest --cov-report=term --cov-report=html:.coverage-html

check-upstream:
	uv run python scripts/check_upstream.py
