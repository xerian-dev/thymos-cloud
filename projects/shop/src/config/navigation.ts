import { HelpCircle, Package, Users } from "lucide-react";
import type { ComponentType } from "react";

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
}

export const navigationItems: NavItem[] = [
  { label: "Inventory", path: "/inventory", icon: Package },
  { label: "Accounts", path: "/accounts", icon: Users },
  { label: "Help", path: "/help", icon: HelpCircle },
];
