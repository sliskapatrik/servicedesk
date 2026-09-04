# ServiceDesk

A full-stack help desk and ticket management system built as a portfolio project with **Node.js, Express, MySQL/MariaDB, vanilla JavaScript, HTML and CSS**.

ServiceDesk provides a complete workflow for support teams, technicians and customers: ticket creation, assignment, SLA handling, comments, internal notes, attachments, notifications, knowledge base, reporting, productivity tools, role-based dashboards and administration.

---

## Overview

ServiceDesk is designed to simulate a realistic internal or customer-facing IT support system.

The application supports three roles:

- **Admin**
- **Technician**
- **Customer**

Each role receives a different interface, permissions and workflow.

The project focuses on:

- full-stack application architecture
- relational database design
- REST API development
- authentication and authorization
- role-based access control
- ticket lifecycle management
- SLA tracking
- audit logging
- reporting and analytics
- secure file uploads
- production-oriented validation and error handling

---

# Features

## Authentication

- JWT authentication
- bcrypt password hashing
- protected API endpoints
- role-based authorization
- session expiration
- automatic logout for invalid or expired sessions
- active / inactive user accounts
- configurable minimum password length
- configurable session duration

---

# Roles

## Admin

Administrators have complete access to the ServiceDesk system.

Admin capabilities include:

- view all tickets
- create tickets
- edit tickets
- assign technicians
- change ticket status
- change priority
- configure SLA deadlines
- delete tickets
- manage customers
- manage users
- create Technician accounts
- create Customer accounts
- activate / deactivate users
- reset passwords
- manage ticket categories
- manage tags
- manage Knowledge Base
- manage canned replies
- manage ticket templates
- view reports and analytics
- manage application settings
- configure SLA rules
- view system overview
- view configuration audit history

---

## Technician

Technicians work with support tickets assigned to them or available in the support queue.

Technician capabilities include:

- view assigned tickets
- view unassigned tickets
- take ownership of a ticket
- update ticket status
- update ticket priority
- add public replies
- add internal notes
- upload attachments
- use canned replies
- use ticket templates
- watch tickets
- access internal Knowledge Base articles
- link Knowledge Base articles to tickets
- use saved filters
- use ticket queues
- use bulk actions
- receive notifications
- view workload information

---

## Customer

Customers have a restricted support portal.

Customer capabilities include:

- view only their own tickets
- create new tickets when enabled by Admin
- reply to their tickets
- upload attachments
- view public Knowledge Base articles
- view Knowledge Base articles linked to their tickets
- receive ticket notifications
- track ticket status and SLA information

Customers cannot access:

- internal notes
- internal Knowledge Base articles
- admin settings
- other customers
- other users
- other customers' tickets

---

# Ticket Management

Tickets are the core of ServiceDesk.

Each ticket supports:

- human-readable ticket number
- customer
- assigned technician
- title
- description
- category
- tags
- priority
- status
- SLA deadline
- created date
- updated date
- resolved date

Ticket numbers use the format:

```text
SD-000001
SD-000002
SD-000003
```

---

## Ticket Statuses

Supported ticket statuses:

```text
New
Open
In Progress
Waiting for Customer
Resolved
Closed
```

---

## Ticket Priorities

Supported priorities:

```text
Low
Medium
High
Critical
```

---

# SLA Management

ServiceDesk automatically calculates SLA deadlines according to the selected priority.

Default SLA configuration:

| Priority | Default SLA |
|---|---:|
| Critical | 2 hours |
| High | 8 hours |
| Medium | 24 hours |
| Low | 72 hours |

Administrators can change these values in **Settings**.

The system supports:

- automatic SLA calculation
- SLA recalculation when priority changes
- overdue detection
- dashboard SLA counters
- reporting on SLA compliance

---

# Ticket Categories

Tickets can be organized into configurable categories.

Default categories include:

- Hardware
- Software
- Access & Accounts
- Network
- Email & Collaboration
- Other

Categories are stored in the database and linked to tickets.

---

# Tags

Tickets can have multiple tags.

Default examples:

- VIP
- Security
- Outage
- Onboarding
- Hardware

Tags make filtering and classification easier.

---

# Ticket Detail

The ticket detail view contains the complete workflow for a support case.

It includes:

