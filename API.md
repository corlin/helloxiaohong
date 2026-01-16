# HelloXiaohong API Documentation

The system exposes a RESTful API for managing accounts, content, schedules, and logs.

Base URL: `http://localhost:3000/api`

---

## 👥 Accounts (账号管理)

### Get All Accounts
Retrieves a list of all accounts.
- **GET** `/accounts`
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "nickname": "My Account",
        "status": "active",
        "isLoggedIn": true
        ...
      }
    ]
  }
  ```

### Get Account
Retrieves details for a specific account.
- **GET** `/accounts/:id`

### Login (Add Account)
Initiates a QR code login process.
- **POST** `/accounts/login`
- **Response**: `200 OK` (Async process, check WebSocket for QR code)
  ```json
  {
    "success": true,
    "data": { "accountId": 12, "message": "..." }
  }
  ```

### Refresh Status
Checks if the account cookie is still valid.
- **POST** `/accounts/:id/refresh`

### Delete Account
- **DELETE** `/accounts/:id`

---

## 📝 Contents (内容管理)

### Get All Contents
- **GET** `/contents`
- **Query Params**:
  - `status` (optional): Filter by status (`draft`, `scheduled`, `published`, `failed`)

### Get Content
- **GET** `/contents/:id`

### Create Content
- **POST** `/contents`
- **Body**:
  ```json
  {
    "title": "My Post Title",
    "body": "Post description...",
    "type": "image" | "video",
    "mediaPaths": ["path/to/img1.jpg"],
    "tags": ["tag1", "tag2"],
    "location": "Optional Location"
  }
  ```

### Update Content
- **PUT** `/contents/:id`
- **Body**: Same as Create.

### Delete Content
- **DELETE** `/contents/:id`

### Upload Media
- **POST** `/contents/upload`
- **Body**: `multipart/form-data` with key `files`

---

## 📅 Schedules (发布计划)

### Get All Schedules
- **GET** `/schedules`
- **Query Params**: `status` (optional)

### Get Schedule
- **GET** `/schedules/:id`

### Create Schedule
- **POST** `/schedules`
- **Body**:
  ```json
  {
    "contentId": 1,
    "accountId": 1,
    "scheduledAt": "2026-06-01T12:00:00"
  }
  ```

### Run Schedule Immediately
Forces a pending (or failed) schedule to run now.
- **POST** `/schedules/:id/run`

### Retry Schedule
Resets a failed or cancelled schedule to 'pending' and executes it immediately.
- **POST** `/schedules/:id/retry`

### Cancel Schedule
- **DELETE** `/schedules/:id`

---

## 📊 Logs & Stats (日志与统计)

### Get Logs
- **GET** `/logs`
- **Query Params**: `limit` (default 100)

### Get Schedule Logs
- **GET** `/logs/schedule/:id`

### Get Dashboard Stats
- **GET** `/logs/stats`
- **Response**: Returns counts for accounts, contents, schedules, and daily publish stats.

### Cleanup
Deletes all logs and historical schedule data.
- **DELETE** `/logs/cleanup`
