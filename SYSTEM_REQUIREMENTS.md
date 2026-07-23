# System Requirements — Chat Push Notification Server (Performance Improvement Project)

## 1. Overview & Goal

This project focuses on **improving the performance of a single server instance** — not through infrastructure (scale-up / scale-out), but through in-application optimization.

- **Scale-out is completely out of scope.** Assume exactly one running server instance.
- Any technology may be used **inside** the server, but **external components must not be changed or added** (e.g., adding Redis is not allowed).
  - If there is a spot where introducing Redis would clearly help, do **not** implement it — instead, document *where* it would help and *why* it would improve performance.
- The **database tables are fixed**. Queries may be written freely, **except index hints are not allowed**.
- **Low memory footprint is required.** Because multiple backend servers are often run via Docker on a single machine, exhausting host resources can crash the machine itself.
  - **Target: memory usage under 100 MB.** If this is unclear/hard to reach, raise it for discussion.

## 2. Servers to Build

### 2.1 Chat Push Notification Server (the system under test)

A chat push-notification broadcasting server.

- **No WebSocket connections** — only HTTP REST requests.
- When a user sends a chat, the server stores the chat and sends a push notification to **all users in that chat room**.
- The server that *actually* delivers push notifications is assumed to be a separate server (the **Fake Push Server**). This server is effectively a **broadcaster**.
- The server returns the **PK of the stored chat record** to the client.

Two implementations are built for comparison:

1. **Awful Chatting Push Server** — the naive baseline.
   - **Synchronous** server built with **Spring MVC + JPA**.
2. **Better Chatting Push Server** — the optimized version, using every applicable technique.
   - **Asynchronous** server built with **Spring WebFlux + jOOQ**.

> **Build status:** Only the **Fake Push Server** is already implemented (see §7). Both chat push servers above are to be built as part of this project.

### 2.2 Fake Push Server (already implemented)

The downstream push-delivery server. See §7 for details. Already coded and published as a Docker image.

## 3. Business Logic

For each incoming chat request:

1. Verify that the chat room PK from the payload refers to a **real** chat room **and** that the user actually **belongs to** that chat room.
2. Insert a **new chat record** into that chat room.
3. Retrieve **all users** in that chat room.
4. Send a **push request to every device** of the retrieved users.
   - **Measure the elapsed time** from the moment push requests start being sent until all requests to all users' devices have completed.

## 4. Authentication

- Users authenticate to the server with a **JWT token** when sending a chat.
- The JWT payload contains:
  - `iss`: `PUSH_BROADCASTING` (must be validated as an exact string match)
  - `userPk`: the user's PK
- **JWT signing keys must be an RSA key pair (key length 1024).**
  - During development, an arbitrary self-generated key pair is fine, but **during testing the key pair must be injectable from outside**.
  - Therefore, load the **RSA public key from a properties file** (external injection).
- **JWT algorithm: RS256.**
- This project is **not** about JWT authentication itself, so the JWT token issuing/creation library **may be provided by Kim Yeon-hyuk**.
  - An existing library is available; it can be imported via Gradle when needed, and a class diagram and sample code will be provided.
- On **authentication failure** (JWT verification failure), the server must still return the standard response DTO format (§5) with a **separately defined `resultCode`**.
  - Roughly **5–6 error codes** should be defined for the various failure cases (e.g., token expired, issuer mismatch, etc.).

## 5. Response DTO & Result Codes

- **All requests return HTTP status `200`.** Error state is conveyed via the `resultCode` field in the response body.
- `resultData` is defined as a **generic type** so every API returns the same response shape.
- **Success → `resultCode` = `100`.** All other (exception) cases get an appropriately assigned `resultCode`.

