# OmniKès

A **Local-First** Point of Sale (POS) system with optional Cloud services and optional Online Store.

## Vision

OmniKès is designed to operate 100% locally without constant Internet dependency, with Cloud services and an Online Store as optional enhancements. The system supports multi-tenant, multi-store, multi-user operations with internationalization (multi-currency, configurable taxation).

## Architecture Principles

- **Local-First**: Core POS functions work without Internet
- **Cloud-Optional**: Cloud services are add-ons, not requirements
- **Online Store-Optional**: E-commerce is a separate module
- **Modular**: Each business domain is isolated
- **International**: Multi-country, multi-currency support
- **Hardware-Abstracted**: Device independence
- **Sync-Ready**: Prepared for offline/online synchronization

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, TailwindCSS 4
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (via Docker)
- **Validation**: Zod
- **Testing**: Vitest (unit), Playwright (E2E)
- **PWA**: next-pwa for offline capability

## Getting Started

### Prerequisites

- Node.js 18+
- Docker Desktop (for PostgreSQL)
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Start PostgreSQL with Docker:
   ```bash
   docker-compose up -d
   ```

5. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

6. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

7. Start the development server:
   ```bash
   npm run dev
   ```

8. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
omnikes/
├── prisma/              # Database schema and migrations
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── api/        # API routes
│   │   └── (pages)     # UI pages
│   ├── components/     # Reusable components
│   │   └── ui/         # UI components (shadcn-style)
│   ├── core/           # Core types and interfaces
│   │   ├── types/      # TypeScript type definitions
│   │   └── hardware/   # Hardware abstraction layer
│   ├── lib/            # Utility libraries
│   │   ├── prisma.ts   # Prisma client
│   │   └── validation.ts # Zod schemas
│   └── tests/          # Unit tests
├── e2e/                # E2E tests (Playwright)
├── docs/               # Documentation
└── docker-compose.yml  # Docker services
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npx prisma studio` - Open Prisma Studio
- `npx prisma migrate dev` - Create and run migrations
- `npx vitest` - Run unit tests
- `npx playwright test` - Run E2E tests

## API Endpoints

### Health Check

```
GET /api/health
```

Returns the system health status including database connectivity.

## Database Schema

The initial schema includes:

- **Organization**: Multi-tenant support
- **Store**: Multi-store per organization
- **User**: Multi-user with RBAC
- **Role**: Role definitions
- **Permission**: Granular permissions
- **Session**: Authentication sessions
- **AuditLog**: Audit trail
- **TaxConfiguration**: International tax support
- **Currency**: Multi-currency support
- **Locale**: Internationalization

See `prisma/schema.prisma` for the complete schema.

## Phase Status

**Current Phase**: Phase 0 - Foundation 

Phase 0 establishes the technical foundation:
- Project initialized with Next.js
- TypeScript configured
- Database schema designed
- Modular structure created
- Health check API implemented
- Design system foundation
- PWA configured
- Hardware abstraction layer defined
- Test infrastructure set up
- Documentation created

## Next Steps

After Phase 0 completion, the following modules will be developed:

1. **Module 0 - Foundation**: Authentication, authorization, session management
2. **Module 1 - Organization**: Organization management
3. **Module 2 - Stores**: Store management
4. **Module 3 - Users/Roles/Permissions**: RBAC implementation
5. **Module 4 - Products/ProductVariants**: Product catalog
6. **Module 5 - Inventory**: Inventory management
7. **Module 6 - Suppliers/Purchases**: Supply chain
8. **Module 7 - Cash Management**: Cash operations
9. **Module 8 - POS/Sales**: Point of Sale
10. **Module 9 - Payments**: Payment processing
11. **Module 10 - Customers**: Customer management
12. **Module 11 - Online Store**: E-commerce (OPTIONAL)
13. **Module 12 - Sync/Cloud**: Cloud synchronization (OPTIONAL)

## License

Proprietary - All rights reserved

## Support

For questions or issues, please refer to the project documentation in the `docs/` directory.
