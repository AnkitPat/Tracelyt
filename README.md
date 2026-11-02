# Tracelyt Enterprise Observability Platform

Tracelyt is a next-generation SaaS observability platform designed for high-throughput telemetry, tracing, and AI-driven investigation.

## Architecture & Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Frontend** | Next.js 15 (TypeScript) | Dashboard and user interface |
| **Backend** | Node.js + Fastify (TypeScript) | High-performance REST ingestion & API server |
| **SDK** | TypeScript Packages (`@tracelyt/sdk`) | Client telemetry reporting |
| **Tracing** | OpenTelemetry | Distributed tracing instrumentation (`@opentelemetry/sdk-node`) |
| **Metrics / Events** | ClickHouse | High-throughput columnar store for telemetry events |
| **Configuration** | PostgreSQL | Relational DB for tenant configurations and rules |
| **AI Engine** | OpenAI API | Automated root-cause analysis and investigation engine |
| **Infrastructure** | Kubernetes | Container orchestration manifests (`infrastructure/k8s/`) |

---

## Getting Started

### 1. Backend Setup & Run
```bash
cd backend
npm install
npm run dev
```
Starts Fastify server on `http://localhost:4000`.

### 2. Frontend Setup & Run
```bash
cd frontend
npm install
npm run dev
```
Starts Next.js server on `http://localhost:3000`.