- ticket metadata
- customer information
- technician assignment
- priority
- status
- SLA
- tags
- category
- comments
- internal notes
- attachments
- Knowledge Base links
- activity history
- ticket watchers

---

# Comments and Internal Notes

ServiceDesk separates customer-facing communication from internal technician communication.

## Public reply

Visible to:

- Admin
- Technician
- Customer

## Internal note

Visible only to:

- Admin
- Technician

Customers never receive or see internal notes.

---

# Ticket History / Audit Log

Important ticket actions are stored in `ticket_history`.

Examples:

- ticket created
- technician assigned
- status changed
- priority changed
- SLA changed
- reply added
- internal note added

This provides a traceable history of support activity.

---

# Attachments

Files can be attached directly to tickets.

Attachment features:

- authenticated upload
- authenticated download
- file metadata stored in MySQL
- physical files stored on the server
- maximum upload size
- blocked executable / script file types
- access permission checks
- Admin attachment deletion

Uploaded files are stored under:

```text
backend/uploads/
```

The upload directory is excluded from Git.

---

# Customers

Customer profiles can contain:

- company
- contact name
- email
- phone
- linked Customer login account

A Customer user account can be linked to a customer/company profile.

This allows ServiceDesk to automatically restrict the customer to their own tickets.

---

# User Management

Admin users can manage ServiceDesk accounts.

Supported actions:

- create user
- edit user
- change email
- change name
- change role
- activate account
- deactivate account
- reset password
- delete user where safe

Supported roles:

```text
admin
technician
customer
```

---

# Notifications

ServiceDesk contains an in-app notification system.

Notifications can be generated when:

- a ticket is created
- a technician is assigned
- ticket status changes
- ticket priority changes
- a public reply is added
- a watched ticket changes

The notification bell displays unread notifications.

Users can mark notifications as read.

---

# Ticket Watchers

Admin and Technician users can watch important tickets.

Watching a ticket allows a user to receive notifications when activity occurs on that ticket.

---

# Knowledge Base

ServiceDesk contains a built-in Knowledge Base.

Articles support:

- title
- summary
- full article content
- category
- author
- visibility
- status

Visibility:

```text
public
internal
```

Status:

```text
draft
published
```

Public articles are available to customers.

Internal articles are restricted to staff.

Knowledge Base articles can also be linked directly to tickets.

---

# Global Search

The global search searches across ServiceDesk content.

It can find:

- tickets
- ticket numbers
- ticket titles
- Knowledge Base articles

Search results can open the matching ticket or article directly.

---

# Saved Filters

Users can save frequently used ticket filters.

Saved filter data can include:

- status
- priority
- category
- search query

Saved filters belong to the user who created them.

---

# Ticket Queues

ServiceDesk provides useful queue views.

Examples:

- All
- My Active
- Unassigned
- SLA Overdue

Queues help technicians quickly focus on relevant support work.

---

# Bulk Actions

Admin and Technician users can select multiple tickets and perform bulk actions.

Supported bulk actions include:

- change status
- change priority
- assign technician

---

# Canned Replies

Canned Replies allow support staff to reuse common responses.

Example:

```text
VPN credentials reset

Please disconnect from the VPN, remove the saved credentials and reconnect using your current company password.
```

A canned reply can be inserted directly into the ticket reply field.

---

# Ticket Templates

Ticket Templates speed up creation of recurring ticket types.

Templates can prefill:

- title
- description
- priority
- category
- tags

Example template:

```text
VPN access issue
```

---

# Reporting & Analytics

Admin users have access to the Reports section.

Available reporting includes:

- total tickets
- active tickets
- overdue tickets
- SLA compliance
- average resolution time
- tickets by status
- tickets by priority
- created vs resolved trends
- technician workload
- technician overdue workload
- recently resolved tickets
- top customers
- recent audit activity

---

# CSV Export

Administrators can export ticket data to CSV.

The export includes:

- ticket number
- customer
- technician
- priority
- status
- created date
- SLA deadline
- resolved date
- SLA state

---

# Dashboard

The dashboard changes according to the logged-in role.

## Admin dashboard

Provides an overall ServiceDesk operational view.

## Technician dashboard

Focuses on:

- assigned tickets
- active work
- unassigned tickets
- SLA issues

## Customer dashboard

Focuses on:

- customer's own tickets
- open requests
- resolved requests

