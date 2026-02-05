# Traefik Demo: Auth & User Microservices

This project demonstrates a simple microservices setup using Traefik as a reverse proxy, PostgreSQL as a shared database, and two Node.js services:

- **auth-service** – handles user registration, login, and JWT token verification
- **user-service** – exposes a `GET /me` endpoint that returns the current user profile using the JWT from `auth-service`

Docker Compose is used for local orchestration, and a GitHub Actions workflow builds and pushes Docker images, then deploys to an EC2 instance.

---

## Architecture

**Components**

- **Traefik**
  - Image: `traefik:v3.6`
  - Listens on ports **80** (HTTP) and **8080** (Traefik dashboard)
  - Auto-discovers Docker services via labels
  - Routes based on hostnames like `auth-service.<EC2_HOST>.traefik.me` and `user-service.<EC2_HOST>.traefik.me`

- **PostgreSQL**
  - Image: `postgres:15`
  - Exposed on `5432`
  - Credentials and DB name are driven by environment variables
  - Shared by both `auth-service` and `user-service`

- **auth-service**
  - Node.js + Express
  - Connects to Postgres using `pg`
  - Exposed internally on port **4000**
  - Routes:
    - `GET /health` – health check
    - `POST /register` – create a user with `email` and `password`
    - `POST /login` – authenticate and issue a JWT
    - `GET /verify` – verify a JWT and return decoded user info
  - Uses `JWT_SECRET` from environment variables

- **auth-migration** (one-off task)
  - Runs `npm run migrate` in `auth-service`
  - Waits for Postgres to be healthy
  - Initializes DB schema and inserts a test user (`test@example.com` / `password`)

- **user-service**
  - Node.js + Express
  - Connects to the same Postgres DB
  - Exposed internally on port **4001**
  - Routes:
    - `GET /health` – health check
    - `GET /me` – returns the current user's profile based on a JWT
  - Calls `auth-service`'s `/verify` endpoint to validate tokens

---

## Repository Structure

```text
.
├── docker-compose.yml
├── services
│   ├── auth-service
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src
│   │       ├── db.js
│   │       ├── index.js
│   │       └── initDb.js
│   └── user-service
│       ├── Dockerfile
│       ├── package.json
│       └── src
│           ├── db.js
│           └── index.js
└── .github
    └── workflows
        └── deploy.yml
```

---

## Environment Variables

The stack relies on the following environment variables:

- **Global / docker-compose**
  - `DOCKER_USERNAME` – Docker Hub username used for images
  - `DB_PASSWORD` – password for the Postgres `postgres` user
  - `EC2_HOST` – hostname of the EC2 instance, used in Traefik router rules

- **Postgres**
  - `POSTGRES_USER` – defaults to `postgres` in `docker-compose.yml`
  - `POSTGRES_PASSWORD` – sourced from `DB_PASSWORD`
  - `POSTGRES_DB` – defaults to `postgres`

- **auth-service**
  - `DB_HOST` – database hostname (e.g. `postgres`)
  - `DB_PORT` – database port (e.g. `5432`)
  - `DB_USER` – database username (e.g. `postgres`)
  - `DB_PASSWORD` – database password
  - `DB_NAME` – database name (e.g. `postgres`)
  - `JWT_SECRET` – secret used to sign and verify JWTs
  - `PORT` – service port (default `4000`)

- **user-service**
  - `DB_HOST` – database hostname
  - `DB_PORT` – database port
  - `DB_USER` – database username
  - `DB_PASSWORD` – database password
  - `DB_NAME` – database name
  - `AUTH_SERVICE_URL` – base URL for `auth-service` (defaults to `http://auth-service:4000`)
  - `PORT` – service port (default `4001`)

