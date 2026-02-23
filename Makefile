.PHONY: dev test build seed clean lint migrate

dev:
	docker-compose up --build

dev-detached:
	docker-compose up --build -d

test:
	cd backend && npm test
	cd frontend && npm test

test-e2e:
	cd frontend && npx playwright test

build:
	cd backend && npm run build
	cd frontend && npm run build

seed:
	cd backend && npx prisma db seed

migrate:
	cd backend && npx prisma migrate dev

lint:
	cd backend && npm run lint
	cd frontend && npm run lint

clean:
	docker-compose down -v
	rm -rf backend/dist frontend/.next

install:
	cd backend && npm install
	cd frontend && npm install
