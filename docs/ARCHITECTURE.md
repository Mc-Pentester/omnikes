# OmniKès Architecture Documentation

## Overview

OmniKès is a Local-First POS system designed for multi-tenant, multi-store, multi-user operations with optional Cloud services and optional Online Store.

## Core Principles

### 1. Local-First
- Core POS functions operate without Internet dependency
- Local database (PostgreSQL) as primary data store
- All critical operations available offline
- Cloud sync is optional, not required

### 2. Cloud-Optional
- Cloud services are add-on features
- Local mode works 100% without cloud
- Cloud provides: backup, remote dashboard, multi-store analytics
- Graceful degradation when cloud unavailable

### 3. Online Store-Optional
- E-commerce is a separate module
- Can be enabled/disabled per organization
- Shared inventory between POS and Web
- No impact on core POS when disabled

### 4. Modular Architecture
- Each business domain is isolated
- Clear module boundaries
- Independent development and testing
- Easy to enable/disable features

### 5. International
- Multi-country support
- Multi-currency support
- Configurable taxation
- Locale-specific formatting

### 6. Hardware-Abstracted
- Generic interfaces for POS peripherals
- Device independence
- Easy to add new hardware drivers
- Mock implementations for testing

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        OMNIKÈS                               │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   OMNIKÈS CORE    │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌─────▼──────┐        ┌─────▼──────┐
   │  LOCAL  │          │   CLOUD    │        │ ONLINE     │
   │  MODE   │          │ (OPTIONAL) │        │ STORE      │
   └────┬────┘          └─────┬──────┘        │ (OPTIONAL) │
        │                     │               └─────┬──────┘
        │                     │                     │
        └──────────┬──────────┘                     │
                   │                                │
        ┌──────────▼────────────────────────────────┘
        │
   ┌────▼──────────────────────────────────────────────┐
   │              SHARED DATA LAYER                      │
   │  ┌─────────────────────────────────────────────┐  │
   │  │  PostgreSQL Database                        │  │
   │  │  - Organizations                            │  │
   │  │  - Stores                                    │  │
   │  │  - Users/Roles/Permissions                   │  │
   │  │  - Products/ProductVariants                  │  │
   │  │  - Inventory                                 │  │
   │  │  - Orders                                    │  │
   │  │  - Payments                                  │  │
   │  │  - Customers                                 │  │
   │  └─────────────────────────────────────────────┘  │
   └────────────────────────────────────────────────────┘
```

## Deployment Modes

### Local Mode
- Single store or multiple stores on LAN
- Local PostgreSQL database
- No Internet required
- All POS functions available

### LAN Mode
- Multiple POS terminals connected via LAN
- Central local database server
- Real-time stock synchronization
- Shared hardware devices

### Hybrid Mode
- Local operations with optional cloud sync
- Bidirectional sync (Local ↔ Cloud)
- Offline queue with retry
- Conflict resolution

### Cloud Mode
- Cloud database as primary
- Multiple stores across locations
- Remote management dashboard
- Cloud backup and analytics

## Data Model

### Multi-Tenancy
- `Organization`: Top-level tenant
- All data scoped to organization
- Tenant isolation at database level

### Multi-Store
- `Store`: Physical locations per organization
- Store-specific configurations
- Stock tracking per store
- Users can be scoped to stores

### Multi-User with RBAC
- `User`: System users
- `Role`: Role definitions (Admin, Manager, Cashier)
- `Permission`: Granular permissions
- `UserRole`: Many-to-many relationship
- `RolePermission`: Many-to-many relationship

### Product Catalog
- `Product`: Parent entity
- `ProductVariant`: Commercial unit
- SKU and barcode at variant level
- Pricing at variant level
- Stock tracking at variant level

### Internationalization
- `Currency`: Multi-currency support
- `TaxConfiguration`: Country-specific tax rules
- `Locale`: Locale-specific formatting
- Organization-level configuration

## Hardware Abstraction Layer

### Interfaces
- `PrinterAdapter`: Receipt printers
- `CashDrawerAdapter`: Cash drawers
- `ScannerAdapter`: Barcode scanners
- `ScaleAdapter`: Scales
- `PaymentTerminalAdapter`: Payment terminals

### Benefits
- Device independence
- Easy to add new hardware
- Mock implementations for testing
- Consistent API across devices

## API Architecture

### RESTful API
- Next.js API Routes
- JSON request/response
- Standard HTTP methods
- Proper status codes

### Authentication
- Session-based authentication
- JWT tokens (future)
- Role-based access control
- Permission checks

### Endpoints
- `/api/health` - Health check
- `/api/auth/*` - Authentication
- `/api/organizations/*` - Organization management
- `/api/stores/*` - Store management
- `/api/users/*` - User management
- `/api/products/*` - Product catalog
- `/api/inventory/*` - Inventory management
- `/api/orders/*` - Order management
- `/api/payments/*` - Payment processing

## Sync Architecture (Future)

### Outbox Pattern
- All writes create sync records
- Sync processor reads outbox
- Idempotent sync operations
- Retry logic with exponential backoff

### Conflict Resolution
- Last-write-wins (simple)
- Custom conflict resolution (advanced)
- Manual conflict resolution (complex)

### Offline Queue
- Queue operations when offline
- Sync when connection restored
- Priority-based processing
- User notification on sync

## Security

### Authentication
- Password hashing (bcrypt)
- Session management
- Secure session storage
- Session expiration

### Authorization
- Role-based access control
- Permission checks
- Tenant isolation
- Store scoping

### Data Protection
- Encryption at rest (future)
- Encryption in transit (TLS)
- Audit logging
- Data retention policies

## Performance

### Database Optimization
- Indexed queries
- Connection pooling
- Query optimization
- Caching strategies

### Frontend Optimization
- Code splitting
- Lazy loading
- Image optimization
- PWA caching

### Scalability
- Horizontal scaling
- Load balancing
- Database sharding (future)
- CDN for static assets

## Monitoring

### Health Checks
- Database connectivity
- Service availability
- Resource utilization
- Error tracking

### Logging
- Structured logging
- Log levels
- Log aggregation (future)
- Alerting (future)

## Testing

### Unit Tests
- Vitest
- Component testing
- Utility function testing
- Mock implementations

### E2E Tests
- Playwright
- User flow testing
- Cross-browser testing
- Mobile testing

### Integration Tests
- API testing
- Database testing
- Hardware integration testing
