# Auth Service API

The **auth-service** is responsible for user registration, login, and JWT verification.
It uses PostgreSQL as a backing store and issues JSON Web Tokens (JWT) that are
consumed by other services such as `user-service`.

- Runtime: Node.js + Express
- Default port: `4000`
- Database: PostgreSQL (shared with `user-service`)
- Auth: JWT in `Authorization: Bearer <token>`

---

## Base URLs

Depending on where you call the service from, different base URLs may apply.

- **Inside Docker network** (e.g. from another container):
  - `http://auth-service:4000`

- **Via Traefik on EC2 / local with traefik.me**:
  - `http://auth-service.<EC2_HOST>.traefik.me`

`EC2_HOST` is an environment variable / GitHub secret used in Traefik labels to
construct the hostname.

---

## Authentication Model

- Users register with an `email` and `password`.
- `POST /login` returns a signed JWT containing `userId` and `email`.
- Clients include the JWT in the `Authorization` header:

  ```http
  Authorization: Bearer <jwt-token>
  ```

- `GET /verify` validates the token and returns its decoded payload.

> **Security note:** In this demo, passwords are stored in plaintext and JWT
> secrets are provided via environment variables. Do not use this setup as-is in
> production.

---

## Endpoints

### `GET /health`

Simple health check for the service.

- **Request**
  - Method: `GET`
  - URL: `/health`

- **Response** (`200 OK`)

  ```json
  {
    "status": "ok",
    "service": "auth-service"
  }
  ```

---

### `POST /register`

Create a new user with an email and password.

- **Request**
  - Method: `POST`
  - URL: `/register`
  - Headers:
    - `Content-Type: application/json`
  - Body:

    ```json
    {
      "email": "user@example.com",
      "password": "password"
    }
    ```

- **Success Response** (`201 Created`)

  ```json
  {
    "message": "User created successfully",
    "user": {
      "id": 1,
      "email": "user@example.com"
    }
  }
  ```

- **Error Responses**
  - `400 Bad Request` – missing `email` or `password`:

    ```json
    { "message": "Email and password are required" }
    ```

  - `409 Conflict` – user already exists:

    ```json
    { "message": "User already exists" }
    ```

  - `500 Internal Server Error` – unexpected failure:

    ```json
    { "message": "Internal server error" }
    ```

- **Example (curl)**

  ```bash
  curl -X POST \
    http://auth-service:4000/register \
    -H "Content-Type: application/json" \
    -d '{"email":"user@example.com","password":"password"}'
  ```

---

### `POST /login`

Authenticate a user and receive a JWT.

- **Request**
  - Method: `POST`
  - URL: `/login`
  - Headers:
    - `Content-Type: application/json`
  - Body:

    ```json
    {
      "email": "user@example.com",
      "password": "password"
    }
    ```

- **Success Response** (`200 OK`)

  ```json
  {
    "token": "<jwt-token>"
  }
  ```

- **Error Responses**
  - `400 Bad Request` – missing `email` or `password`:

    ```json
    { "message": "Email and password are required" }
    ```

  - `401 Unauthorized` – invalid credentials:

    ```json
    { "message": "Invalid credentials" }
    ```

  - `500 Internal Server Error` – unexpected failure:

    ```json
    { "message": "Internal server error" }
    ```

- **Example (curl)**

  ```bash
  curl -X POST \
    http://auth-service:4000/login \
    -H "Content-Type: application/json" \
    -d '{"email":"user@example.com","password":"password"}'
  ```

---

### `GET /verify`

Validate a JWT and return its decoded user payload.

- **Request**
  - Method: `GET`
  - URL: `/verify`
  - Headers:
    - `Authorization: Bearer <jwt-token>`

- **Success Response** (`200 OK`)

  ```json
  {
    "valid": true,
    "user": {
      "userId": 1,
      "email": "user@example.com"
    }
  }
  ```

- **Error Responses**
  - `401 Unauthorized` – missing token:

    ```json
    {
      "valid": false,
      "message": "Missing token"
    }
    ```

  - `401 Unauthorized` – invalid token:

    ```json
    {
      "valid": false,
      "message": "Invalid token"
    }
    ```

  - `401 Unauthorized` – expired token:

    ```json
    {
      "valid": false,
      "message": "Token expired"
    }
    ```

  - `500 Internal Server Error` – unexpected failure:

    ```json
    {
      "valid": false,
      "message": "Internal server error"
    }
    ```

- **Example (curl)**

  ```bash
  curl -X GET \
    http://auth-service:4000/verify \
    -H "Authorization: Bearer <jwt-token>"
  ```

---

## Error Handling

- Validation errors return `4xx` codes (primarily `400`, `401`, `409`) with a
  JSON body containing a `message` and, for `/verify`, a `valid` flag.
- Unexpected runtime errors log the error server-side and return a
  `500 Internal Server Error` response with a generic JSON message.