---

# Admin Settings

Administrators can configure ServiceDesk directly from the application.

Settings include:

- application name
- support email
- default ticket priority
- Customer ticket creation
- session duration
- minimum password length
- SLA rules

Changes to settings are recorded in the configuration audit log.

---

# System Overview

The Settings section contains basic system information such as:

- total users
- active users
- active tickets
- overdue tickets
- database time

---

# Security

ServiceDesk includes multiple security controls.

## Authentication

- bcrypt password hashes
- JWT authentication
- protected routes
- account status checks

## Authorization

- Admin / Technician / Customer permissions
- backend permission checks
- customer ticket ownership checks

## HTTP security

- Helmet
- disabled `X-Powered-By`
- CORS configuration
- JSON body size limits
- rate limiting for login

## File security

- restricted attachment types
- file-size limit
- authenticated attachment access

## Validation

The backend validates important input such as:

- ticket title
- ticket description
- email
- password
- role
- priority
- status

---

# Error Handling

Production-readiness improvements include:

- centralized backend error handler
- API 404 handling
- request IDs
- backend connection failure handling
- expired session handling
- graceful application shutdown
- database connection checks

---

# Health Check

The backend provides a health endpoint:

```http
GET /health
```

Example response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

---

# Responsive UI

The interface is designed to work across multiple viewport sizes.

Modal dialogs:

- remain inside the viewport
- scroll internally on smaller displays
- lock background page scrolling while open

---

# Technology Stack

## Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- Fetch API
- LocalStorage for JWT token

## Backend

- Node.js
- Express.js

## Database

- MySQL / MariaDB
- mysql2

## Authentication

- JSON Web Tokens
- bcryptjs

## Security

- Helmet
- express-rate-limit
- CORS

## Uploads

- Multer

---

# Project Structure

```text
servicedesk/
│
├── index.html
│
├── README.md
│
├── .gitignore
│
├── package.json
│
│
├── css/
│   └── style.css
│
├── js/
│   └── app.js
│
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   └── README.md
│
└── backend/
    ├── server.js
    ├── database.js
    ├── authRoutes.js
    ├── createAdmin.js
    ├── package.json
    ├── .env.example
    │
    ├── middleware/
    │   └── auth.js
    │
    └── uploads/
```

`uploads/`, `.env` and `node_modules/` should not be committed to Git.

---

# Database

The complete current database structure is stored in:

```text
database/schema.sql
```

Optional demo/reference data can be stored in:

```text
database/seed.sql
```

The project intentionally uses a complete schema file instead of versioned JavaScript migration files.

---

# Database Tables

The ServiceDesk database includes tables such as:

```text
users
customers
tickets
comments
ticket_history
attachments
notifications
ticket_categories
tags
ticket_tags
knowledge_articles
ticket_articles
saved_filters
canned_replies
ticket_templates
ticket_watchers
app_settings
sla_rules
settings_audit
```

---

# Fresh Installation

## 1. Clone repository

```bash
git clone https://github.com/sliskapatrik/servicedesk.git
cd servicedesk
```

---

## 2. Create database

Create an empty database:

```sql
CREATE DATABASE servicedesk
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

---

## 3. Import schema

Import:

```text
database/schema.sql
```

into the empty `servicedesk` database.

The schema file is intended for **fresh installations**.

`CREATE TABLE IF NOT EXISTS` does not modify the structure of an existing table.

---

## 4. Configure backend

Create:

```text
backend/.env
```

based on:

```text
backend/.env.example
```

Example:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=servicedesk
DB_PASSWORD=your_database_password
DB_NAME=servicedesk

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=8h

CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
MAX_UPLOAD_MB=10
```

Never commit the real `.env` file.

---

## 5. Install backend dependencies

```bash
cd backend
npm install
```

---

## 6. Create administrator

If `createAdmin.js` is included in the project, configure the initial administrator and run:

```bash
node createAdmin.js
```

Change the temporary password immediately after first login.

---

## 7. Start backend

```bash
npm start
```

The API runs by default on:

```text
http://localhost:3000
```

unless another `PORT` environment variable is provided.

---

## 8. Start frontend

For development, the frontend can be opened using a local development server such as VS Code Live Server.

Example:

```text
http://127.0.0.1:5500
```

---

# Environment Variables

