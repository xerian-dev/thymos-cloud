import {
  Download,
  HelpCircle,
  Package,
  Receipt,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
}

export const navigationItems: NavItem[] = [
  { label: "Inventory", path: "/inventory", icon: Package },
  { label: "Accounts", path: "/accounts", icon: Users },
  { label: "Employees", path: "/employees", icon: UserCheck },
  { label: "Sales", path: "/sales", icon: Receipt },
  { label: "Imports", path: "/imports", icon: Download },
  { label: "Item Capture", path: "/item-capture", icon: Sparkles },
  { label: "Pricing", path: "/pricing/adjustments", icon: TrendingUp },
  { label: "Help", path: "/help", icon: HelpCircle },
];
