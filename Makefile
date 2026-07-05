# hillco2 local dev. See CLAUDE.md "Local Development" for full setup.
#
# Local Postgres runs on host port 15434 (see docker-compose.dev.yml).
# Export DATABASE_URL to match before running migrate / dev-api:
#   export DATABASE_URL=postgresql://hillco2:localdev@localhost:15434/hillco2
DATABASE_URL ?= postgresql://hillco2:localdev@localhost:15434/hillco2
export DATABASE_URL

.PHONY: help dev-deps dev-deps-down dev-deps-reset migrate dev-api dev-spa seed lint test

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

dev-deps: ## Start local Postgres (detached)
	docker compose -f docker-compose.dev.yml up -d

dev-deps-down: ## Stop local Postgres (data persists)
	docker compose -f docker-compose.dev.yml down

dev-deps-reset: ## Stop local Postgres and delete its volume
	docker compose -f docker-compose.dev.yml down -v

migrate: ## Run alembic migrations to head (requires dev-deps)
	alembic upgrade head

seed: ## Load catalog + schools seed data (requires migrate)
	psql "$(DATABASE_URL)" -f seed_catalog.sql
	psql "$(DATABASE_URL)" -f seed_schools.sql

dev-api: ## Run the FastAPI server with reload (requires dev-deps + migrate)
	fastapi dev app/main.py

dev-spa: ## Run the Vite dev server (frontend)
	cd spa && npm run dev

lint: ## ruff check + format check
	ruff check .
	ruff format --check .

test: ## Run backend tests
	pytest
