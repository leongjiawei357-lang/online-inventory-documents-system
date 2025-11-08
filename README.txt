# Online Inventory & Documents Management System

## Overview
This project includes a Node.js backend (Express, MongoDB optional) and a static client. Reports are generated as XLSX and saved into `server/reports`. Documents are saved into `server/uploads`. Generated reports are automatically added to the Documents list.

## Setup (local)
1. Copy `.env.example` to `/server/.env` and fill values (MONGO_URI, SECURITY_CODE).
2. From `/server` run:
   ```bash
   npm install
   npm run dev   # nodemon
