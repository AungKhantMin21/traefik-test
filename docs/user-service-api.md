# User Service API

The **user-service** exposes user-related endpoints that rely on JWTs issued by
`auth-service`. Its main responsibility is to return the authenticated user's
profile.

- Runtime: Node.js + Express
- Default port: `4001`
- Database: PostgreSQL (shared with `auth-service`)
- Auth: JWT in `Authorization: Bearer <token>` (verified via `auth-service`)

---

## Base URLs

Depending on where you call the service from, different base URLs may apply.

- **Inside Docker network** (e.g. from another container):
  - `http://user-service:4001`

- **Via Traefik on EC2 / local with traefik.me**:
  - `http://user-service.<EC2_HOST>.traefik.me`

`EC2_HOST` is an environment variable / GitHub secret used in Traefik labels to
construct the hostname.

---

## Authentication Model

- Clients first authenticate with `auth-service` (`POST /login`) to obtain a
  JWT.
- The JWT is then sent to `user-service` in the `Authorization` header:

  ```http
  Authorization: Bearer <jwt-token>
  ```

- For the `/me` endpoint, `user-service` calls `auth-service /verify` to
  validate the token and extract the `userId` and `email`.

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
    "service": "user-service"
  }
  ```

---

### `GET /me`

Return the profile of the currently authenticated user.

- **Request**
  - Method: `GET`
  - URL: `/me`
  - Headers:
    - `Authorization: Bearer <jwt-token>` (issued by `auth-service`)

- **Behavior**
  1. Extract the token from the `Authorization` header.
  2. Call `GET /verify` on `auth-service` to validate the token.
  3. Use the `userId` from the decoded token to fetch the user from Postgres.
  4. Return the user profile (id and email only).

- **Success Response** (`200 OK`)

  ```json
  {
    "id": 1,
    "email": "user@example.com"
  }
  ```

- **Error Responses**
  - `401 Unauthorized` – missing token:

    ```json
    { "message": "Missing token" }
    ```

  - `401 Unauthorized` – invalid token (or verification failed in `auth-service`):

    ```json
    { "message": "Invalid token" }
    ```

  - `500 Internal Server Error` – unexpected failure:

    ```json
    { "message": "Internal server error" }
    ```

- **Example (curl)**

  ```bash
  curl -X GET \
    http://user-service:4001/me \
    -H "Authorization: Bearer <jwt-token>"
  ```

---

## Typical Flow

1. **Register user (optional if using the seeded test user)**

   ```bash
   curl -X POST \
     http://auth-service:4000/register \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}'
   ```

2. **Log in to obtain a JWT**

   ```bash
   TOKEN=$(curl -s -X POST \
     http://auth-service:4000/login \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}' | jq -r '.token')
   ```

3. **Call `/me` with the JWT**

   ```bash
   curl -X GET \
     http://user-service:4001/me \
     -H "Authorization: Bearer $TOKEN"
   ```

---

## Error Handling

- Validation and authentication failures return `401 Unauthorized` with a
  descriptive `message`.
- Missing token is explicitly reported as `"Missing token"`.
- If `auth-service` reports a `401` when verifying the token, `user-service`
  maps that to `401` with `"Invalid token"`.
- Unexpected runtime errors log the error server-side and return a
  `500 Internal Server Error` response with a generic JSON message.