For GitHub Actions / deployment, additional secrets are required (see [CI/CD](#cicd--deployment)).

---

## Running Locally with Docker Compose

### 1. Prerequisites

- Docker & Docker Compose installed
- Docker Hub account (for remote deployment; not strictly required for local-only dev)

### 2. Set environment variables

Create a `.env` file in the project root (or export variables in your shell):

```env
DOCKER_USERNAME=<your-dockerhub-username>
DB_PASSWORD=<strong-db-password>
EC2_HOST=localhost
```

> Note: `EC2_HOST` is only needed for Traefik host rules. For purely local testing you can set it to `localhost` and use `*.traefik.me` which resolves to `127.0.0.1`.

### 3. Start the stack

From the project root:

```bash
docker-compose up -d
```

Docker Compose will:

- Start Postgres and wait until it is healthy
- Run `auth-migration` to initialize the DB and create a test user
- Start `auth-service` and `user-service`
- Start Traefik and expose ports `80` and `8080`

### 4. Verify services

- Traefik dashboard: `http://localhost:8080`
- Auth service health: `http://localhost/health` via Traefik host rules or directly at container network if you port-map it yourself
- User service health: `http://localhost/health` via Traefik host rules or directly at container network

> Exact external URLs depend on how you configure DNS/hosts for `*.traefik.me` and `EC2_HOST`. In the default setup, Traefik routes based on hostnames like `auth-service.<EC2_HOST>.traefik.me`.

---

## API Usage

### Auth Service

Base URL (inside Docker network): `http://auth-service:4000`

- **POST /register**
  - Body (JSON):
    ```json
    { "email": "user@example.com", "password": "password" }
    ```
  - Responses:
    - `201 Created` with `{ message, user }`
    - `400 Bad Request` if email/password missing
    - `409 Conflict` if user already exists

- **POST /login**
  - Body (JSON):
    ```json
    { "email": "user@example.com", "password": "password" }
    ```
  - Responses:
    - `200 OK` with `{ token }`
    - `400 Bad Request` if email/password missing
    - `401 Unauthorized` if credentials invalid

- **GET /verify**
  - Headers:
    - `Authorization: Bearer <JWT>`
  - Responses:
    - `200 OK` with `{ valid: true, user: { userId, email } }`
    - `401 Unauthorized` with details if token is missing, invalid, or expired

### User Service

Base URL (inside Docker network): `http://user-service:4001`

- **GET /me**
  - Headers:
    - `Authorization: Bearer <JWT-from-auth-service>`
  - Behavior:
    - Calls `auth-service /verify` to validate token
    - Fetches user record from Postgres
  - Responses:
    - `200 OK` with `{ id, email }`
    - `401 Unauthorized` if token missing or invalid
    - `500 Internal Server Error` for unexpected failures

---

## CI/CD & Deployment

GitHub Actions workflow: `.github/workflows/deploy.yml`.

On every push to `main`:

- **Build & push Docker images**
  - Builds `services/auth-service` and `services/user-service`
  - Tags each image as:
    - `DOCKER_USERNAME/<service>:latest`
    - `DOCKER_USERNAME/<service>:<GITHUB_SHA>`
  - Pushes both tags to Docker Hub

- **Deploy to EC2**
  - Connects to an EC2 instance over SSH
  - Runs:
    - `cd traefik-test`
    - `git pull origin main`
    - `docker-compose pull`
    - `docker-compose up -d`

### Required GitHub Secrets

- `DOCKER_USERNAME` – Docker Hub username
- `DOCKER_PASSWORD` – Docker Hub access token/password
- `EC2_HOST` – EC2 public hostname or IP
- `EC2_USER` – SSH username for EC2
- `EC2_SSH_KEY` – private SSH key for EC2 access

On the EC2 instance, ensure:

- The repository is cloned at `~/traefik-test` (or the directory used in the workflow)
- A compatible `docker-compose.yml` is present (this repo's file)
- Environment variables / `.env` are configured for DB and service secrets

---

## Development Notes

- Both services are simple Express apps using `pg` for Postgres access.
- Passwords are stored in plaintext in this demo. Do **not** use this as-is in production; always hash passwords and enforce proper security.
- JWT secret management should use secure secret storage in real deployments (e.g. AWS SSM, Secrets Manager, Vault).

This project is intended as a **demo** for Traefik + Docker + Node.js microservices and a basic CI/CD pipeline to EC2.