### 5.1 Response JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "resultCode": { "type": "integer" },
    "resultData": { "type": "object" }
  },
  "required": ["resultCode", "resultData"]
}
```

### 5.2 Example Response

```json
{
  "resultCode": 200,
  "resultData": {
    "userId": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "isActive": true
  }
}
```

### 5.3 Response DTO (example)

```java
public class GlobalResponse<T> {
    private ResultCodeEnum resultCode;
    private T resultData;
}
```

### 5.4 Error Code Rules

- The numeric assignment scheme for `resultCode` error codes is **up to the implementer** (may be left unspecified).
- However, all error codes **must be managed together as a single Enum type** (a `ResultCodeEnum` enum is recommended).

## 6. Database

- **Fixed to PostgreSQL** (syntax differences vs. MySQL/MariaDB are minimal).
- The DB connection technology is free to choose. Note: **QueryDSL integrates well with JDBC** (i.e., it is not an r2dbc connector implementation).
  - There are many selectable options — JPA (yes/no), JDBC, R2DBC, jOOQ, QueryDSL, MyBatis, etc. Research each and pick appropriately (this does **not** mean you must pick exactly one from that list).
- **A transaction must always be created**, even when the logic only inserts a record into a single table.
- **ERD:** https://www.erdcloud.com/d/JEtX9vNNsDzuLF37t

### 6.1 PostgreSQL DDL

```sql
CREATE DATABASE "chat_server"


CREATE TABLE "chat_room"
(
    "pk"          uuid NOT NULL,
    "create_date" timestamp NULL
);

CREATE TABLE "chat"
(
    "pk"           uuid NOT NULL,
    "chat_room_fk" uuid NOT NULL,
    "user_fk"      uuid NOT NULL,
    "chat_data"    text NULL,
    "create_date"  timestamp NULL
);

CREATE TABLE "api_log"
(
    "pk"           uuid NOT NULL,
    "http_method"  varchar(6) NULL,
    "uri"          varchar(64) NULL,
    "request_time" timestamp NULL,
    "ip"           varchar(64) NULL,
    "request_body" text NULL
);

CREATE TABLE "users"
(
    "pk"   uuid NOT NULL,
    "name" varchar(64) NULL
);

CREATE TABLE "user_chat_room"
(
    "user_fk"      uuid NOT NULL,
    "chat_room_fk" uuid NOT NULL
);

CREATE TABLE "device"
(
    "pk"        uuid NOT NULL,
    "user_fk"   uuid NOT NULL,
    "device_id" uuid NULL
);

ALTER TABLE "chat_room"
    ADD CONSTRAINT "PK_CHAT_ROOM" PRIMARY KEY ("pk");

ALTER TABLE "chat"
    ADD CONSTRAINT "PK_CHAT" PRIMARY KEY ("pk");

ALTER TABLE "api_log"
    ADD CONSTRAINT "PK_API_LOG" PRIMARY KEY ("pk");

ALTER TABLE "users"
    ADD CONSTRAINT "PK_USERS" PRIMARY KEY ("pk");

ALTER TABLE "user_chat_room"
    ADD CONSTRAINT "PK_USER_CHAT_ROOM" PRIMARY KEY ("user_fk", "chat_room_fk");

ALTER TABLE "device"
    ADD CONSTRAINT "PK_DEVICE" PRIMARY KEY ("pk");

ALTER TABLE "user_chat_room"
    ADD CONSTRAINT "FK_users_TO_user_chat_room_1" FOREIGN KEY ("user_fk") REFERENCES "users" ("pk");

ALTER TABLE "user_chat_room"
    ADD CONSTRAINT "FK_chat_room_TO_user_chat_room_1" FOREIGN KEY ("chat_room_fk") REFERENCES "chat_room" ("pk");
