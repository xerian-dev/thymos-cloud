import { createElement } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/layout/admin-layout";
import { LoginScreen } from "@/features/auth/login-screen";
import { AccountsPage } from "@/features/accounts/accounts-page";
import { EmployeesPage } from "@/features/employees/employees-page";
import { ItemsPage } from "@/features/inventory/items-page";
import { HelpPage } from "@/features/help/help-page";
import { SalesPage } from "@/features/sales/sales-page";

/**
 * Application route configuration.
 * Public routes: /login
 * Protected routes (require auth): /inventory, /help
 * Default redirect: / → /inventory
 */
export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginScreen,
  },
  {
    Component: AuthGuard,
    children: [
      {
        Component: AdminLayout,
        children: [
          {
            index: true,
            element: createElement(Navigate, {
              to: "/inventory",
              replace: true,
            }),
          },
          {
            path: "inventory",
            Component: ItemsPage,
          },
          {
            path: "accounts",
            Component: AccountsPage,
          },
          {
            path: "employees",
            Component: EmployeesPage,
          },
          {
            path: "sales",
            Component: SalesPage,
          },
          {
            path: "help",
            Component: HelpPage,
          },
        ],
      },
    ],
  },
]);