Typical backend environment variables:

| Variable | Description |
|---|---|
| `DB_HOST` | Database host |
| `DB_PORT` | MySQL/MariaDB port |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `DB_NAME` | Database name |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | JWT expiration |
| `CORS_ORIGINS` | Allowed frontend origins |
| `MAX_UPLOAD_MB` | Maximum attachment size |
| `PORT` | Backend HTTP port |

---

# API Overview

The application exposes REST endpoints under `/api`.

Major API areas include:

```text
/api/auth
/api/tickets
/api/customers
/api/users
/api/notifications
/api/knowledge
/api/categories
/api/tags
/api/saved-filters
/api/reports
/api/settings
/api/canned-replies
/api/ticket-templates
```

Exact endpoint availability depends on the logged-in role.

---

# Example Ticket Workflow

A typical workflow:

```text
Customer creates ticket
        ↓
Ticket receives SD number
        ↓
SLA deadline is calculated
        ↓
Admin / Technician reviews ticket
        ↓
Technician is assigned
        ↓
Status changes to In Progress
        ↓
Technician replies or adds internal notes
        ↓
Knowledge Base article may be linked
        ↓
Customer receives updates
        ↓
Ticket is resolved
        ↓
Resolution data appears in reporting
        ↓
Ticket is closed
```

---

# Git Workflow

Example checkpoint:

```bash
git add .
git commit -m "Release ServiceDesk v1.0"
git push
```

For the final release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

# Production Deployment

The application is prepared for deployment to a Node.js hosting platform such as Railway.

Recommended production setup:

- Node.js backend service
- MySQL service
- environment variables configured in the hosting platform
- strong JWT secret
- production CORS origin
- persistent storage for uploaded attachments

For production file uploads, persistent or external object storage is recommended because ephemeral hosting filesystems may be deleted during redeployments.

---

# Portfolio Highlights

This project demonstrates experience with:

- full-stack JavaScript development
- Node.js and Express
- MySQL relational database design
- REST API architecture
- JWT authentication
- password hashing
- role-based access control
- CRUD operations
- database relationships and foreign keys
- file uploads
- audit logging
- SLA management
- notifications
- reporting and analytics
- responsive frontend development
- security validation
- deployment preparation

---

# Final Release Checklist

Before publishing ServiceDesk v1.0:

- [ ] Test Admin login
- [ ] Test Technician login
- [ ] Test Customer login
- [ ] Create a ticket
- [ ] Assign a technician
- [ ] Change priority
- [ ] Verify automatic SLA
- [ ] Add public reply
- [ ] Add internal note
- [ ] Upload attachment
- [ ] Test notification
- [ ] Test ticket watcher
- [ ] Test Knowledge Base
- [ ] Test article linking
- [ ] Test global search
- [ ] Test saved filters
- [ ] Test ticket queues
- [ ] Test bulk actions
- [ ] Test canned replies
- [ ] Test ticket templates
- [ ] Test reports
- [ ] Test CSV export
- [ ] Test Admin Settings
- [ ] Test Customer ticket restrictions
- [ ] Test modal scrolling on smaller displays
- [ ] Test `/health`
- [ ] Confirm `.env` is ignored
- [ ] Confirm `uploads/` is ignored
- [ ] Confirm `node_modules/` is ignored
- [ ] Import `schema.sql` into a clean test database
- [ ] Verify fresh installation
- [ ] Add screenshots to README
- [ ] Deploy production version
- [ ] Create Git tag `v1.0.0`

---

# Screenshots

Recommended portfolio screenshots:

```text
screenshots/
├── 01-login.png
├── 02-admin-dashboard.png
├── 03-ticket-list.png
├── 04-ticket-detail.png
├── 05-technician-dashboard.png
├── 06-customer-dashboard.png
├── 07-knowledge-base.png
├── 08-reports.png
├── 09-users.png
└── 10-settings.png
```

After adding screenshots, they can be embedded into this README.

---

# Version

Current release:

```text
ServiceDesk v1.0.0
```

---

# Author

**Patrik Sliska**

GitHub:

```text
https://github.com/sliskapatrik
```

Repository:

```text
https://github.com/sliskapatrik/servicedesk
```

---

## License

This project was created as a portfolio and learning project.

Add a license before public reuse or distribution if required.
