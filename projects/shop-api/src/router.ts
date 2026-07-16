import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { listAccounts } from "./routes/list-accounts.js";
import { nextNumber } from "./routes/next-number.js";
import { createAccount } from "./routes/create-account.js";
import { updateAccount } from "./routes/update-account.js";
import { deleteAccount } from "./routes/delete-account.js";
import { createItem } from "./routes/create-item.js";
import { updateItem } from "./routes/update-item.js";
import { deleteItem } from "./routes/delete-item.js";
import { listItems } from "./routes/list-items.js";
import { nextItemSku } from "./routes/next-item-sku.js";
import { presignUpload } from "./routes/presign-upload.js";
import { listSales } from "./routes/list-sales.js";
import { nextSaleNumber } from "./routes/next-sale-number.js";
import { createSale } from "./routes/create-sale.js";
import { updateSale } from "./routes/update-sale.js";
import { deleteSale } from "./routes/delete-sale.js";
import { getEmployee } from "./routes/get-employee.js";
import { batchGetEmployees } from "./routes/batch-get-employees.js";
import { jsonResponse } from "./response.js";

type RouteHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyResultV2>;

const routes: Record<string, RouteHandler> = {
  "GET /api/accounts": listAccounts,
  "GET /api/accounts/next-number": nextNumber,
  "POST /api/accounts": createAccount,
  "PUT /api/accounts/{accountNumber}": updateAccount,
  "DELETE /api/accounts/{accountNumber}": deleteAccount,
  "POST /api/items": createItem,
  "PUT /api/items/{uuid}": updateItem,
  "DELETE /api/items/{uuid}": deleteItem,
  "GET /api/items": listItems,
  "GET /api/items/next-sku": nextItemSku,
  "POST /api/items/upload-url": presignUpload,
  "GET /api/sales": listSales,
  "GET /api/sales/next-number": nextSaleNumber,
  "POST /api/sales": createSale,
  "PUT /api/sales/{uuid}": updateSale,
  "DELETE /api/sales/{uuid}": deleteSale,
  "GET /api/employees/{uuid}": getEmployee,
  "POST /api/employees/batch": batchGetEmployees,
};

export function routeRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const handler = routes[event.routeKey];
  if (!handler) {
    return Promise.resolve(jsonResponse(404, { error: "not_found" }));
  }
  return handler(event);
}
