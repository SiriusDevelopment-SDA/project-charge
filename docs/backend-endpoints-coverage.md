# Backend endpoint coverage (frontend usage + swagger)

Generated on: 2026-03-08

## Summary
- Total endpoints in backend controllers: 24
- Endpoints used by frontend: 16
- Endpoints not used by frontend: 8
- Swagger status after refactor: all mapped controllers now have `@ApiTags` + route operation/body/query/param decorators.

## Not used by frontend
1. `POST /auth/agents`
2. `POST /categories`
3. `GET /categories/:id`
4. `PUT /categories/:id`
5. `DELETE /categories/:id`
6. `POST /templates/create`
7. `PATCH /campaigns/:id/toggle-status`
8. `GET /campaigns/:id`

## Full map
| Method | Endpoint | Backend | Used in frontend | Frontend refs |
|---|---|---|---|---|
| POST | `/auth/login` | `backend/src/auth/auth.controller.ts` | Yes | `frontend/src/services/auth/auth.service.ts:42,54` |
| POST | `/auth/embed-login` | `backend/src/auth/auth.controller.ts` | Yes | `frontend/src/services/auth/auth.service.ts:48` |
| POST | `/auth/agents` | `backend/src/auth/auth.controller.ts` | No | - |
| GET | `/auth/me` | `backend/src/auth/auth.controller.ts` | Yes | `frontend/src/services/auth/auth.service.ts:63` |
| POST | `/clients/search` | `backend/src/clients/app.controllers.clients.ts` | Yes | `frontend/src/services/client/client.service.ts:17` |
| POST | `/categories` | `backend/src/category/category.controller.ts` | No | - |
| GET | `/categories` | `backend/src/category/category.controller.ts` | Yes | `frontend/src/services/campaign/campaign.service.ts:35` |
| GET | `/categories/:id` | `backend/src/category/category.controller.ts` | No | - |
| PUT | `/categories/:id` | `backend/src/category/category.controller.ts` | No | - |
| DELETE | `/categories/:id` | `backend/src/category/category.controller.ts` | No | - |
| POST | `/invoices/search` | `backend/src/invoices/controllers/invoicesController.ts` | Yes | `frontend/src/services/client/client.service.ts:21` |
| POST | `/services` | `backend/src/services/app.controller.services.ts` | Yes | `frontend/src/services/client/client.service.ts:27` |
| POST | `/templates/search` | `backend/src/templates/app.controllers.templates.ts` | Yes | `frontend/src/hooks/controller/templates/useTemplatesController.ts:19` |
| POST | `/templates/send` | `backend/src/templates/app.controllers.templates.ts` | Yes | `frontend/src/hooks/controller/dispatch/useDispatchTemplateController.ts:57` |
| POST | `/templates/reports/search` | `backend/src/templates/app.controllers.templates.ts` | Yes | `frontend/src/hooks/controller/history/useHistoricoController.ts:17` |
| POST | `/templates/delete` | `backend/src/templates/app.controllers.templates.ts` | Yes | `frontend/src/hooks/controller/templates/useTemplatesController.ts:64` |
| POST | `/templates/create` | `backend/src/templates/app.controllers.templates.ts` | No | - |
| POST | `/campaigns/create` | `backend/src/campanhas/campanhas.controller.ts` | Yes | `frontend/src/services/campaign/campaign.service.ts:27` |
| GET | `/campaigns` | `backend/src/campanhas/campanhas.controller.ts` | Yes | `frontend/src/services/campaign/campaign.service.ts:22` |
| GET | `/campaigns/metrics` | `backend/src/campanhas/campanhas.controller.ts` | Yes | `frontend/src/services/campaign/campaign.service.ts:46` |
| PATCH | `/campaigns/:id/toggle-status` | `backend/src/campanhas/campanhas.controller.ts` | No | - |
| PATCH | `/campaigns/:id` | `backend/src/campanhas/campanhas.controller.ts` | Yes | `frontend/src/services/campaign/campaign.service.ts:31` |
| GET | `/campaigns/:id` | `backend/src/campanhas/campanhas.controller.ts` | No | - |
| DELETE | `/campaigns/:id` | `backend/src/campanhas/campanhas.controller.ts` | Yes | `frontend/src/services/campaign/campaign.service.ts:40` |

## Swagger adjustments applied now
- Added/expanded decorators in controllers:
  - `backend/src/auth/auth.controller.ts`
  - `backend/src/campanhas/campanhas.controller.ts`
  - `backend/src/category/category.controller.ts`
  - `backend/src/templates/app.controllers.templates.ts`
  - `backend/src/clients/app.controllers.clients.ts`
  - `backend/src/services/app.controller.services.ts`
  - `backend/src/invoices/controllers/invoicesController.ts`
- Added DTO field docs with `@ApiProperty`:
  - `backend/src/auth/dto/auth.dto.ts`
  - `backend/src/category/dto/create-category.dto.ts`
  - `backend/src/campanhas/dto/create-campanhas.dto.ts`

## Validation
- Backend build: `npm run build` passed.
- Frontend type-check: `npx tsc --noEmit` passed.