```

## 7. Fake Push Server

The downstream push-delivery server, **already implemented and published as a Docker image**.

- Sending a push notification **always takes 0.5s** (the response arrives 0.5s later).
- There is a **5% chance of failure**. The chat push server must continue its logic regardless of push success/failure.

### 7.1 Docker

- **Docker Hub:** https://hub.docker.com/r/yeonhyukkim/fake-push-server

```shell
docker pull yeonhyukkim/fake-push-server:latest
```

- **Internal server port: 8090.** When calling the server from another Docker network, port-forwarding to the container's internal port `8090` is required.
- The image is built and published as a **multi-platform image** (via GitHub Actions `matrix` builds + `docker manifest`), so consumers pull a single image name/tag and automatically get the image matching their architecture (macOS Intel and Apple Silicon both supported; Windows not verified).

### 7.2 API Specification

**Request**

- **URI:** `/api/push`
- **Method:** `POST`
- **Header:** none required
- **Body (`application/json`):**

| Field      | Type         | Required | Description             |
|------------|--------------|----------|-------------------------|
| `deviceId` | String(UUID) | Y        | Device ID in UUID form  |

**Response (`application/json`)**

| Field        | Type       | Required | Description        |
|--------------|------------|----------|--------------------|
| `resultCode` | Int        | Y        | Result code        |
| `resultData` | ResultData | Y        | Result data        |

**ResultData**

| Field      | Type         | Required | Description                          |
|------------|--------------|----------|--------------------------------------|
| `message`  | BooleanEnum  | Y        | `"Success"` on success, `"Failed"` on failure |
| `deviceId` | String(UUID) | Y        | Device ID in UUID form               |

**Example — Request**

```json
{
  "deviceId": "756bf62c-12ac-4285-8f53-33c35815552a"
}
```

**Example — Response**

```json
{
  "resultCode": 100,
  "resultData": {
    "message": "Success",
    "deviceId": "756bf62c-12ac-4285-8f53-33c35815552a"
  }
}
```

**Result Codes**

- `100`: Success
- `-1`: Failed

## 8. Logging

Every incoming request must be logged.

- Log **requests only** (no response logging).
  - **Exclude** the `Authorization` request header.
  - Log: **HTTP method, URI, request time, request IP, request body** (ignore `GET` requests).
- Logs must be written **both to the DB and to a file**.
- If DB or file logging **fails, the user's request still proceeds normally**.
- When an error occurs during a request to the push server, or an error occurs within the server itself, print the **error call stack to a separate file**.
  - Server-internal errors — e.g., requesting with a non-existent chat room PK — should simply print the **call stack** (location of the error) to the error log file.
    - This does **not** mean manually extracting/printing the class name and method name on each error.
- **Two log files are produced:**
  - `server.log` — the Spring Boot server's own logs and API logs.
  - `error.log` — errors occurring within the server.
- **Anticipated error points must all be thought through before coding.**

## 9. Server Startup & Update

- Since scale-out is not considered, assume a **single** operational server.
- Docker images may need updating (e.g., feature additions), which is affected by **server boot time**.
- During a **2-minute test**, at around the **1-minute mark the server will be restarted** (stopped and started) to observe the **request error rate**.
- Independent of the Awful-vs-Better comparison, **server boot time must not exceed 5 seconds**.
  - Reduce boot time as much as possible.

## 10. Performance Testing

- Tests will run against **resource-limited Docker containers**, load-tested with **k6**.
  - **Expected test server resources: 1 vCPU, 2 GB RAM.**
- **Memory usage target: under 100 MB** (see §1).
- **Boot time target: under 5 seconds** (see §9).

---

## Appendix: Requirements Summary

| Area              | Requirement |
|-------------------|-------------|
| Scope             | Single-instance, in-app performance only; no scale-out |
| External deps     | No new external components (no Redis, etc.) |
| DB                | PostgreSQL, fixed tables, no index hints, always use transactions |
| Auth              | JWT, RS256, RSA-1024, public key from properties, `iss=PUSH_BROADCASTING`, `userPk` |
| Response          | HTTP 200 always; `resultCode` for errors; success = `100`; generic `resultData`; `ResultCodeEnum` |
| Logging           | Request-only, to DB + file, non-blocking on failure; `server.log` + `error.log` |
| Boot time         | ≤ 5 seconds |
| Memory            | < 100 MB target |
| Test tool         | **k6** |
| Test resources    | 1 vCPU, 2 GB RAM (Docker) |
| Sync server       | **Awful Chatting Push Server** — Spring MVC + JPA |
| Async server      | **Better Chatting Push Server** — Spring WebFlux + jOOQ |
| Fake Push Server  | Already implemented; `POST /api/push`, port 8090, 0.5s latency, 5% failure |
