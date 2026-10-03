.PHONY: docker-up docker-down seed-db logs
docker-up:
	docker compose up -d --build
docker-down:
	docker compose down
seed-db:
	docker compose exec -T postgres psql -U labproctor -d labproctor -f /docker-entrypoint-initdb.d/000002_seed_data.up.sql
logs:
	docker compose logs -f server worker
